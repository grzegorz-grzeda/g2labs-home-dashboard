const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sensorMac: { type: String, required: true, unique: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
});

module.exports = mongoose.model('Location', locationSchema);
