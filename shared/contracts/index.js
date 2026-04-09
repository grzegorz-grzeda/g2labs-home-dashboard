function contractError(message, details = {}) {
  const err = new Error(message);
  err.code = 'CONTRACT_VIOLATION';
  Object.assign(err, details);
  return err;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectObject(value, label) {
  if (!isObject(value)) throw contractError(`${label} must be an object`);
  return value;
}

function expectString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw contractError(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalString(value, label) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') throw contractError(`${label} must be a string`);
  return value.trim();
}

function expectStringArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw contractError(`${label} must be an array`);
  const items = value.map((item, index) => expectString(item, `${label}[${index}]`));
  if (items.length < min) throw contractError(`${label} must contain at least ${min} item${min === 1 ? '' : 's'}`);
  return items;
}

function optionalStringArray(value, label, { min = 0 } = {}) {
  if (value == null) return undefined;
  return expectStringArray(value, label, { min });
}

function expectOneOf(value, allowed, label) {
  const normalized = expectString(value, label);
  if (!allowed.includes(normalized)) {
    throw contractError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return normalized;
}

function expectNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw contractError(`${label} must be a number`);
  return value;
}

function optionalNumber(value, label) {
  if (value == null) return undefined;
  return expectNumber(value, label);
}

function parseErrorResponse(value) {
  const object = expectObject(value, 'error response');
  return {
    error: expectString(object.error, 'error response.error'),
    code: expectString(object.code, 'error response.code'),
  };
}

function parseGroup(value) {
  const object = expectObject(value, 'group');
  return {
    _id: expectString(object._id, 'group._id'),
    name: expectString(object.name, 'group.name'),
    description: typeof object.description === 'string' ? object.description : '',
  };
}

function parseUser(value) {
  const object = expectObject(value, 'user');
  return {
    _id: expectString(object._id, 'user._id'),
    name: expectString(object.name, 'user.name'),
    username: expectString(object.username, 'user.username'),
    role: expectOneOf(object.role, ['admin', 'member'], 'user.role'),
    groupIds: expectStringArray(object.groupIds || [], 'user.groupIds'),
  };
}

function parseUserWithGroups(value) {
  const user = parseUser(value);
  const object = expectObject(value, 'user');
  return {
    ...user,
    groups: Array.isArray(object.groups) ? object.groups.map(parseGroupReference) : [],
  };
}

function parseGroupReference(value) {
  const object = expectObject(value, 'group reference');
  return {
    _id: expectString(object._id, 'group reference._id'),
    name: expectString(object.name, 'group reference.name'),
  };
}

function parseLocation(value) {
  const object = expectObject(value, 'location');
  return {
    _id: expectString(object._id, 'location._id'),
    name: expectString(object.name, 'location.name'),
    sensorMac: expectString(object.sensorMac, 'location.sensorMac'),
    groupId: expectString(object.groupId, 'location.groupId'),
    groupName: expectString(object.groupName, 'location.groupName'),
  };
}

function parseReading(value) {
  const object = expectObject(value, 'reading');
  return {
    locationId: expectString(object.locationId, 'reading.locationId'),
    locationName: optionalString(object.locationName, 'reading.locationName'),
    groupId: optionalString(object.groupId, 'reading.groupId'),
    temperature: expectNumber(object.temperature, 'reading.temperature'),
    humidity: expectNumber(object.humidity, 'reading.humidity'),
    battery: optionalNumber(object.battery, 'reading.battery'),
    rssi: optionalNumber(object.rssi, 'reading.rssi'),
    timestamp: expectString(object.timestamp instanceof Date ? object.timestamp.toISOString() : object.timestamp, 'reading.timestamp'),
  };
}

function parseCurrentReading(value) {
  const object = expectObject(value, 'current reading entry');
  return {
    location: parseLocation(object.location),
    reading: object.reading == null ? null : parseCurrentReadingPayload(object.reading),
  };
}

function parseCurrentReadingPayload(value) {
  const object = expectObject(value, 'current reading payload');
  return {
    temperature: expectNumber(object.temperature, 'current reading.temperature'),
    humidity: expectNumber(object.humidity, 'current reading.humidity'),
    battery: optionalNumber(object.battery, 'current reading.battery'),
    rssi: optionalNumber(object.rssi, 'current reading.rssi'),
    timestamp: expectString(object.timestamp instanceof Date ? object.timestamp.toISOString() : object.timestamp, 'current reading.timestamp'),
  };
}

function parseHistoryPoint(value) {
  const object = expectObject(value, 'history point');
  return {
    timestamp: expectString(object.timestamp instanceof Date ? object.timestamp.toISOString() : object.timestamp, 'history point.timestamp'),
    temperature: expectNumber(object.temperature, 'history point.temperature'),
    humidity: expectNumber(object.humidity, 'history point.humidity'),
    battery: optionalNumber(object.battery, 'history point.battery'),
  };
}

