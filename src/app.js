const express = require('express');
const createLocationsRouter = require('./routes/locations');
const createReadingsRouter = require('./routes/readings');

function createApp({ db, chartBuckets }) {
  const app = express();

  app.use(express.static('public'));
  app.use(express.json());
  app.use('/api/locations', createLocationsRouter({ db }));
  app.use('/api', createReadingsRouter({ db, chartBuckets }));

  return app;
}

module.exports = { createApp };
