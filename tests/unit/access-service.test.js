const test = require('node:test');
const assert = require('node:assert/strict');

const { createAccessService } = require('../../src/services/access-service');

test('access service combines groups and users into one overview payload', async () => {
  const accessService = createAccessService({
    db: {
      async listGroups(userContext) {
        assert.equal(userContext.role, 'admin');
        return [{ _id: 'group-1', name: 'Family' }];
      },
      async listUsers(userContext) {
        assert.equal(userContext.role, 'admin');
        return [{ _id: 'user-1', username: 'anna' }];
      },
    },
  });

  const overview = await accessService.getAccessOverview({ role: 'admin' });
  assert.deepEqual(overview, {
    groups: [{ _id: 'group-1', name: 'Family' }],
    users: [{ _id: 'user-1', username: 'anna' }],
  });
});

test('access service delegates create and update mutations to the db adapter', async () => {
  const calls = [];
  const accessService = createAccessService({
    db: {
      async createGroup(userContext, payload) {
        calls.push(['createGroup', userContext, payload]);
        return { _id: 'group-2', ...payload };
      },
      async createUser(userContext, payload) {
        calls.push(['createUser', userContext, payload]);
        return { _id: 'user-2', ...payload };
      },
      async updateUser(userContext, id, update) {
        calls.push(['updateUser', userContext, id, update]);
        return { _id: id, ...update };
      },
    },
  });

  const userContext = { role: 'admin' };
  await accessService.createGroup(userContext, { name: 'Garage', description: '' });
  await accessService.createUser(userContext, { username: 'marek', groupIds: ['group-1'] });
  await accessService.updateUser(userContext, 'user-2', { role: 'member' });

  assert.deepEqual(calls, [
    ['createGroup', userContext, { name: 'Garage', description: '' }],
    ['createUser', userContext, { username: 'marek', groupIds: ['group-1'] }],
    ['updateUser', userContext, 'user-2', { role: 'member' }],
  ]);
});
