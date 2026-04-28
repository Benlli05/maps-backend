const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /gps - recibe datos del ESP32 (sin auth para dispositivos)
router.post('/gps', (req, res) => {
  const { id, lat, lng, alt } = req.body;
  
  if (!id || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'id, lat, lng requeridos' });
  }

  // LOG EN TERMINAL
  console.log(`📡 [GPS IN] Carro: ${id} | Lat: ${lat} | Lng: ${lng} | Alt: ${alt || 0}`);

  try {
    // Verificar que el vehículo existe y tiene tracking habilitado
    let vehicle = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(id);
    if (!vehicle) {
      db.prepare('INSERT INTO vehicles (vehicleId, name, trackingEnabled) VALUES (?, ?, 1)').run(id, `Carro ${id}`);
      vehicle = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(id);
    }

    if (!vehicle.trackingEnabled) {
      return res.json({ status: 'ignored', reason: 'tracking deshabilitado' });
    }

    const result = db.prepare(`
      INSERT INTO positions (vehicleId, lat, lng, alt) 
      VALUES (?, ?, ?, ?)
    `).run(id, parseFloat(lat), parseFloat(lng), parseFloat(alt) || 0);

    const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(result.lastInsertRowid);

    // Emitir por WebSocket a todos los clientes conectados
    const wss = req.app.get('wss');
    if (wss) {
      const message = JSON.stringify({
        type: 'position',
        data: { vehicleId: id, lat: position.lat, lng: position.lng, alt: position.alt, timestamp: position.timestamp }
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
      });
    }

    res.json({ status: 'ok', id: position.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar posición' });
  }
});

// GET /gps/history/:vehicleId/summary - resumen de días con actividad
router.get('/gps/history/:vehicleId/summary', verifyToken, (req, res) => {
  const { vehicleId } = req.params;
  try {
    const days = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', timestamp) as rawDate,
        strftime('%d-%m-%Y', timestamp) as dateStr,
        COUNT(*) as count
      FROM positions
      WHERE vehicleId = ?
      GROUP BY rawDate
      ORDER BY rawDate DESC
      LIMIT 10
    `).all(vehicleId);
    res.json(days);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

// GET /gps/history/:vehicleId - historial de posiciones
router.get('/gps/history/:vehicleId', verifyToken, (req, res) => {
  const { vehicleId } = req.params;
  const limit = parseInt(req.query.limit) || 500;
  
  // Convert JS Date string to SQLite compatible string, or just use JS timestamps if stored as string?
  // better-sqlite3 datetime('now', '-1 day') is easier, or just let SQLite compare ISO strings.
  // CURRENT_TIMESTAMP in SQLite is 'YYYY-MM-DD HH:MM:SS' UTC. JS toISOString is 'YYYY-MM-DDTHH:MM:SS.sssZ'
  // SQLite can compare them correctly mostly, or we use datetime.
  let from = req.query.from 
    ? new Date(req.query.from).toISOString().replace('T', ' ').substring(0, 19)
    : new Date(Date.now() - 86400000).toISOString().replace('T', ' ').substring(0, 19);

  let to = req.query.to
    ? new Date(req.query.to).toISOString().replace('T', ' ').substring(0, 19)
    : new Date().toISOString().replace('T', ' ').substring(0, 19);

  try {
    const positions = db.prepare(`
      SELECT * FROM positions 
      WHERE vehicleId = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC LIMIT ?
    `).all(vehicleId, from, to, limit);
    res.json(positions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching history' });
  }
});

// GET /gps/latest - última posición de cada vehículo
router.get('/gps/latest', verifyToken, (req, res) => {
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles WHERE trackingEnabled = 1').all();
    const result = [];

    for (const v of vehicles) {
      v.trackingEnabled = !!v.trackingEnabled;
      const last = db.prepare(`
        SELECT * FROM positions 
        WHERE vehicleId = ? 
        ORDER BY timestamp DESC LIMIT 1
      `).get(v.vehicleId);
      
      result.push({ vehicle: v, position: last });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching latest positions' });
  }
});

module.exports = router;
