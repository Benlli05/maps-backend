require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

// This initializes the database, ensures tables exist
require('./db');

const gpsRoutes = require('./routes/gps');
const vehicleRoutes = require('./routes/vehicles');

const app = express();
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ server });
app.set('wss', wss);

wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');
  ws.send(JSON.stringify({ type: 'connected', message: 'Conectado al servidor GPS' }));

  ws.on('close', () => console.log('Cliente WebSocket desconectado'));
  ws.on('error', (err) => console.error('WS error:', err));
});

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4005',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'https://tv.segundapailahueque.cl',
  'https://maps.segundapailahueque.cl',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (ESP32, curl, file://, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido'));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Serve GPS frontend static files (useful for local dev)
const frontendPath = path.join(__dirname, '..', 'maps-frontend', 'public');
app.use(express.static(frontendPath));

// Routes
app.use(gpsRoutes);
app.use('/vehicles', vehicleRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', wsClients: wss.clients.size }));

const PORT = process.env.PORT || 4005;
server.listen(PORT, () => console.log(`Maps backend corriendo en puerto ${PORT} — Frontend: http://localhost:${PORT}`));
