const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../../src/adapters/db/mongo');

test('extractGroupIds handles populated group documents and raw ids', () => {
  const result = __testables.extractGroupIds([
    { _id: { toString: () => 'group-1' }, name: 'Family' },
    { toString: () => 'group-2' },
    'group-3',
  ]);

  assert.deepEqual(result, ['group-1', 'group-2', 'group-3']);
});

test('member visible groups are resolved from populated group objects', () => {
  const user = {
    role: 'member',
    groupIds: [
      { _id: { toString: () => 'family' }, name: 'Family' },
    ],
  };
  const allGroups = [
    { _id: { toString: () => 'family' }, name: 'Family' },
    { _id: { toString: () => 'garage' }, name: 'Garage' },
  ];

  const visibleGroups = __testables.getVisibleGroupsForUser(user, allGroups);

  assert.equal(visibleGroups.length, 1);
  assert.equal(visibleGroups[0].name, 'Family');
});

test('admin visible groups include every group', () => {
  const user = {
    role: 'admin',
    groupIds: [],
  };
  const allGroups = [
    { _id: { toString: () => 'family' }, name: 'Family' },
    { _id: { toString: () => 'garage' }, name: 'Garage' },
  ];

  const visibleGroups = __testables.getVisibleGroupsForUser(user, allGroups);

  assert.equal(visibleGroups.length, 2);
  assert.deepEqual(visibleGroups.map(group => group.name), ['Family', 'Garage']);
});

test('admin bypasses per-group access checks', () => {
  assert.equal(__testables.hasGroupAccess({ role: 'admin', groupIds: [] }, 'group-1'), true);
});

test('member access checks still depend on matching group ids', () => {
  assert.equal(__testables.hasGroupAccess({ role: 'member', groupIds: ['group-1'] }, 'group-1'), true);
  assert.equal(__testables.hasGroupAccess({ role: 'member', groupIds: ['group-1'] }, 'group-2'), false);
});
