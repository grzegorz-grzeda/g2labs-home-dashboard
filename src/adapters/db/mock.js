const { hashPassword, verifyPassword } = require('../../auth');

function createIdGenerator() {
  let counter = 1;
  return () => `mock-${counter++}`;
}

function duplicateSensorMacError() {
  const err = new Error('sensorMac already assigned');
  err.code = 11000;
  return err;
}

function forbiddenGroupError() {
  const err = new Error('group access denied');
  err.code = 'FORBIDDEN_GROUP';
  return err;
}

function forbiddenAdminError() {
  const err = new Error('admin access required');
  err.code = 'FORBIDDEN_ADMIN';
  return err;
}

function duplicateGroupError() {
  const err = new Error('group name already exists');
  err.code = 'DUPLICATE_GROUP';
  return err;
}

function duplicateUsernameError() {
  const err = new Error('username already exists');
  err.code = 11000;
  return err;
}

function userNotFoundError() {
  const err = new Error('unknown user context');
  err.code = 'USER_NOT_FOUND';
  return err;
}

function normalizeSensorMac(sensorMac) {
  return sensorMac.toUpperCase();
}

function ensureAdmin(userContext) {
  if (userContext.role !== 'admin') throw forbiddenAdminError();
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function chunkReadings(readings, buckets) {
  if (readings.length <= buckets) return readings.map(reading => [reading]);

  const chunkSize = Math.ceil(readings.length / buckets);
  const chunks = [];
  for (let i = 0; i < readings.length; i += chunkSize) chunks.push(readings.slice(i, i + chunkSize));
  return chunks;
}

function aggregateHistory(readings, buckets) {
  return chunkReadings(readings, buckets).map(chunk => ({
    timestamp: new Date(average(chunk.map(reading => reading.timestamp.getTime()))),
    temperature: average(chunk.map(reading => reading.temperature)),
    humidity: average(chunk.map(reading => reading.humidity)),
    battery: chunk[chunk.length - 1].battery,
  }));
}

function createSeedLocations(makeId) {
  return [
    { _id: makeId(), name: 'Living Room', sensorMac: 'AA:BB:CC:DD:EE:01', groupId: null },
    { _id: makeId(), name: 'Bedroom', sensorMac: 'AA:BB:CC:DD:EE:02', groupId: null },
    { _id: makeId(), name: 'Kitchen', sensorMac: 'AA:BB:CC:DD:EE:03', groupId: null },
    { _id: makeId(), name: 'Garage', sensorMac: 'AA:BB:CC:DD:EE:04', groupId: null },
  ];
}

function createSeedReadings(locations, now) {
  const readings = [];
  const intervalMinutes = 15;
  const steps = 96;

  locations.forEach((location, index) => {
    for (let step = 0; step < steps; step += 1) {
      const time = new Date(now.getTime() - (steps - step) * intervalMinutes * 60 * 1000);
      const offset = index * 0.8;
      readings.push({
        _id: `${location._id}-reading-${step}`,
        locationId: location._id,
        temperature: Number((20 + offset + Math.sin(step / 6) * 1.8).toFixed(1)),
        humidity: Math.round(45 + index * 6 + Math.cos(step / 7) * 8),
        battery: Math.max(55, 98 - (step % 20) - index * 4),
        rssi: -60 - index * 4,
        frameCounter: step % 256,
        timestamp: time,
      });
    }
  });

  return readings;
}

function createSeedGroups(makeId) {
  return [
    { _id: makeId(), name: 'Family', description: 'Main household shared areas' },
    { _id: makeId(), name: 'Garage', description: 'Garage and workshop spaces' },
  ];
}

function createSeedUsers(makeId, groups) {
  const familyGroup = groups.find(group => group.name === 'Family');
  const garageGroup = groups.find(group => group.name === 'Garage');
  return [
    {
      _id: makeId(),
      name: 'Grzegorz',
      username: 'grzegorz',
      passwordHash: hashPassword('grzegorz'),
      role: 'admin',
      groupIds: [familyGroup._id, garageGroup._id],
    },
    {
      _id: makeId(),
      name: 'Anna',
      username: 'anna',
      passwordHash: hashPassword('anna'),
      role: 'member',
      groupIds: [familyGroup._id],
    },
  ];
}

function withGroupViews(location, groups) {
  const group = groups.find(entry => entry._id === location.groupId);
  return {
    ...location,
    groupName: group ? group.name : '',
  };
}

function buildUserContext(user, groups) {
  const visibleGroups = (user.role || 'member') === 'admin'
    ? groups
    : groups.filter(group => user.groupIds.includes(group._id));
  return {
    user: { ...user },
    groups: visibleGroups.map(group => ({ ...group })),
    groupIds: visibleGroups.map(group => group._id),
    role: user.role || 'member',
  };
}

function hasGroupAccess(userContext, groupId) {
  if (userContext.role === 'admin') return true;
  return userContext.groupIds.includes(groupId);
}

function createMockDb({ initialGroups, initialUsers, initialLocations, initialReadings, now = () => new Date() } = {}) {
  const makeId = createIdGenerator();
  const groups = initialGroups || createSeedGroups(makeId);
  const seededLocations = initialLocations || createSeedLocations(makeId);
  const familyGroup = groups.find(group => group.name === 'Family');
  const garageGroup = groups.find(group => group.name === 'Garage');
  const hydratedLocations = seededLocations.map(location => ({
    ...location,
    groupId: location.groupId || (location.name === 'Garage' ? garageGroup._id : familyGroup._id),
  }));

  const state = {
    groups: groups.map(group => ({ ...group })),
    users: (initialUsers || createSeedUsers(makeId, groups)).map(user => ({
      ...user,
      passwordHash: user.passwordHash || hashPassword(user.username),
      groupIds: [...user.groupIds],
    })),
    locations: hydratedLocations.map(location => ({
      ...location,
      sensorMac: normalizeSensorMac(location.sensorMac),
    })),
    readings: [],
  };

  state.readings = (initialReadings || createSeedReadings(state.locations, now())).map(reading => ({
    _id: reading._id || makeId(),
    ...reading,
    timestamp: new Date(reading.timestamp),
  }));

  return {
    async connect() {},

    async ensureAccessBootstrap() {},

    async disconnect() {},

    async resolveUserContext(userId, { failIfMissing = false } = {}) {
      const selectedUser = userId
        ? state.users.find(user => user._id === userId)
        : state.users[0];
      if (!selectedUser) {
        if (failIfMissing) throw userNotFoundError();
        if (!state.users[0]) throw userNotFoundError();
        return buildUserContext(state.users[0], state.groups);
      }
      return buildUserContext(selectedUser, state.groups);
    },

    async authenticateUser(username, password) {
      const user = state.users.find(entry => entry.username === username.trim());
      if (!user || !verifyPassword(password, user.passwordHash)) return null;
      return buildUserContext(user, state.groups);
    },

    async listUsers(userContext) {
      if (userContext) ensureAdmin(userContext);
      return state.users.map(user => ({
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role || 'member',
        groupIds: [...user.groupIds],
        groups: state.groups
          .filter(group => user.groupIds.includes(group._id))
          .map(group => ({ _id: group._id, name: group.name })),
      }));
    },

    async listGroups(userContext) {
      if (userContext) ensureAdmin(userContext);
      return state.groups.map(group => ({ ...group }));
    },

    async createGroup(userContext, { name, description = '' }) {
      ensureAdmin(userContext);
      const trimmedName = name.trim();
      if (state.groups.some(group => group.name === trimmedName)) throw duplicateGroupError();
      const group = {
        _id: makeId(),
        name: trimmedName,
        description: description.trim(),
      };
      state.groups.push(group);
      return { ...group };
    },

    async createUser(userContext, { name, username, password, role = 'member', groupIds }) {
      ensureAdmin(userContext);
      if (state.users.some(user => user.username === username.trim())) throw duplicateUsernameError();
      const user = {
        _id: makeId(),
        name: name.trim(),
        username: username.trim(),
        passwordHash: hashPassword(password),
        role,
        groupIds: [...groupIds],
      };
      state.users.push(user);
      return {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        groupIds: [...user.groupIds],
        groups: state.groups
          .filter(group => user.groupIds.includes(group._id))
          .map(group => ({ _id: group._id, name: group.name })),
      };
    },

    async updateUser(userContext, id, update) {
      ensureAdmin(userContext);
      const user = state.users.find(entry => entry._id === id);
      if (!user) return null;
      if (update.name) user.name = update.name.trim();
      if (update.role) user.role = update.role;
      if (update.groupIds) user.groupIds = [...update.groupIds];
      if (update.password) user.passwordHash = hashPassword(update.password);
      return {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        groupIds: [...user.groupIds],
        groups: state.groups
          .filter(group => user.groupIds.includes(group._id))
          .map(group => ({ _id: group._id, name: group.name })),
      };
    },

    async listLocations(userContext) {
      return state.locations
        .filter(location => hasGroupAccess(userContext, location.groupId))
        .map(location => withGroupViews({ ...location }, state.groups));
    },

    async createLocation(userContext, { name, sensorMac, groupId }) {
      const normalizedMac = normalizeSensorMac(sensorMac);
      if (state.locations.some(location => location.sensorMac === normalizedMac)) throw duplicateSensorMacError();
      if (!hasGroupAccess(userContext, groupId)) throw forbiddenGroupError();

      const location = { _id: makeId(), name, sensorMac: normalizedMac, groupId };
      state.locations.push(location);
      return withGroupViews({ ...location }, state.groups);
    },

    async updateLocation(userContext, id, update) {
      const location = state.locations.find(entry => entry._id === id);
      if (!location) return null;
      if (!hasGroupAccess(userContext, location.groupId)) throw forbiddenGroupError();

      if (update.sensorMac) {
        const normalizedMac = normalizeSensorMac(update.sensorMac);
        const duplicate = state.locations.find(entry => entry._id !== id && entry.sensorMac === normalizedMac);
        if (duplicate) throw duplicateSensorMacError();
        location.sensorMac = normalizedMac;
      }
      if (update.name) location.name = update.name;
      if (update.groupId) {
        if (!hasGroupAccess(userContext, update.groupId)) throw forbiddenGroupError();
        location.groupId = update.groupId;
      }

      return withGroupViews({ ...location }, state.groups);
    },

    async deleteLocation(userContext, id) {
      const index = state.locations.findIndex(location => location._id === id);
      if (index === -1) return false;
      if (!hasGroupAccess(userContext, state.locations[index].groupId)) throw forbiddenGroupError();

      state.locations.splice(index, 1);
      state.readings = state.readings.filter(reading => reading.locationId !== id);
      return true;
    },

    async findLocationBySensorMac(sensorMac) {
      const location = state.locations.find(entry => entry.sensorMac === normalizeSensorMac(sensorMac));
      return location ? { ...location } : null;
    },

    async hasRecentReadingWithFrameCounter({ locationId, frameCounter, since }) {
      return state.readings.some(reading =>
        reading.locationId === locationId &&
        reading.frameCounter === frameCounter &&
        reading.timestamp >= since
      );
    },

    async createReading(reading) {
      const nextReading = {
        _id: makeId(),
        ...reading,
        timestamp: new Date(reading.timestamp),
      };
      state.readings.push(nextReading);
      return { ...nextReading };
    },

    async getCurrentReadings(userContext) {
      return state.locations
        .filter(location => hasGroupAccess(userContext, location.groupId))
        .map(location => {
        const reading = state.readings
          .filter(entry => entry.locationId === location._id)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        return {
          location: withGroupViews({ ...location }, state.groups),
          reading: reading ? { ...reading } : null,
        };
      });
    },

    async getHistory(userContext, locationId, { hours, buckets }) {
      const location = state.locations.find(entry => entry._id === locationId);
      if (!location) return [];
      if (!hasGroupAccess(userContext, location.groupId)) throw forbiddenGroupError();
      const since = new Date(now().getTime() - hours * 60 * 60 * 1000);
      const readings = state.readings
        .filter(reading => reading.locationId === locationId && reading.timestamp >= since)
        .sort((a, b) => a.timestamp - b.timestamp);

      return aggregateHistory(readings, buckets);
    },

    getSeedSensorMacs() {
      return state.locations.map(location => location.sensorMac);
    },
  };
}

module.exports = { createMockDb };
