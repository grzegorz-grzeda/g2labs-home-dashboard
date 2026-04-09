require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const locationsRouter = require('./routes/locations');
const readingsRouter = require('./routes/readings');
const MqttSubscriber = require('./mqtt/subscriber');
const { handleReading } = require('./services/readings');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());
app.use('/api/locations', locationsRouter);
app.use('/api', readingsRouter);

// MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/home-dashboard')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// MQTT
const subscriber = new MqttSubscriber({
  broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  topic:  process.env.MQTT_TOPIC  || 'atc',
});

subscriber.on('reading', reading => handleReading(reading, io));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`));
