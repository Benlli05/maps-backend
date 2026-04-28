const express = require('express');
const db = require('../db');
const { verifyToken, requireWriteAccess, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /vehicles
router.get('/', verifyToken, (req, res) => {
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    // Convert trackingEnabled back to boolean for the frontend
    vehicles.forEach(v => v.trackingEnabled = !!v.trackingEnabled);
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
});

// POST /vehicles - crear carro
router.post('/', verifyToken, requireWriteAccess, (req, res) => {
  const { vehicleId, name, icon } = req.body;
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId requerido' });

  try {
    const defaultName = name || `Carro ${vehicleId}`;
    const defaultIcon = icon || '🚒';
    db.prepare('INSERT INTO vehicles (vehicleId, name, icon, trackingEnabled) VALUES (?, ?, ?, 1)').run(vehicleId, defaultName, defaultIcon);
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(vehicleId);
    vehicle.trackingEnabled = !!vehicle.trackingEnabled;
    res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(409).json({ error: 'ID ya existe' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al crear vehículo' });
  }
});

// PUT /vehicles/:id/toggle - activar/desactivar tracking
router.put('/:vehicleId/toggle', verifyToken, requireWriteAccess, (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const newValue = vehicle.trackingEnabled ? 0 : 1;
    db.prepare('UPDATE vehicles SET trackingEnabled = ? WHERE vehicleId = ?').run(newValue, vehicleId);
    
    const updated = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(vehicleId);
    updated.trackingEnabled = !!updated.trackingEnabled;
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al modificar tracking' });
  }
});

// DELETE /vehicles/:vehicleId
router.delete('/:vehicleId', verifyToken, requireWriteAccess, (req, res) => {
  try {
    db.prepare('DELETE FROM vehicles WHERE vehicleId = ?').run(req.params.vehicleId);
    res.json({ message: 'Vehículo eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar vehículo' });
  }
});

// PUT /vehicles/:vehicleId - editar nombre e icono
router.put('/:vehicleId', verifyToken, requireWriteAccess, (req, res) => {
  const { name, icon } = req.body;
  const { vehicleId } = req.params;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    const defaultIcon = icon || '🚒';
    const info = db.prepare('UPDATE vehicles SET name = ?, icon = ? WHERE vehicleId = ?').run(name.trim(), defaultIcon, vehicleId);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    const updated = db.prepare('SELECT * FROM vehicles WHERE vehicleId = ?').get(vehicleId);
    updated.trackingEnabled = !!updated.trackingEnabled;
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar vehículo' });
  }
});

module.exports = router;
