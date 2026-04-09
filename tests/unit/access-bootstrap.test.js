const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureDefaultAccessContext } = require('../../src/bootstrap/access-bootstrap');

test('access bootstrap creates default admin when the database is empty', async () => {
  const calls = [];
  const defaultGroup = { _id: 'group-1', name: 'Default Home' };

  const Group = {
    async findOne() {
      return null;
    },
    async create(payload) {
      calls.push(['createGroup', payload]);
      return defaultGroup;
    },
  };

  const Location = {
    async updateMany(query, update) {
      calls.push(['updateLocations', query, update]);
    },
  };

  const User = {
    async updateMany(query, update) {
      calls.push(['updateUsers', query, update]);
    },
    async countDocuments(query) {
      if (query?.role === 'admin') return 0;
      return 0;
    },
    async create(payload) {
      calls.push(['createUser', payload]);
    },
    findOne() {
      throw new Error('not used when there are no users');
    },
  };

  await ensureDefaultAccessContext({
    Group,
    Location,
    User,
    defaultAdminPassword: 'admin-secret',
    defaultUserPassword: 'user-secret',
  });

  assert.equal(calls[0][0], 'createGroup');
  assert.equal(calls.at(-1)[0], 'createUser');
  assert.equal(calls.at(-1)[1].username, 'admin');
  assert.equal(calls.at(-1)[1].role, 'admin');
  assert.deepEqual(calls.at(-1)[1].groupIds, ['group-1']);
});

test('access bootstrap promotes the first existing user when no admin exists', async () => {
  const firstUser = {
    role: 'member',
    groupIds: [],
    saveCalled: false,
    async save() {
      this.saveCalled = true;
    },
  };

  const Group = {
    async findOne() {
      return { _id: 'group-1', name: 'Default Home' };
    },
  };

  const Location = {
    async updateMany() {},
  };

  const User = {
    async updateMany() {},
    async countDocuments(query) {
      if (query?.role === 'admin') return 0;
      return 1;
    },
    async create() {
      throw new Error('not used');
    },
    findOne() {
      return {
        sort() {
          return Promise.resolve(firstUser);
        },
      };
    },
  };

  await ensureDefaultAccessContext({
    Group,
    Location,
    User,
    defaultAdminPassword: 'admin-secret',
    defaultUserPassword: 'user-secret',
  });

  assert.equal(firstUser.role, 'admin');
  assert.deepEqual(firstUser.groupIds, ['group-1']);
  assert.equal(firstUser.saveCalled, true);
});
