function createAuthService({ db, sessionSecret, allowUserOverride, getSessionUserId, serializeSessionCookie, serializeLogoutCookie }) {
  async function resolveRequestUserContext(req) {
    const overrideUserId = allowUserOverride ? (req.header('x-user-id') || req.query.userId || null) : null;
    const sessionUserId = getSessionUserId(req.headers.cookie, sessionSecret);
    const requestedUserId = overrideUserId || sessionUserId || null;

    if (!requestedUserId) return null;
    return db.resolveUserContext(requestedUserId, { failIfMissing: true });
  }

  async function authenticate({ username, password }) {
    const userContext = await db.authenticateUser(username, password);
    if (!userContext) return null;

    return {
      userContext,
      sessionCookie: serializeSessionCookie(userContext.user._id, sessionSecret),
    };
  }

  function createLogoutCookie() {
    return serializeLogoutCookie();
  }

  function describeMe(userContext) {
    return {
      user: userContext.user,
      groups: userContext.groups,
      allowUserOverride,
    };
  }

  return {
    resolveRequestUserContext,
    authenticate,
    createLogoutCookie,
    describeMe,
  };
}

module.exports = { createAuthService };
