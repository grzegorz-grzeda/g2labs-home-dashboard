const express = require('express');
const { asyncHandler } = require('./async-handler');

function isDuplicateUsernameError(err) {
  return err && err.code === 11000;
}

function isDuplicateGroupError(err) {
  return err && err.code === 'DUPLICATE_GROUP';
}

function isForbiddenAdminError(err) {
  return err && err.code === 'FORBIDDEN_ADMIN';
}

function createAdminRouter({ db }) {
  const router = express.Router();

  router.get('/access', asyncHandler(async (req, res) => {
    try {
      const [groups, users] = await Promise.all([
        db.listGroups(req.userContext),
        db.listUsers(req.userContext),
      ]);
      res.json({ groups, users });
    } catch (err) {
      if (isForbiddenAdminError(err)) return res.status(403).json({ error: 'admin access required' });
      throw err;
    }
  }));

  router.post('/groups', asyncHandler(async (req, res) => {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'group name required' });

    try {
      const group = await db.createGroup(req.userContext, { name, description });
      res.status(201).json(group);
    } catch (err) {
      if (isForbiddenAdminError(err)) return res.status(403).json({ error: 'admin access required' });
      if (isDuplicateGroupError(err)) return res.status(409).json({ error: 'group name already exists' });
      throw err;
    }
  }));

  router.post('/users', asyncHandler(async (req, res) => {
    const { name, username, password, role = 'member', groupIds = [] } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username, and password required' });
    if (!Array.isArray(groupIds) || groupIds.length === 0) return res.status(400).json({ error: 'at least one group required' });

    try {
      const user = await db.createUser(req.userContext, { name, username, password, role, groupIds });
      res.status(201).json(user);
    } catch (err) {
      if (isForbiddenAdminError(err)) return res.status(403).json({ error: 'admin access required' });
      if (isDuplicateUsernameError(err)) return res.status(409).json({ error: 'username already exists' });
      throw err;
    }
  }));

  router.put('/users/:id', asyncHandler(async (req, res) => {
    const update = {};
    if (req.body.name) update.name = req.body.name;
    if (req.body.role) update.role = req.body.role;
    if (req.body.password) update.password = req.body.password;
    if (req.body.groupIds) {
      if (!Array.isArray(req.body.groupIds) || req.body.groupIds.length === 0) {
        return res.status(400).json({ error: 'at least one group required' });
      }
      update.groupIds = req.body.groupIds;
    }

    try {
      const user = await db.updateUser(req.userContext, req.params.id, update);
      if (!user) return res.status(404).json({ error: 'not found' });
      res.json(user);
    } catch (err) {
      if (isForbiddenAdminError(err)) return res.status(403).json({ error: 'admin access required' });
      throw err;
    }
  }));

  return router;
}

module.exports = createAdminRouter;
