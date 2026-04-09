const mongoose = require('mongoose');
const Group = require('../../models/Group');
const Location = require('../../models/Location');
const Reading = require('../../models/Reading');
const User = require('../../models/User');

function normalizeSensorMac(sensorMac) {
  return sensorMac.toUpperCase();
}

function forbiddenGroupError() {
  const err = new Error('group access denied');
  err.code = 'FORBIDDEN_GROUP';
  return err;
}

function userNotFoundError() {
  const err = new Error('unknown user context');
  err.code = 'USER_NOT_FOUND';
  return err;
}

function locationToView(location) {
  return {
    ...location,
    _id: location._id.toString(),
    groupId: location.groupId?._id
      ? location.groupId._id.toString()
      : location.groupId?.toString?.() || null,
    groupName: location.groupId?.name || location.groupName,
  };
}

function hasGroupAccess(userContext, groupId) {
  if (userContext.role === 'admin') return true;
  if (!groupId) return false;
  return userContext.groupIds.includes(groupId.toString());
}

function serializeGroups(groups) {
  return groups.map(group => ({
    _id: group._id.toString(),
    name: group.name,
    description: group.description || '',
  }));
}

function serializeUser(user, groupIds) {
  return {
    _id: user._id.toString(),
    name: user.name,
    username: user.username,
    role: user.role || 'member',
    groupIds,
  };
}

function extractGroupIds(groupsOrIds) {
  return (groupsOrIds || []).map(groupOrId => {
    if (groupOrId?._id) return groupOrId._id.toString();
    return groupOrId.toString();
  });
}

function getVisibleGroupsForUser(user, allGroups) {
  if ((user.role || 'member') === 'admin') return allGroups;
  const userGroupIds = extractGroupIds(user.groupIds);
  return allGroups.filter(group => userGroupIds.includes(group._id.toString()));
}

async function buildUserContext(user) {
  const allGroups = await Group.find().lean();
  const visibleGroups = getVisibleGroupsForUser(user, allGroups);
  const groupIds = visibleGroups.map(group => group._id.toString());

  return {
    user: serializeUser(user, groupIds),
    groups: serializeGroups(visibleGroups),
    groupIds,
    role: user.role || 'member',
  };
}

async function ensureDefaultAccessContext() {
  let defaultGroup = await Group.findOne({ name: 'Default Home' });
  if (!defaultGroup) {
    defaultGroup = await Group.create({
      name: 'Default Home',
      description: 'Auto-created default group for existing installations',
    });
  }

  await Location.updateMany(
    {
      $or: [
        { groupId: { $exists: false } },
        { groupId: null },
      ],
    },
    { $set: { groupId: defaultGroup._id } }
  );

  await User.updateMany(
    {
      $or: [
        { role: { $exists: false } },
        { role: null },
      ],
    },
    { $set: { role: 'member' } }
  );

  await User.updateMany(
    {
      $or: [
        { groupIds: { $exists: false } },
        { groupIds: { $size: 0 } },
      ],
    },
    { $set: { groupIds: [defaultGroup._id] } }
  );

  const userCount = await User.countDocuments();
  if (userCount === 0) {
    await User.create({
      name: 'Default Admin',
      username: 'admin',
      role: 'admin',
      groupIds: [defaultGroup._id],
    });
    return;
  }

  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount === 0) {
    const firstUser = await User.findOne().sort({ _id: 1 });
    if (firstUser) {
      firstUser.role = 'admin';
      if (!firstUser.groupIds || firstUser.groupIds.length === 0) {
        firstUser.groupIds = [defaultGroup._id];
      }
      await firstUser.save();
    }
  }
}

