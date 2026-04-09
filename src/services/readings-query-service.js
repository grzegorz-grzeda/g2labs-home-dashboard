function createReadingsQueryService({ db, chartBuckets }) {
  return {
    getCurrentReadings(userContext) {
      return db.getCurrentReadings(userContext);
    },

    getHistory(userContext, locationId, hours) {
      return db.getHistory(userContext, locationId, { hours, buckets: chartBuckets });
    },
  };
}

module.exports = { createReadingsQueryService };
