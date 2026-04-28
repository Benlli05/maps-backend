const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  trackingEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
