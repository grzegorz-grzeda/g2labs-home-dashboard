const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const Reading = require('../models/Reading');

// List all locations
router.get('/', async (req, res) => {
  const locations = await Location.find().lean();
  res.json(locations);
});

// Create location
router.post('/', async (req, res) => {
  const { name, sensorMac } = req.body;
  if (!name || !sensorMac) return res.status(400).json({ error: 'name and sensorMac required' });
  try {
    const loc = await Location.create({ name, sensorMac: sensorMac.toUpperCase() });
    res.status(201).json(loc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'sensorMac already assigned' });
    throw err;
  }
});

// Update location
router.put('/:id', async (req, res) => {
  const { name, sensorMac } = req.body;
  const update = {};
  if (name) update.name = name;
  if (sensorMac) update.sensorMac = sensorMac.toUpperCase();
  try {
    const loc = await Location.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!loc) return res.status(404).json({ error: 'not found' });
    res.json(loc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'sensorMac already assigned' });
    throw err;
  }
});

// Delete location and its readings
router.delete('/:id', async (req, res) => {
  const loc = await Location.findByIdAndDelete(req.params.id);
  if (!loc) return res.status(404).json({ error: 'not found' });
  await Reading.deleteMany({ locationId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
