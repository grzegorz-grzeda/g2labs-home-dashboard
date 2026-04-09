const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const contracts = require('../../shared/contracts');
const { createApp } = require('../../src/app');
const { createMockDb } = require('../../src/adapters/db/mock');

const SESSION_SECRET = 'test-session-secret';

function extractCookie(response) {
  return response.headers.get('set-cookie');
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
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

  const unauthenticatedCurrent = await fetch(`${baseUrl}/api/v1/current`);
  assert.equal(unauthenticatedCurrent.status, 401);
  assert.equal(contracts.parseErrorResponse(await unauthenticatedCurrent.json()).code, 'AUTH_REQUIRED');

  const legacyUnauthenticatedCurrent = await fetch(`${baseUrl}/api/current`);
  assert.equal(legacyUnauthenticatedCurrent.status, 401);
  assert.equal(contracts.parseErrorResponse(await legacyUnauthenticatedCurrent.json()).code, 'AUTH_REQUIRED');

  const adminLogin = await login(baseUrl, 'grzegorz', 'grzegorz');
  assert.equal(adminLogin.response.status, 200);
  assert.equal(contracts.parseLoginResponse(adminLogin.body).user.role, 'admin');
  assert.ok(adminLogin.cookie);

  const adminAccess = await fetch(`${baseUrl}/api/v1/admin/access`, {
    headers: { cookie: adminLogin.cookie },
  });
  assert.equal(adminAccess.status, 200);
  contracts.parseAdminAccessResponse(await adminAccess.json());

  const adminLocations = await fetch(`${baseUrl}/api/v1/locations`, {
    headers: { cookie: adminLogin.cookie },
  });
  const locations = contracts.parseLocationsResponse(await adminLocations.json());
  const garage = locations.find(location => location.name === 'Garage');
  assert.ok(garage);

  const memberLogin = await login(baseUrl, 'anna', 'anna');
  assert.equal(memberLogin.response.status, 200);
  assert.equal(contracts.parseLoginResponse(memberLogin.body).user.role, 'member');
  assert.ok(memberLogin.cookie);

  const memberLocationsResponse = await fetch(`${baseUrl}/api/v1/locations`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(memberLocationsResponse.status, 200);
  const memberLocations = contracts.parseLocationsResponse(await memberLocationsResponse.json());
  assert.equal(memberLocations.some(location => location.name === 'Garage'), false);

  const memberAdminAccess = await fetch(`${baseUrl}/api/v1/admin/access`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(memberAdminAccess.status, 403);
  assert.equal(contracts.parseErrorResponse(await memberAdminAccess.json()).code, 'FORBIDDEN_ADMIN');

  const forbiddenHistory = await fetch(`${baseUrl}/api/v1/history/${garage._id}?hours=24`, {
    headers: { cookie: memberLogin.cookie },
  });
  assert.equal(forbiddenHistory.status, 403);
  assert.equal(contracts.parseErrorResponse(await forbiddenHistory.json()).code, 'FORBIDDEN_GROUP');

  const forbiddenCreate = await fetch(`${baseUrl}/api/v1/locations`, {
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
  assert.equal(contracts.parseErrorResponse(await forbiddenCreate.json()).code, 'FORBIDDEN_GROUP');

  const legacyMe = await fetch(`${baseUrl}/api/me`, {
    headers: { cookie: adminLogin.cookie },
  });
  assert.equal(legacyMe.status, 200);
  contracts.parseMeResponse(await legacyMe.json());
});
