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
const { createAuthService } = require('./services/auth-service');
const { createAccessService } = require('./services/access-service');
const { createLocationService } = require('./services/location-service');
const { createReadingsQueryService } = require('./services/readings-query-service');
const createAdminRouter = require('./routes/admin');
const { sendContract, sendError } = require('./routes/contract-response');
const createLocationsRouter = require('./routes/locations');
const createReadingsRouter = require('./routes/readings');

function createApp({ db, chartBuckets, sessionSecret, allowUserOverride }) {
  const app = express();
  const apiRouter = express.Router();
  const clientDistPath = path.resolve(__dirname, '..', 'frontend-dist');
  const authService = createAuthService({
    db,
    sessionSecret,
    allowUserOverride,
    getSessionUserId,
    serializeSessionCookie,
    serializeLogoutCookie,
  });
  const accessService = createAccessService({ db });
  const locationService = createLocationService({ db });
  const readingsQueryService = createReadingsQueryService({ db, chartBuckets });

  app.use(express.static(clientDistPath, { index: false }));
  app.use(express.json());
  app.use(async (req, res, next) => {
    try {
      req.userContext = await authService.resolveRequestUserContext(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  apiRouter.post('/auth/login', async (req, res) => {
    let credentials;
    try {
      credentials = parseLoginRequest(req.body);
    } catch {
      return sendError(res, 400, 'INVALID_REQUEST', 'username and password required');
    }

    const authenticated = await authService.authenticate(credentials);
    if (!authenticated) return sendError(res, 401, 'INVALID_CREDENTIALS', 'invalid username or password');

    res.setHeader('Set-Cookie', authenticated.sessionCookie);
    sendContract(res, {
      parser: parseLoginResponse,
      body: { user: authenticated.userContext.user, groups: authenticated.userContext.groups },
    });
  });

  apiRouter.post('/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', authService.createLogoutCookie());
    sendContract(res, { parser: parseOkResponse, body: { ok: true } });
  });

  apiRouter.use((req, res, next) => {
    if (!req.userContext) return sendError(res, 401, 'AUTH_REQUIRED', 'authentication required');
    next();
  });

  apiRouter.use('/locations', createLocationsRouter({ locationService }));
  apiRouter.use('/admin', createAdminRouter({ accessService }));
  apiRouter.use('/', createReadingsRouter({ readingsQueryService }));
  apiRouter.get('/me', async (req, res) => {
    sendContract(res, {
      parser: parseMeResponse,
      body: authService.describeMe(req.userContext),
    });
  });

  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

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
