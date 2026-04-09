const express = require('express');
const createLocationsRouter = require('./routes/locations');
const createReadingsRouter = require('./routes/readings');

function createApp({ db, chartBuckets }) {
  const app = express();

  app.use(express.static('public'));
  app.use(express.json());
  app.use(async (req, res, next) => {
    try {
      const requestedUserId = req.header('x-user-id') || req.query.userId || null;
      req.userContext = await db.resolveUserContext(requestedUserId, { failIfMissing: Boolean(requestedUserId) });
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/locations', createLocationsRouter({ db }));
  app.use('/api', createReadingsRouter({ db, chartBuckets }));
  app.get('/api/me', async (req, res) => {
    const availableUsers = await db.listUsers();
    res.json({
      user: req.userContext.user,
      groups: req.userContext.groups,
      availableUsers,
    });
  });

  app.use((err, req, res, next) => {
    if (err && err.code === 'USER_NOT_FOUND') return res.status(401).json({ error: 'unknown user context' });
    if (err && err.code === 'FORBIDDEN_GROUP') return res.status(403).json({ error: 'group access denied' });
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
