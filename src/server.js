require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { getSessionUserId } = require('./auth');
const { createApp } = require('./app');
const { createMongoDb } = require('./adapters/db/mongo');
const { createMockDb } = require('./adapters/db/mock');
const { getConfig } = require('./config');
const MqttSubscriber = require('./mqtt/subscriber');
const MockReadingGenerator = require('./mqtt/mock-generator');
const { createReadingHandler } = require('./services/readings');

function createDb(config) {
  if (config.dbDriver === 'mock') return createMockDb();
  return createMongoDb({
    connectionString: config.mongodbUri,
    defaultAdminPassword: config.defaultAdminPassword,
    defaultUserPassword: config.defaultUserPassword,
  });
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
  const app = createApp({
    db,
    chartBuckets: config.chartBuckets,
    sessionSecret: config.sessionSecret,
    allowUserOverride: config.allowUserOverride,
  });
  const server = http.createServer(app);
  const io = new Server(server);
  const readingSource = createReadingSource(config, db);
  io.use(async (socket, next) => {
    try {
      const overrideUserId = config.allowUserOverride
        ? socket.handshake.auth?.userId || socket.handshake.query?.userId || null
        : null;
      const sessionUserId = getSessionUserId(socket.handshake.headers.cookie, config.sessionSecret);
      const requestedUserId = overrideUserId || sessionUserId || null;
      if (!requestedUserId) {
        const err = new Error('authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      socket.data.userContext = await db.resolveUserContext(requestedUserId, { failIfMissing: true });
      next();
    } catch (err) {
      next(err);
    }
  });

  const emitReading = reading => {
    for (const socket of io.sockets.sockets.values()) {
      const userContext = socket.data.userContext;
      if (!userContext) continue;
      if (userContext.role === 'admin' || (userContext.groupIds || []).includes(reading.groupId)) {
        socket.emit('reading', reading);
      }
    }
  };
  const handleReading = createReadingHandler({ db, emitReading });
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
