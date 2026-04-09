const test = require('node:test');
const assert = require('node:assert/strict');

const { createLocationService } = require('../../src/services/location-service');

test('location service delegates CRUD flows to the db adapter', async () => {
  const calls = [];
  const locationService = createLocationService({
    db: {
      async listLocations(userContext) {
        calls.push(['listLocations', userContext]);
        return [{ _id: 'location-1' }];
      },
      async createLocation(userContext, payload) {
        calls.push(['createLocation', userContext, payload]);
        return { _id: 'location-2', ...payload };
      },
      async updateLocation(userContext, id, update) {
        calls.push(['updateLocation', userContext, id, update]);
        return { _id: id, ...update };
      },
      async deleteLocation(userContext, id) {
        calls.push(['deleteLocation', userContext, id]);
        return true;
      },
    },
  });

  const userContext = { role: 'member', groupIds: ['group-1'] };
  await locationService.listLocations(userContext);
  await locationService.createLocation(userContext, { name: 'Kitchen', groupId: 'group-1' });
  await locationService.updateLocation(userContext, 'location-2', { name: 'Kitchen South' });
  await locationService.deleteLocation(userContext, 'location-2');

  assert.deepEqual(calls, [
    ['listLocations', userContext],
    ['createLocation', userContext, { name: 'Kitchen', groupId: 'group-1' }],
    ['updateLocation', userContext, 'location-2', { name: 'Kitchen South' }],
    ['deleteLocation', userContext, 'location-2'],
  ]);
});
