const DEDUP_WINDOW_SECONDS = 10;

function createReadingHandler({ db, io, now = () => new Date() }) {
  return async function handleReading(reading) {
    const { address, rssi, temperature, humidity, battery, frameCounter } = reading;

    const location = await db.findLocationBySensorMac(address);
    if (!location) return;

    const dedupSince = new Date(now().getTime() - DEDUP_WINDOW_SECONDS * 1000);
    const exists = await db.hasRecentReadingWithFrameCounter({
      locationId: location._id,
      frameCounter,
      since: dedupSince,
    });
    if (exists) return;

    const timestamp = now();
    await db.createReading({
      locationId: location._id,
      temperature,
      humidity,
      battery,
      rssi,
      frameCounter,
      timestamp,
    });

    io.emit('reading', {
      locationId: location._id.toString(),
      locationName: location.name,
      temperature,
      humidity,
      battery,
      rssi,
      timestamp,
    });
  };
}

module.exports = { createReadingHandler };
