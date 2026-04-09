const Location = require('../models/Location');
const Reading = require('../models/Reading');

// Ignore a reading if the same locationId+frameCounter was stored within this window.
const DEDUP_WINDOW_SECONDS = 10;

// Handle a parsed ATC reading event from mqtt/subscriber.js.
// Looks up location, deduplicates, writes to DB, emits via Socket.io.
async function handleReading(reading, io) {
  const { address, rssi, temperature, humidity, battery, frameCounter } = reading;

  const location = await Location.findOne({ sensorMac: address });
  if (!location) return;

  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000);
  const exists = await Reading.exists({
    locationId: location._id,
    frameCounter,
    timestamp: { $gte: dedupSince },
  });
  if (exists) return;

  await Reading.create({ locationId: location._id, temperature, humidity, battery, rssi, frameCounter });

  io.emit('reading', {
    locationId:   location._id.toString(),
    locationName: location.name,
    temperature,
    humidity,
    battery,
    rssi,
    timestamp: new Date(),
  });
}

module.exports = { handleReading };