function createMongoDb({ connectionString }) {
  return {
    async connect() {
      await mongoose.connect(connectionString);
      await ensureDefaultAccessContext();
    },

    async disconnect() {
      await mongoose.disconnect();
    },

    async resolveUserContext(userId, { failIfMissing = false } = {}) {
      const query = userId ? { _id: userId } : {};
      const user = await User.findOne(query).populate('groupIds').lean();
      if (!user) {
        if (failIfMissing) throw userNotFoundError();
        const defaultUser = await User.findOne().populate('groupIds').lean();
        if (!defaultUser) throw userNotFoundError();
        return buildUserContext(defaultUser);
      }

      return buildUserContext(user);
    },

    async listUsers() {
      const users = await User.find().populate('groupIds').lean();
      return users.map(user => ({
        _id: user._id.toString(),
        name: user.name,
        username: user.username,
        role: user.role || 'member',
        groupIds: extractGroupIds(user.groupIds),
        groups: (user.groupIds || []).map(group => ({
          _id: group._id ? group._id.toString() : group.toString(),
          name: group.name || '',
        })),
      }));
    },

    async listLocations(userContext) {
      const locations = await Location.find({ groupId: { $in: userContext.groupIds } }).populate('groupId').lean();
      return locations.map(locationToView);
    },

    async createLocation(userContext, { name, sensorMac, groupId }) {
      if (!hasGroupAccess(userContext, groupId)) throw forbiddenGroupError();
      const location = await Location.create({
        name,
        sensorMac: normalizeSensorMac(sensorMac),
        groupId,
      });
      const fullLocation = await Location.findById(location._id).populate('groupId').lean();
      return locationToView(fullLocation);
    },

    async updateLocation(userContext, id, update) {
      const existing = await Location.findById(id).lean();
      if (!existing) return null;
      if (!hasGroupAccess(userContext, existing.groupId)) throw forbiddenGroupError();
      if (update.groupId && !hasGroupAccess(userContext, update.groupId)) throw forbiddenGroupError();

      const patch = {};
      if (update.name) patch.name = update.name;
      if (update.sensorMac) patch.sensorMac = normalizeSensorMac(update.sensorMac);
      if (update.groupId) patch.groupId = update.groupId;

      const location = await Location.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
      if (!location) return null;
      const fullLocation = await Location.findById(location._id).populate('groupId').lean();
      return locationToView(fullLocation);
    },

    async deleteLocation(userContext, id) {
      const existing = await Location.findById(id).lean();
      if (!existing) return false;
      if (!hasGroupAccess(userContext, existing.groupId)) throw forbiddenGroupError();
      const location = await Location.findByIdAndDelete(id);
      if (!location) return false;
      await Reading.deleteMany({ locationId: id });
      return true;
    },

    async findLocationBySensorMac(sensorMac) {
      const location = await Location.findOne({ sensorMac: normalizeSensorMac(sensorMac) }).lean();
      if (!location) return null;
      if (!location.groupId) return null;
      return {
        ...location,
        _id: location._id.toString(),
        groupId: location.groupId.toString(),
      };
    },

    async hasRecentReadingWithFrameCounter({ locationId, frameCounter, since }) {
      return Boolean(await Reading.exists({
        locationId,
        frameCounter,
        timestamp: { $gte: since },
      }));
    },

    async createReading(reading) {
      const doc = await Reading.create(reading);
      return doc.toObject();
    },

    async getCurrentReadings(userContext) {
      const locations = await Location.find({ groupId: { $in: userContext.groupIds } }).populate('groupId').lean();
      return Promise.all(
        locations.map(async location => {
          const reading = await Reading.findOne({ locationId: location._id }).sort({ timestamp: -1 }).lean();
          return { location: locationToView(location), reading };
        })
      );
    },

    async getHistory(userContext, locationId, { hours, buckets }) {
      const location = await Location.findById(locationId).lean();
      if (!location) return [];
      if (!hasGroupAccess(userContext, location.groupId)) throw forbiddenGroupError();
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const objectId = new mongoose.Types.ObjectId(locationId);

      return Reading.aggregate([
        { $match: { locationId: objectId, timestamp: { $gte: since } } },
        { $sort: { timestamp: 1 } },
        {
          $bucketAuto: {
            groupBy: '$timestamp',
            buckets,
            output: {
              timestamp: { $avg: { $toLong: '$timestamp' } },
              temperature: { $avg: '$temperature' },
              humidity: { $avg: '$humidity' },
              battery: { $last: '$battery' },
            },
          },
        },
        { $addFields: { timestamp: { $toDate: '$timestamp' } } },
        { $sort: { timestamp: 1 } },
      ]);
    },
  };
}

module.exports = {
  createMongoDb,
  __testables: {
    extractGroupIds,
    getVisibleGroupsForUser,
    hasGroupAccess,
  },
};
