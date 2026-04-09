function createIdGenerator() {
  let counter = 1;
  return () => `mock-${counter++}`;
}

function duplicateSensorMacError() {
  const err = new Error('sensorMac already assigned');
  err.code = 11000;
  return err;
}

function normalizeSensorMac(sensorMac) {
  return sensorMac.toUpperCase();
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function chunkReadings(readings, buckets) {
  if (readings.length <= buckets) return readings.map(reading => [reading]);

  const chunkSize = Math.ceil(readings.length / buckets);
  const chunks = [];
  for (let i = 0; i < readings.length; i += chunkSize) chunks.push(readings.slice(i, i + chunkSize));
  return chunks;
}

function aggregateHistory(readings, buckets) {
  return chunkReadings(readings, buckets).map(chunk => ({
    timestamp: new Date(average(chunk.map(reading => reading.timestamp.getTime()))),
    temperature: average(chunk.map(reading => reading.temperature)),
    humidity: average(chunk.map(reading => reading.humidity)),
    battery: chunk[chunk.length - 1].battery,
  }));
}

function createSeedLocations(makeId) {
  return [
    { _id: makeId(), name: 'Living Room', sensorMac: 'AA:BB:CC:DD:EE:01' },
    { _id: makeId(), name: 'Bedroom', sensorMac: 'AA:BB:CC:DD:EE:02' },
    { _id: makeId(), name: 'Kitchen', sensorMac: 'AA:BB:CC:DD:EE:03' },
  ];
}

function createSeedReadings(locations, now) {
  const readings = [];
  const intervalMinutes = 15;
  const steps = 96;

  locations.forEach((location, index) => {
    for (let step = 0; step < steps; step += 1) {
      const time = new Date(now.getTime() - (steps - step) * intervalMinutes * 60 * 1000);
      const offset = index * 0.8;
      readings.push({
        _id: `${location._id}-reading-${step}`,
        locationId: location._id,
        temperature: Number((20 + offset + Math.sin(step / 6) * 1.8).toFixed(1)),
        humidity: Math.round(45 + index * 6 + Math.cos(step / 7) * 8),
        battery: Math.max(55, 98 - (step % 20) - index * 4),
        rssi: -60 - index * 4,
        frameCounter: step % 256,
        timestamp: time,
      });
    }
  });

  return readings;
}

function createMockDb({ initialLocations, initialReadings, now = () => new Date() } = {}) {
  const makeId = createIdGenerator();
  const state = {
    locations: (initialLocations || createSeedLocations(makeId)).map(location => ({
      ...location,
      sensorMac: normalizeSensorMac(location.sensorMac),
    })),
    readings: [],
  };

  state.readings = (initialReadings || createSeedReadings(state.locations, now())).map(reading => ({
    _id: reading._id || makeId(),
    ...reading,
    timestamp: new Date(reading.timestamp),
  }));

  return {
    async connect() {},

    async disconnect() {},

    async listLocations() {
      return state.locations.map(location => ({ ...location }));
    },

    async createLocation({ name, sensorMac }) {
      const normalizedMac = normalizeSensorMac(sensorMac);
      if (state.locations.some(location => location.sensorMac === normalizedMac)) throw duplicateSensorMacError();

      const location = { _id: makeId(), name, sensorMac: normalizedMac };
      state.locations.push(location);
      return { ...location };
    },

    async updateLocation(id, update) {
      const location = state.locations.find(entry => entry._id === id);
      if (!location) return null;

      if (update.sensorMac) {
        const normalizedMac = normalizeSensorMac(update.sensorMac);
        const duplicate = state.locations.find(entry => entry._id !== id && entry.sensorMac === normalizedMac);
        if (duplicate) throw duplicateSensorMacError();
        location.sensorMac = normalizedMac;
      }
      if (update.name) location.name = update.name;

      return { ...location };
    },

    async deleteLocation(id) {
      const index = state.locations.findIndex(location => location._id === id);
      if (index === -1) return false;

      state.locations.splice(index, 1);
      state.readings = state.readings.filter(reading => reading.locationId !== id);
      return true;
    },

    async findLocationBySensorMac(sensorMac) {
      const location = state.locations.find(entry => entry.sensorMac === normalizeSensorMac(sensorMac));
      return location ? { ...location } : null;
    },

    async hasRecentReadingWithFrameCounter({ locationId, frameCounter, since }) {
      return state.readings.some(reading =>
        reading.locationId === locationId &&
        reading.frameCounter === frameCounter &&
        reading.timestamp >= since
      );
    },

    async createReading(reading) {
      const nextReading = {
        _id: makeId(),
        ...reading,
        timestamp: new Date(reading.timestamp),
      };
      state.readings.push(nextReading);
      return { ...nextReading };
    },

    async getCurrentReadings() {
      return state.locations.map(location => {
        const reading = state.readings
          .filter(entry => entry.locationId === location._id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        return {
          location: { ...location },
          reading: reading ? { ...reading } : null,
        };
      });
    },

    async getHistory(locationId, { hours, buckets }) {
      const since = new Date(now().getTime() - hours * 60 * 60 * 1000);
      const readings = state.readings
        .filter(reading => reading.locationId === locationId && reading.timestamp >= since)
        .sort((a, b) => a.timestamp - b.timestamp);

      return aggregateHistory(readings, buckets);
    },

    getSeedSensorMacs() {
      return state.locations.map(location => location.sensorMac);
    },
  };
}

module.exports = { createMockDb };
