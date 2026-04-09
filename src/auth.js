const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'dashboard_session';

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, eqIndex));
      const value = decodeURIComponent(part.slice(eqIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.includes(':')) return false;
  const [salt, expectedHex] = passwordHash.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionValue(userId, secret) {
  const payload = Buffer.from(JSON.stringify({ userId }), 'utf8').toString('base64url');
  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
}

function getSessionUserId(cookieHeader, secret) {
  const sessionValue = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (!sessionValue) return null;
  const [payload, signature] = sessionValue.split('.');
  if (!payload || !signature) return null;
  if (signValue(payload, secret) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.userId || null;
  } catch {
    return null;
  }
}

function serializeSessionCookie(userId, secret) {
  const value = createSessionValue(userId, secret);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
}

function serializeLogoutCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  SESSION_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  getSessionUserId,
  serializeSessionCookie,
  serializeLogoutCookie,
};
