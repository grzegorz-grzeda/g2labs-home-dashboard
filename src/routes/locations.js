const express = require('express');

function isDuplicateSensorMacError(err) {
  return err && err.code === 11000;
}

function createLocationsRouter({ db }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const locations = await db.listLocations();
    res.json(locations);
  });

  router.post('/', async (req, res) => {
    const { name, sensorMac } = req.body;
    if (!name || !sensorMac) return res.status(400).json({ error: 'name and sensorMac required' });

    try {
      const location = await db.createLocation({ name, sensorMac });
      res.status(201).json(location);
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return res.status(409).json({ error: 'sensorMac already assigned' });
      throw err;
    }
  });

  router.put('/:id', async (req, res) => {
    const { name, sensorMac } = req.body;
    const update = {};
    if (name) update.name = name;
    if (sensorMac) update.sensorMac = sensorMac;

    try {
      const location = await db.updateLocation(req.params.id, update);
      if (!location) return res.status(404).json({ error: 'not found' });
      res.json(location);
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return res.status(409).json({ error: 'sensorMac already assigned' });
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await db.deleteLocation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createLocationsRouter;
