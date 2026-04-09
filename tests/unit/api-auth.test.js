const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { createApp } = require('../../src/app');
const { createMockDb } = require('../../src/adapters/db/mock');

const SESSION_SECRET = 'test-session-secret';

function extractCookie(response) {
  return response.headers.get('set-cookie');
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  return {
    response,
    cookie: extractCookie(response),
    body: await response.json(),
  };
}

test('API auth and access rules are enforced', async t => {
  const db = createMockDb();
  await db.connect();

  const app = createApp({
    db,
    chartBuckets: 24,
    sessionSecret: SESSION_SECRET,
    allowUserOverride: false,
  });
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await db.disconnect();
  });

  const unauthenticatedCurrent = await fetch(`${baseUrl}/api/current`);
  assert.equal(unauthenticatedCurrent.status, 401);

  const adminLogin = await login(baseUrl, 'grzegorz', 'grzegorz');
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, 'admin');
  assert.ok(adminLogin.cookie);

  const adminAccess = await fetch(`${baseUrl}/api/admin/access`, {
    headers: { cookie: adminLogin.cookie },
  });
  assert.equal(adminAccess.status, 200);

  const adminLocations = await fetch(`${baseUrl}/api/locations`, {
    headers: { cookie: adminLogin.cookie },
  });
  const locations = await adminLocations.json();
  const garage = locations.find(location => location.name === 'Garage');
  assert.ok(garage);

  const memberLogin = await login(baseUrl, 'anna', 'anna');
  assert.equal(memberLogin.response.status, 200);
  assert.equal(memberLogin.body.user.role, 'member');
  assert.ok(memberLogin.cookie);

  const memberLocationsResponse = await fetch(`${baseUrl}/api/locations`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(memberLocationsResponse.status, 200);
  const memberLocations = await memberLocationsResponse.json();
  assert.equal(memberLocations.some(location => location.name === 'Garage'), false);

  const memberAdminAccess = await fetch(`${baseUrl}/api/admin/access`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(memberAdminAccess.status, 403);

  const forbiddenHistory = await fetch(`${baseUrl}/api/history/${garage._id}?hours=24`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(forbiddenHistory.status, 403);

  const forbiddenCreate = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: memberLogin.cookie,
    },
    body: JSON.stringify({
      name: 'Workshop Annex',
      sensorMac: 'AA:BB:CC:DD:EE:AA',
      groupId: garage.groupId,
    }),
  });
  assert.equal(forbiddenCreate.status, 403);
});
