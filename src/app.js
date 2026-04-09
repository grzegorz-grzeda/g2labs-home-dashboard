const express = require('express');
const path = require('path');
const {
  parseLoginRequest,
  parseLoginResponse,
  parseMeResponse,
  parseOkResponse,
} = require('../shared/contracts');
const {
  getSessionUserId,
  serializeLogoutCookie,
  serializeSessionCookie,
} = require('./auth');
const createAdminRouter = require('./routes/admin');
const { sendContract, sendError } = require('./routes/contract-response');
const createLocationsRouter = require('./routes/locations');
const createReadingsRouter = require('./routes/readings');

function createApp({ db, chartBuckets, sessionSecret, allowUserOverride }) {
  const app = express();
  const clientDistPath = path.resolve(__dirname, '..', 'frontend-dist');

  app.use(express.static(clientDistPath, { index: false }));
  app.use(express.json());
  app.use(async (req, res, next) => {
    try {
      const overrideUserId = allowUserOverride ? (req.header('x-user-id') || req.query.userId || null) : null;
      const sessionUserId = getSessionUserId(req.headers.cookie, sessionSecret);
      const requestedUserId = overrideUserId || sessionUserId || null;
      req.userContext = requestedUserId
        ? await db.resolveUserContext(requestedUserId, { failIfMissing: true })
        : null;
      next();
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    let credentials;
    try {
      credentials = parseLoginRequest(req.body);
    } catch {
      return sendError(res, 400, 'INVALID_REQUEST', 'username and password required');
    }

    const userContext = await db.authenticateUser(credentials.username, credentials.password);
    if (!userContext) return sendError(res, 401, 'INVALID_CREDENTIALS', 'invalid username or password');

    res.setHeader('Set-Cookie', serializeSessionCookie(userContext.user._id, sessionSecret));
    sendContract(res, {
      parser: parseLoginResponse,
      body: { user: userContext.user, groups: userContext.groups },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', serializeLogoutCookie());
    sendContract(res, { parser: parseOkResponse, body: { ok: true } });
  });

  app.use('/api', (req, res, next) => {
    if (!req.userContext) return sendError(res, 401, 'AUTH_REQUIRED', 'authentication required');
    next();
  });

  app.use('/api/locations', createLocationsRouter({ db }));
  app.use('/api/admin', createAdminRouter({ db }));
  app.use('/api', createReadingsRouter({ db, chartBuckets }));
  app.get('/api/me', async (req, res) => {
    sendContract(res, {
      parser: parseMeResponse,
      body: {
        user: req.userContext.user,
        groups: req.userContext.groups,
        allowUserOverride,
      },
    });
  });

  app.use((err, req, res, next) => {
    if (err && err.code === 'USER_NOT_FOUND') return sendError(res, 401, 'USER_NOT_FOUND', 'unknown user context');
    if (err && err.code === 'FORBIDDEN_GROUP') return sendError(res, 403, 'FORBIDDEN_GROUP', 'group access denied');
    if (err && err.code === 'FORBIDDEN_ADMIN') return sendError(res, 403, 'FORBIDDEN_ADMIN', 'admin access required');
    if (err && err.code === 'CONTRACT_VIOLATION') return sendError(res, 500, 'CONTRACT_VIOLATION', err.message);
    console.error(err);
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'internal server error');
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
