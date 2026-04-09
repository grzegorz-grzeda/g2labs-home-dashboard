const { hashPassword } = require('../auth');

async function ensureDefaultAccessContext({
  Group,
  Location,
  User,
  defaultAdminPassword,
  defaultUserPassword,
}) {
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
        { passwordHash: { $exists: false } },
        { passwordHash: null },
        { passwordHash: '' },
      ],
    },
    { $set: { passwordHash: hashPassword(defaultUserPassword) } }
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
      passwordHash: hashPassword(defaultAdminPassword),
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

module.exports = { ensureDefaultAccessContext };
