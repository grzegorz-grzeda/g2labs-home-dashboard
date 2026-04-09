function createAccessService({ db }) {
  return {
    async getAccessOverview(userContext) {
      const [groups, users] = await Promise.all([
        db.listGroups(userContext),
        db.listUsers(userContext),
      ]);

      return { groups, users };
    },

    createGroup(userContext, payload) {
      return db.createGroup(userContext, payload);
    },

    createUser(userContext, payload) {
      return db.createUser(userContext, payload);
    },

    updateUser(userContext, id, update) {
      return db.updateUser(userContext, id, update);
    },
  };
}

module.exports = { createAccessService };
