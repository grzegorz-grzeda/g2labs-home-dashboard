require('dotenv').config();

const { createMongoDb } = require('../src/adapters/db/mongo');
const { getConfig } = require('../src/config');

async function main() {
  const config = getConfig();

  if (config.dbDriver === 'mock') {
    throw new Error('bootstrap:mongo requires a MongoDB-backed configuration');
  }

  const db = createMongoDb({
    connectionString: config.mongodbUri,
    defaultAdminPassword: config.defaultAdminPassword,
    defaultUserPassword: config.defaultUserPassword,
  });

  await db.connect();
  await db.ensureAccessBootstrap();
  console.log(`Mongo access bootstrap completed for ${config.mongodbUri}`);
  await db.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
