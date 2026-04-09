require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = require('./app');
const MqttSubscriber = require('./mqtt/subscriber');
const { handleReading } = require('./services/readings');

const server = http.createServer(app);
const io = new Server(server);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/home-dashboard')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

const subscriber = new MqttSubscriber({
  broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  topic:  process.env.MQTT_TOPIC  || 'atc',
});

subscriber.on('reading', reading => handleReading(reading, io));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`));
