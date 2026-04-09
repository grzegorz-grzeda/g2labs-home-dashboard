const DEDUP_WINDOW_SECONDS = 10;

function createReadingHandler({ db, emitReading, now = () => new Date() }) {
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

    emitReading({
      locationId: location._id.toString(),
      groupId: location.groupId?.toString?.() || String(location.groupId),
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
