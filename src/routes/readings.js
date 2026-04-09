const express = require('express');

function createReadingsRouter({ db, chartBuckets }) {
  const router = express.Router();

  router.get('/current', async (req, res) => {
    const results = await db.getCurrentReadings();
    res.json(results);
  });

  router.get('/history/:locationId', async (req, res) => {
    const hours = parseInt(req.query.hours, 10) || 24;
    const readings = await db.getHistory(req.params.locationId, { hours, buckets: chartBuckets });
    res.json(readings);
  });

  return router;
}

module.exports = createReadingsRouter;
