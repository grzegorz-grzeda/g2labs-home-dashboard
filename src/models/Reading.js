const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema({
  locationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  temperature:  { type: Number, required: true },
  humidity:     { type: Number, required: true },
  battery:      { type: Number },
  rssi:         { type: Number },
  frameCounter: { type: Number },
  timestamp:    { type: Date, default: Date.now, index: true },
});

readingSchema.index({ locationId: 1, timestamp: -1 });
// Used for deduplication: find recent readings with the same frame counter
readingSchema.index({ locationId: 1, frameCounter: 1, timestamp: -1 });

module.exports = mongoose.model('Reading', readingSchema);
