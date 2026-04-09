const test = require('node:test');
const assert = require('node:assert/strict');

const { createReadingsQueryService } = require('../../src/services/readings-query-service');

test('readings query service uses configured chart buckets for history', async () => {
  const calls = [];
  const readingsQueryService = createReadingsQueryService({
    chartBuckets: 123,
    db: {
      async getCurrentReadings(userContext) {
        calls.push(['getCurrentReadings', userContext]);
        return [];
      },
      async getHistory(userContext, locationId, options) {
        calls.push(['getHistory', userContext, locationId, options]);
        return [{ timestamp: '2026-01-01T00:00:00.000Z' }];
      },
    },
  });

  const userContext = { role: 'member', groupIds: ['group-1'] };
  await readingsQueryService.getCurrentReadings(userContext);
  const history = await readingsQueryService.getHistory(userContext, 'location-1', 24);

  assert.deepEqual(history, [{ timestamp: '2026-01-01T00:00:00.000Z' }]);
  assert.deepEqual(calls, [
    ['getCurrentReadings', userContext],
    ['getHistory', userContext, 'location-1', { hours: 24, buckets: 123 }],
  ]);
});
