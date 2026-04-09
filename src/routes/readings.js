const express = require('express');
const {
  parseCurrentReadingsResponse,
  parseHistoryResponse,
} = require('../../shared/contracts');
const { asyncHandler } = require('./async-handler');
const { sendContract } = require('./contract-response');

function createReadingsRouter({ db, chartBuckets }) {
  const router = express.Router();

  router.get('/current', asyncHandler(async (req, res) => {
    const results = await db.getCurrentReadings(req.userContext);
    sendContract(res, { parser: parseCurrentReadingsResponse, body: results });
  }));

  router.get('/history/:locationId', asyncHandler(async (req, res) => {
    const hours = parseInt(req.query.hours, 10) || 24;
    const readings = await db.getHistory(req.userContext, req.params.locationId, { hours, buckets: chartBuckets });
    sendContract(res, { parser: parseHistoryResponse, body: readings });
  }));

  return router;
}

module.exports = createReadingsRouter;
