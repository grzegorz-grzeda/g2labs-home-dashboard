const mongoose = require('mongoose');
const Location = require('../../models/Location');
const Reading = require('../../models/Reading');

function normalizeSensorMac(sensorMac) {
  return sensorMac.toUpperCase();
}

function createMongoDb({ connectionString }) {
  return {
    async connect() {
      await mongoose.connect(connectionString);
    },

    async disconnect() {
      await mongoose.disconnect();
    },

    async listLocations() {
      return Location.find().lean();
    },

    async createLocation({ name, sensorMac }) {
      const location = await Location.create({ name, sensorMac: normalizeSensorMac(sensorMac) });
      return location.toObject();
    },

    async updateLocation(id, update) {
      const patch = {};
      if (update.name) patch.name = update.name;
      if (update.sensorMac) patch.sensorMac = normalizeSensorMac(update.sensorMac);

      const location = await Location.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
      return location ? location.toObject() : null;
    },

    async deleteLocation(id) {
      const location = await Location.findByIdAndDelete(id);
      if (!location) return false;
      await Reading.deleteMany({ locationId: id });
      return true;
    },

    async findLocationBySensorMac(sensorMac) {
      return Location.findOne({ sensorMac: normalizeSensorMac(sensorMac) }).lean();
    },

    async hasRecentReadingWithFrameCounter({ locationId, frameCounter, since }) {
      return Boolean(await Reading.exists({
        locationId,
        frameCounter,
        timestamp: { $gte: since },
      }));
    },

    async createReading(reading) {
      const doc = await Reading.create(reading);
      return doc.toObject();
    },

    async getCurrentReadings() {
      const locations = await Location.find().lean();
      return Promise.all(
        locations.map(async location => {
          const reading = await Reading.findOne({ locationId: location._id }).sort({ timestamp: -1 }).lean();
          return { location, reading };
        })
      );
    },

    async getHistory(locationId, { hours, buckets }) {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const objectId = new mongoose.Types.ObjectId(locationId);

      return Reading.aggregate([
        { $match: { locationId: objectId, timestamp: { $gte: since } } },
        { $sort: { timestamp: 1 } },
        {
          $bucketAuto: {
            groupBy: '$timestamp',
            buckets,
            output: {
              timestamp: { $avg: { $toLong: '$timestamp' } },
              temperature: { $avg: '$temperature' },
              humidity: { $avg: '$humidity' },
              battery: { $last: '$battery' },
            },
          },
        },
        { $addFields: { timestamp: { $toDate: '$timestamp' } } },
        { $sort: { timestamp: 1 } },
      ]);
    },
  };
}

module.exports = { createMongoDb };
