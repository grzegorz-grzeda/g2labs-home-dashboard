require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Reading = require('./models/Reading');
const Location = require('./models/Location');
const locationsRouter = require('./routes/locations');
const MqttSubscriber = require('./mqtt/subscriber');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());
app.use('/api/locations', locationsRouter);

// MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/home-dashboard')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// MQTT
const DEDUP_WINDOW_SECONDS = 10;

const subscriber = new MqttSubscriber({
  broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  topic:  process.env.MQTT_TOPIC  || 'atc',
});

subscriber.on('reading', async ({ address, rssi, temperature, humidity, battery, frameCounter }) => {
  const location = await Location.findOne({ sensorMac: address });
  if (!location) return;

  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000);
  const exists = await Reading.exists({
    locationId: location._id,
    frameCounter,
    timestamp: { $gte: dedupSince },
  });
  if (exists) return;

  await Reading.create({ locationId: location._id, temperature, humidity, battery, rssi, frameCounter });

  io.emit('reading', {
    locationId:   location._id.toString(),
    locationName: location.name,
    temperature,
    humidity,
    battery,
    rssi,
    timestamp: new Date(),
  });
});

// REST API

// Current reading per location (latest)
app.get('/api/current', async (req, res) => {
  const locations = await Location.find().lean();
  const results = await Promise.all(
    locations.map(async loc => {
      const reading = await Reading.findOne({ locationId: loc._id }).sort({ timestamp: -1 }).lean();
      return { location: loc, reading };
    })
  );
  res.json(results);
});

const CHART_BUCKETS = parseInt(process.env.CHART_BUCKETS) || 300;

// Historical readings for a location, downsampled via $bucketAuto
app.get('/api/history/:locationId', async (req, res) => {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`));
