function parseInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig(env = process.env) {
  const appMode = env.APP_MODE || 'production';

  return {
    appMode,
    dbDriver: env.DB_DRIVER || (appMode === 'test' ? 'mock' : 'mongo'),
    readingSourceDriver: env.READING_SOURCE || (appMode === 'test' ? 'generator' : 'mqtt'),
    mongodbUri: env.MONGODB_URI || 'mongodb://localhost:27017/home-dashboard',
    mqttBroker: env.MQTT_BROKER || 'mqtt://localhost:1883',
    mqttTopic: env.MQTT_TOPIC || 'atc',
    port: parseInteger(env.PORT, 3000),
    chartBuckets: parseInteger(env.CHART_BUCKETS, 300),
    mockIntervalMs: parseInteger(env.MOCK_INTERVAL_MS, 5000),
  };
}

module.exports = { getConfig };
