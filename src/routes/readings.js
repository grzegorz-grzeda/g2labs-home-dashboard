const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Location = require('../models/Location');
const Reading = require('../models/Reading');

const CHART_BUCKETS = parseInt(process.env.CHART_BUCKETS) || 300;

// Current reading per location (latest)
router.get('/current', async (req, res) => {
  const locations = await Location.find().lean();
  const results = await Promise.all(
    locations.map(async loc => {
      const reading = await Reading.findOne({ locationId: loc._id }).sort({ timestamp: -1 }).lean();
      return { location: loc, reading };
    })
  );
  res.json(results);
});

// Historical readings for a location, downsampled via $bucketAuto
router.get('/history/:locationId', async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const locationId = new mongoose.Types.ObjectId(req.params.locationId);

  const readings = await Reading.aggregate([
    { $match: { locationId, timestamp: { $gte: since } } },
    { $sort: { timestamp: 1 } },
    {
      $bucketAuto: {
        groupBy: '$timestamp',
        buckets: CHART_BUCKETS,
        output: {
          timestamp:   { $avg: { $toLong: '$timestamp' } },
          temperature: { $avg: '$temperature' },
          humidity:    { $avg: '$humidity' },
          battery:     { $last: '$battery' },
        },
      },
    },
    { $addFields: { timestamp: { $toDate: '$timestamp' } } },
    { $sort: { timestamp: 1 } },
  ]);

  res.json(readings);
});

module.exports = router;
