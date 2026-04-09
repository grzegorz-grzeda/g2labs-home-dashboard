const express = require('express');
const {
  getSessionUserId,
  serializeLogoutCookie,
  serializeSessionCookie,
} = require('./auth');
const createAdminRouter = require('./routes/admin');
const createLocationsRouter = require('./routes/locations');
const createReadingsRouter = require('./routes/readings');

function createApp({ db, chartBuckets, sessionSecret, allowUserOverride }) {
  const app = express();

  app.use(express.static('public'));
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
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const userContext = await db.authenticateUser(username, password);
    if (!userContext) return res.status(401).json({ error: 'invalid username or password' });

    res.setHeader('Set-Cookie', serializeSessionCookie(userContext.user._id, sessionSecret));
    res.json({ user: userContext.user, groups: userContext.groups });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', serializeLogoutCookie());
    res.json({ ok: true });
  });

  app.use('/api', (req, res, next) => {
    if (!req.userContext) return res.status(401).json({ error: 'authentication required' });
    next();
  });

  app.use('/api/locations', createLocationsRouter({ db }));
  app.use('/api/admin', createAdminRouter({ db }));
  app.use('/api', createReadingsRouter({ db, chartBuckets }));
  app.get('/api/me', async (req, res) => {
    res.json({
      user: req.userContext.user,
      groups: req.userContext.groups,
      allowUserOverride,
    });
  });

  app.use((err, req, res, next) => {
    if (err && err.code === 'USER_NOT_FOUND') return res.status(401).json({ error: 'unknown user context' });
    if (err && err.code === 'FORBIDDEN_GROUP') return res.status(403).json({ error: 'group access denied' });
    if (err && err.code === 'FORBIDDEN_ADMIN') return res.status(403).json({ error: 'admin access required' });
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
