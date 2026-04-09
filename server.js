require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const Reading = require('./models/Reading');
const Location = require('./models/Location');
const locationsRouter = require('./routes/locations');

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
const mqttClient = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883');
const TOPIC = process.env.MQTT_TOPIC || 'atc';

const ATC_UUID = '0000181a-0000-1000-8000-00805f9b34fb';

function parseAtcServiceData(hex) {
  // ATC custom format: 13 bytes
  // [0-5]  MAC (6 bytes, skip)
  // [6-7]  Temperature int16 BE ÷10 °C
  // [8]    Humidity uint8 %
  // [9]    Battery level uint8 %
  // [10-11] Battery voltage uint16 BE mV
  // [12]   Frame counter uint8
  if (hex.length < 26) return null; // 13 bytes = 26 hex chars
  const buf = Buffer.from(hex, 'hex');
  const temperature  = buf.readInt16BE(6) / 10;
  const humidity     = buf.readUInt8(8);
  const battery      = buf.readUInt8(9);
  const frameCounter = buf.readUInt8(12);
  return { temperature, humidity, battery, frameCounter };
}

// Dedup window: ignore a reading if the same locationId+frameCounter
// was already stored within this many seconds (handles multiple scanners).
const DEDUP_WINDOW_SECONDS = 10;

mqttClient.on('connect', () => {
  console.log(`MQTT connected, subscribing to "${TOPIC}"`);
  mqttClient.subscribe(TOPIC);
  mqttClient.subscribe(`${TOPIC}/#`);
});

mqttClient.on('message', async (topic, payload) => {
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    console.warn('Non-JSON MQTT message on', topic);
    return;
  }

  const { address, rssi, service_data } = data;

  const hex = service_data?.[ATC_UUID];
  if (!hex) return;

  const parsed = parseAtcServiceData(hex);
  if (!parsed) return;

  // Look up location by MAC — drop silently if unassigned
  const location = await Location.findOne({ sensorMac: address.toUpperCase() });
  if (!location) return;

  const { temperature, humidity, battery, frameCounter } = parsed;

  // Deduplicate: drop if same frameCounter seen for this location within the window
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000);
  const exists = await Reading.exists({
    locationId: location._id,
    frameCounter,
    timestamp: { $gte: dedupSince },
  });
  if (exists) return;

  await Reading.create({ locationId: location._id, temperature, humidity, battery, rssi, frameCounter });

  io.emit('reading', {
    locationId: location._id.toString(),
    locationName: location.name,
    temperature,
    humidity,
    battery,
    rssi,
    timestamp: new Date(),
  });
});

mqttClient.on('error', err => console.error('MQTT error:', err));

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
