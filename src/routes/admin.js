const express = require('express');
const {
  parseAdminAccessResponse,
  parseCreateGroupRequest,
  parseCreateUserRequest,
  parseGroup,
  parseUpdateUserRequest,
  parseUserWithGroups,
} = require('../../shared/contracts');
const { asyncHandler } = require('./async-handler');
const { sendContract, sendError } = require('./contract-response');

function isDuplicateUsernameError(err) {
  return err && err.code === 11000;
}

function isDuplicateGroupError(err) {
  return err && err.code === 'DUPLICATE_GROUP';
}

function isForbiddenAdminError(err) {
  return err && err.code === 'FORBIDDEN_ADMIN';
}

function createAdminRouter({ accessService }) {
  const router = express.Router();

  router.get('/access', asyncHandler(async (req, res) => {
    try {
      const { groups, users } = await accessService.getAccessOverview(req.userContext);
      sendContract(res, {
        parser: parseAdminAccessResponse,
        body: { groups, users },
      });
    } catch (err) {
      if (isForbiddenAdminError(err)) return sendError(res, 403, 'FORBIDDEN_ADMIN', 'admin access required');
      throw err;
    }
  }));

  router.post('/groups', asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = parseCreateGroupRequest(req.body);
    } catch {
      return sendError(res, 400, 'INVALID_REQUEST', 'group name required');
    }

    try {
      const group = await accessService.createGroup(req.userContext, payload);
      sendContract(res, { status: 201, parser: parseGroup, body: group });
    } catch (err) {
      if (isForbiddenAdminError(err)) return sendError(res, 403, 'FORBIDDEN_ADMIN', 'admin access required');
      if (isDuplicateGroupError(err)) return sendError(res, 409, 'DUPLICATE_GROUP', 'group name already exists');
      throw err;
    }
  }));

  router.post('/users', asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = parseCreateUserRequest(req.body);
    } catch (err) {
      return sendError(res, 400, 'INVALID_REQUEST', err.message);
    }

    try {
      const user = await accessService.createUser(req.userContext, payload);
      sendContract(res, { status: 201, parser: parseUserWithGroups, body: user });
    } catch (err) {
      if (isForbiddenAdminError(err)) return sendError(res, 403, 'FORBIDDEN_ADMIN', 'admin access required');
      if (isDuplicateUsernameError(err)) return sendError(res, 409, 'DUPLICATE_USERNAME', 'username already exists');
      throw err;
    }
  }));

  router.put('/users/:id', asyncHandler(async (req, res) => {
    let update;
    try {
      update = parseUpdateUserRequest(req.body);
    } catch (err) {
      return sendError(res, 400, 'INVALID_REQUEST', err.message);
    }

    try {
      const user = await accessService.updateUser(req.userContext, req.params.id, update);
      if (!user) return sendError(res, 404, 'NOT_FOUND', 'not found');
      sendContract(res, { parser: parseUserWithGroups, body: user });
    } catch (err) {
      if (isForbiddenAdminError(err)) return sendError(res, 403, 'FORBIDDEN_ADMIN', 'admin access required');
      throw err;
    }
  }));

  return router;
}

module.exports = createAdminRouter;
