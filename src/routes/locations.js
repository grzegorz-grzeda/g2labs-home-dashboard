const express = require('express');
const {
  parseLocation,
  parseLocationsResponse,
  parseLocationMutation,
  parseLocationUpdate,
  parseOkResponse,
} = require('../../shared/contracts');
const { asyncHandler } = require('./async-handler');
const { sendContract, sendError } = require('./contract-response');

function isDuplicateSensorMacError(err) {
  return err && err.code === 11000;
}

function createLocationsRouter({ db }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const locations = await db.listLocations(req.userContext);
    sendContract(res, { parser: parseLocationsResponse, body: locations });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = parseLocationMutation(req.body);
    } catch {
      return sendError(res, 400, 'INVALID_REQUEST', 'name, sensorMac, and groupId required');
    }

    try {
      const location = await db.createLocation(req.userContext, payload);
      sendContract(res, { status: 201, parser: parseLocation, body: location });
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return sendError(res, 409, 'DUPLICATE_SENSOR_MAC', 'sensorMac already assigned');
      if (err && err.code === 'FORBIDDEN_GROUP') return sendError(res, 403, 'FORBIDDEN_GROUP', 'group access denied');
      throw err;
    }
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    let update;
    try {
      update = parseLocationUpdate(req.body);
    } catch (err) {
      return sendError(res, 400, 'INVALID_REQUEST', err.message);
    }

    try {
      const location = await db.updateLocation(req.userContext, req.params.id, update);
      if (!location) return sendError(res, 404, 'NOT_FOUND', 'not found');
      sendContract(res, { parser: parseLocation, body: location });
    } catch (err) {
      if (isDuplicateSensorMacError(err)) return sendError(res, 409, 'DUPLICATE_SENSOR_MAC', 'sensorMac already assigned');
      if (err && err.code === 'FORBIDDEN_GROUP') return sendError(res, 403, 'FORBIDDEN_GROUP', 'group access denied');
      throw err;
    }
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    try {
      const deleted = await db.deleteLocation(req.userContext, req.params.id);
      if (!deleted) return sendError(res, 404, 'NOT_FOUND', 'not found');
      sendContract(res, { parser: parseOkResponse, body: { ok: true } });
    } catch (err) {
      if (err && err.code === 'FORBIDDEN_GROUP') return sendError(res, 403, 'FORBIDDEN_GROUP', 'group access denied');
      throw err;
    }
  }));

  return router;
}

module.exports = createLocationsRouter;
