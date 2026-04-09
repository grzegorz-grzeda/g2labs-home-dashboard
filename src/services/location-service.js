function createLocationService({ db }) {
  return {
    listLocations(userContext) {
      return db.listLocations(userContext);
    },

    createLocation(userContext, payload) {
      return db.createLocation(userContext, payload);
    },

    updateLocation(userContext, id, update) {
      return db.updateLocation(userContext, id, update);
    },

    deleteLocation(userContext, id) {
      return db.deleteLocation(userContext, id);
    },
  };
}

module.exports = { createLocationService };