function parseLoginRequest(value) {
  const object = expectObject(value, 'login request');
  return {
    username: expectString(object.username, 'login request.username'),
    password: expectString(object.password, 'login request.password'),
  };
}

function parseMeResponse(value) {
  const object = expectObject(value, 'me response');
  return {
    user: parseUser(object.user),
    groups: Array.isArray(object.groups) ? object.groups.map(parseGroup) : (() => { throw contractError('me response.groups must be an array'); })(),
    allowUserOverride: Boolean(object.allowUserOverride),
  };
}

function parseLoginResponse(value) {
  const object = expectObject(value, 'login response');
  return {
    user: parseUser(object.user),
    groups: object.groups.map(parseGroup),
  };
}

function parseLocationMutation(value) {
  const object = expectObject(value, 'location mutation');
  return {
    name: expectString(object.name, 'location mutation.name'),
    sensorMac: expectString(object.sensorMac, 'location mutation.sensorMac'),
    groupId: expectString(object.groupId, 'location mutation.groupId'),
  };
}

function parseLocationUpdate(value) {
  const object = expectObject(value, 'location update');
  const parsed = {};
  if (object.name != null) parsed.name = expectString(object.name, 'location update.name');
  if (object.sensorMac != null) parsed.sensorMac = expectString(object.sensorMac, 'location update.sensorMac');
  if (object.groupId != null) parsed.groupId = expectString(object.groupId, 'location update.groupId');
  return parsed;
}

function parseCreateGroupRequest(value) {
  const object = expectObject(value, 'create group request');
  return {
    name: expectString(object.name, 'create group request.name'),
    description: typeof object.description === 'string' ? object.description.trim() : '',
  };
}

function parseCreateUserRequest(value) {
  const object = expectObject(value, 'create user request');
  return {
    name: expectString(object.name, 'create user request.name'),
    username: expectString(object.username, 'create user request.username'),
    password: expectString(object.password, 'create user request.password'),
    role: object.role == null ? 'member' : expectOneOf(object.role, ['admin', 'member'], 'create user request.role'),
    groupIds: expectStringArray(object.groupIds, 'create user request.groupIds', { min: 1 }),
  };
}

function parseUpdateUserRequest(value) {
  const object = expectObject(value, 'update user request');
  const parsed = {};
  if (object.name != null) parsed.name = expectString(object.name, 'update user request.name');
  if (object.password != null && object.password !== '') parsed.password = expectString(object.password, 'update user request.password');
  if (object.role != null) parsed.role = expectOneOf(object.role, ['admin', 'member'], 'update user request.role');
  if (object.groupIds != null) parsed.groupIds = expectStringArray(object.groupIds, 'update user request.groupIds', { min: 1 });
  return parsed;
}

function parseAdminAccessResponse(value) {
  const object = expectObject(value, 'admin access response');
  return {
    groups: object.groups.map(parseGroup),
    users: object.users.map(parseUserWithGroups),
  };
}

function parseOkResponse(value) {
  const object = expectObject(value, 'ok response');
  return {
    ok: Boolean(object.ok),
  };
}

function parseCurrentReadingsResponse(value) {
  if (!Array.isArray(value)) throw contractError('current readings response must be an array');
  return value.map(parseCurrentReading);
}

function parseLocationsResponse(value) {
  if (!Array.isArray(value)) throw contractError('locations response must be an array');
  return value.map(parseLocation);
}

function parseHistoryResponse(value) {
  if (!Array.isArray(value)) throw contractError('history response must be an array');
  return value.map(parseHistoryPoint);
}

function parseGroupsResponse(value) {
  if (!Array.isArray(value)) throw contractError('groups response must be an array');
  return value.map(parseGroup);
}

function parseUsersResponse(value) {
  if (!Array.isArray(value)) throw contractError('users response must be an array');
  return value.map(parseUserWithGroups);
}

module.exports = {
  contractError,
  parseErrorResponse,
  parseGroup,
  parseGroupReference,
  parseUser,
  parseUserWithGroups,
  parseLocation,
  parseReading,
  parseCurrentReading,
  parseCurrentReadingsResponse,
  parseHistoryPoint,
  parseHistoryResponse,
  parseLocationsResponse,
  parseGroupsResponse,
  parseUsersResponse,
  parseOkResponse,
  parseLoginRequest,
  parseLoginResponse,
  parseMeResponse,
  parseLocationMutation,
  parseLocationUpdate,
  parseCreateGroupRequest,
  parseCreateUserRequest,
  parseUpdateUserRequest,
  parseAdminAccessResponse,
};
module.exports.default = module.exports;
