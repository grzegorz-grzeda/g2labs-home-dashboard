const express = require('express');
const locationsRouter = require('./routes/locations');
const readingsRouter = require('./routes/readings');

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use('/api/locations', locationsRouter);
app.use('/api', readingsRouter);

module.exports = app;
