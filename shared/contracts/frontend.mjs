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

function expectNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw contractError(`${label} must be a number`);
  return value;
}

function optionalNumber(value, label) {
  if (value == null) return undefined;
  return expectNumber(value, label);
}

function expectStringArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw contractError(`${label} must be an array`);
  const items = value.map((item, index) => expectString(item, `${label}[${index}]`));
  if (items.length < min) throw contractError(`${label} must contain at least ${min} item${min === 1 ? '' : 's'}`);
  return items;
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

function parseGroupReference(value) {
  const object = expectObject(value, 'group reference');
  return {
    _id: expectString(object._id, 'group reference._id'),
    name: expectString(object.name, 'group reference.name'),
  };
}

function parseUser(value) {
  const object = expectObject(value, 'user');
  return {
    _id: expectString(object._id, 'user._id'),
    name: expectString(object.name, 'user.name'),
    username: expectString(object.username, 'user.username'),
    role: expectString(object.role, 'user.role'),
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

function parseCurrentReading(value) {
  const object = expectObject(value, 'current reading entry');
  return {
    location: parseLocation(object.location),
    reading: object.reading == null ? null : {
      temperature: expectNumber(object.reading.temperature, 'reading.temperature'),
      humidity: expectNumber(object.reading.humidity, 'reading.humidity'),
      battery: optionalNumber(object.reading.battery, 'reading.battery'),
      rssi: optionalNumber(object.reading.rssi, 'reading.rssi'),
      timestamp: expectString(object.reading.timestamp instanceof Date ? object.reading.timestamp.toISOString() : object.reading.timestamp, 'reading.timestamp'),
    },
  };
}

function parseCurrentReadingsResponse(value) {
  if (!Array.isArray(value)) throw contractError('current readings response must be an array');
  return value.map(parseCurrentReading);
}

function parseHistoryResponse(value) {
  if (!Array.isArray(value)) throw contractError('history response must be an array');
  return value.map(point => ({
    timestamp: expectString(point.timestamp instanceof Date ? point.timestamp.toISOString() : point.timestamp, 'history point.timestamp'),
    temperature: expectNumber(point.temperature, 'history point.temperature'),
    humidity: expectNumber(point.humidity, 'history point.humidity'),
    battery: optionalNumber(point.battery, 'history point.battery'),
  }));
}

function parseLocationsResponse(value) {
  if (!Array.isArray(value)) throw contractError('locations response must be an array');
  return value.map(parseLocation);
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
  return { ok: Boolean(object.ok) };
}

export {
  parseAdminAccessResponse,
  parseCurrentReadingsResponse,
  parseErrorResponse,
  parseGroup,
  parseHistoryResponse,
  parseLocation,
  parseLocationsResponse,
  parseLoginResponse,
  parseMeResponse,
  parseOkResponse,
  parseUserWithGroups,
};
