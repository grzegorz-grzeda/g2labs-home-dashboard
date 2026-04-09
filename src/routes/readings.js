const express = require('express');
const { asyncHandler } = require('./async-handler');

function createReadingsRouter({ db, chartBuckets }) {
  const router = express.Router();

  router.get('/current', asyncHandler(async (req, res) => {
    const results = await db.getCurrentReadings(req.userContext);
    res.json(results);
  }));

  router.get('/history/:locationId', asyncHandler(async (req, res) => {
    const hours = parseInt(req.query.hours, 10) || 24;
    const readings = await db.getHistory(req.userContext, req.params.locationId, { hours, buckets: chartBuckets });
    res.json(readings);
  }));

  return router;
}

module.exports = createReadingsRouter;
