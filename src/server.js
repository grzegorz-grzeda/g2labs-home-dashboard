require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');
const { createMongoDb } = require('./adapters/db/mongo');
const { createMockDb } = require('./adapters/db/mock');
const { getConfig } = require('./config');
const MqttSubscriber = require('./mqtt/subscriber');
const MockReadingGenerator = require('./mqtt/mock-generator');
const { createReadingHandler } = require('./services/readings');

function createDb(config) {
  if (config.dbDriver === 'mock') return createMockDb();
  return createMongoDb({ connectionString: config.mongodbUri });
}

function createReadingSource(config, db) {
  if (config.readingSourceDriver === 'generator') {
    const sensorMacs = typeof db.getSeedSensorMacs === 'function' ? db.getSeedSensorMacs() : [];
    return new MockReadingGenerator({ sensorMacs, intervalMs: config.mockIntervalMs });
  }

  return new MqttSubscriber({
    broker: config.mqttBroker,
    topic: config.mqttTopic,
  });
}

async function startServer(config = getConfig()) {
  const db = createDb(config);
  const app = createApp({ db, chartBuckets: config.chartBuckets });
  const server = http.createServer(app);
  const io = new Server(server);
  const readingSource = createReadingSource(config, db);
  const handleReading = createReadingHandler({ db, io });
  const onReading = reading => {
    handleReading(reading).catch(err => console.error('Reading handling error:', err));
  };

  readingSource.on('reading', onReading);

  await db.connect();
  if (typeof readingSource.start === 'function') readingSource.start();

  await new Promise(resolve => {
    server.listen(config.port, resolve);
  });

  const sourceLabel = config.readingSourceDriver === 'generator'
    ? `mock generator (${config.mockIntervalMs} ms)`
    : `${config.mqttBroker} topic "${config.mqttTopic}"`;
  const dbLabel = config.dbDriver === 'mock' ? 'mock DB' : config.mongodbUri;
  console.log(`Dashboard running at http://localhost:${config.port}`);
  console.log(`DB: ${dbLabel}`);
  console.log(`Reading source: ${sourceLabel}`);

  return {
    app,
    io,
    server,
    db,
    readingSource,
    async close() {
      readingSource.off('reading', onReading);
      if (typeof readingSource.stop === 'function') readingSource.stop();
      await new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
      io.close();
      await db.disconnect();
    },
  };
}

if (require.main === module) {
  startServer().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startServer };
