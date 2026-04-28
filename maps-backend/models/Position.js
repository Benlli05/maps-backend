const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  alt: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

positionSchema.index({ vehicleId: 1, timestamp: -1 });

module.exports = mongoose.model('Position', positionSchema);
