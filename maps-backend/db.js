const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'gps.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    vehicleId TEXT PRIMARY KEY,
    name TEXT,
    trackingEnabled INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicleId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    alt REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_positions_vehicle_timestamp 
  ON positions (vehicleId, timestamp DESC);
`);

// Migración para añadir soporte de ícono/texto por carro
try {
  db.exec('ALTER TABLE vehicles ADD COLUMN icon TEXT DEFAULT "🚒"');
} catch (err) {
  // Ignorar si la columna ya existe
}

module.exports = db;
