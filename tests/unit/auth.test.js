const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSessionUserId,
  hashPassword,
  serializeSessionCookie,
  verifyPassword,
} = require('../../src/auth');

test('password hashes verify the original password and reject the wrong one', () => {
  const passwordHash = hashPassword('secret-pass');

  assert.equal(verifyPassword('secret-pass', passwordHash), true);
  assert.equal(verifyPassword('wrong-pass', passwordHash), false);
});

test('session cookies round-trip the authenticated user id', () => {
  const cookie = serializeSessionCookie('user-123', 'test-secret');

  assert.equal(getSessionUserId(cookie, 'test-secret'), 'user-123');
  assert.equal(getSessionUserId(cookie, 'wrong-secret'), null);
});
