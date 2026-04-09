const express = require('express');

function isDuplicateSensorMacError(err) {
  return err && err.code === 11000;
}

function createLocationsRouter({ db }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const locations = await db.listLocations(req.userContext);
    res.json(locations);
  });

  router.post('/', async (req, res) => {
    const { name, sensorMac, groupId } = req.body;
    if (!name || !sensorMac || !groupId) return res.status(400).json({ error: 'name, sensorMac, and groupId required' });

    try {
      const location = await db.createLocation(req.userContext, { name, sensorMac, groupId });
      res.status(201).json(location);
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return res.status(409).json({ error: 'sensorMac already assigned' });
      if (err && err.code === 'FORBIDDEN_GROUP') return res.status(403).json({ error: 'group access denied' });
      throw err;
    }
  });

  router.put('/:id', async (req, res) => {
    const { name, sensorMac, groupId } = req.body;
    const update = {};
    if (name) update.name = name;
    if (sensorMac) update.sensorMac = sensorMac;
    if (groupId) update.groupId = groupId;

    try {
      const location = await db.updateLocation(req.userContext, req.params.id, update);
      if (!location) return res.status(404).json({ error: 'not found' });
      res.json(location);
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return res.status(409).json({ error: 'sensorMac already assigned' });
      if (err && err.code === 'FORBIDDEN_GROUP') return res.status(403).json({ error: 'group access denied' });
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await db.deleteLocation(req.userContext, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createLocationsRouter;
