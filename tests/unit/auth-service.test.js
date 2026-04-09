const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthService } = require('../../src/services/auth-service');

test('auth service resolves request user context from session cookie', async () => {
  const calls = [];
  const authService = createAuthService({
    db: {
      async resolveUserContext(userId, options) {
        calls.push({ userId, options });
        return { user: { _id: userId }, groups: [], groupIds: [], role: 'member' };
      },
    },
    sessionSecret: 'secret',
    allowUserOverride: false,
    getSessionUserId(cookie, secret) {
      assert.equal(cookie, 'dashboard_session=abc');
      assert.equal(secret, 'secret');
      return 'user-1';
    },
    serializeSessionCookie() {
      throw new Error('not used');
    },
    serializeLogoutCookie() {
      throw new Error('not used');
    },
  });

  const userContext = await authService.resolveRequestUserContext({
    headers: { cookie: 'dashboard_session=abc' },
    query: {},
    header() {
      return null;
    },
  });

  assert.equal(userContext.user._id, 'user-1');
  assert.deepEqual(calls, [{ userId: 'user-1', options: { failIfMissing: true } }]);
});

test('auth service prefers explicit override user id when allowed', async () => {
  const authService = createAuthService({
    db: {
      async resolveUserContext(userId) {
        return { user: { _id: userId }, groups: [], groupIds: [], role: 'admin' };
      },
    },
    sessionSecret: 'secret',
    allowUserOverride: true,
    getSessionUserId() {
      return 'session-user';
    },
    serializeSessionCookie() {
      throw new Error('not used');
    },
    serializeLogoutCookie() {
      throw new Error('not used');
    },
  });

  const userContext = await authService.resolveRequestUserContext({
    headers: { cookie: '' },
    query: {},
    header(name) {
      return name === 'x-user-id' ? 'override-user' : null;
    },
  });

  assert.equal(userContext.user._id, 'override-user');
});

test('auth service authenticates credentials and returns a session cookie', async () => {
  const authService = createAuthService({
    db: {
      async authenticateUser(username, password) {
        assert.equal(username, 'anna');
        assert.equal(password, 'anna');
        return { user: { _id: 'user-2' }, groups: [{ _id: 'group-1' }] };
      },
    },
    sessionSecret: 'secret',
    allowUserOverride: false,
    getSessionUserId() {
      return null;
    },
    serializeSessionCookie(userId, secret) {
      assert.equal(userId, 'user-2');
      assert.equal(secret, 'secret');
      return 'cookie=value';
    },
    serializeLogoutCookie() {
      return 'logout-cookie';
    },
  });

  const authenticated = await authService.authenticate({ username: 'anna', password: 'anna' });

  assert.equal(authenticated.sessionCookie, 'cookie=value');
  assert.equal(authenticated.userContext.user._id, 'user-2');
  assert.equal(authService.createLogoutCookie(), 'logout-cookie');
});

test('auth service describes the current user context for /me', () => {
  const authService = createAuthService({
    db: {},
    sessionSecret: 'secret',
    allowUserOverride: true,
    getSessionUserId() {
      return null;
    },
    serializeSessionCookie() {
      return '';
    },
    serializeLogoutCookie() {
      return '';
    },
  });

  const me = authService.describeMe({
    user: { _id: 'user-1', name: 'Admin' },
    groups: [{ _id: 'group-1', name: 'Family' }],
  });

  assert.deepEqual(me, {
    user: { _id: 'user-1', name: 'Admin' },
    groups: [{ _id: 'group-1', name: 'Family' }],
    allowUserOverride: true,
  });
});
