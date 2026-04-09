import {
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
} from '../../shared/contracts/frontend.mjs';

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin' });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    if (body) throw parseErrorResponse(body);
    throw { code: 'HTTP_ERROR', error: `Request failed with ${response.status}` };
  }

  return body;
}

export async function login(credentials) {
  return parseLoginResponse(await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  }));
}

export async function logout() {
  return parseOkResponse(await request('/api/auth/logout', { method: 'POST' }));
}

export async function getMe() {
  return parseMeResponse(await request('/api/me'));
}

export async function getCurrentReadings() {
  return parseCurrentReadingsResponse(await request('/api/current'));
}

export async function getLocations() {
  return parseLocationsResponse(await request('/api/locations'));
}

export async function createLocation(payload) {
  return parseLocation(await request('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function updateLocation(id, payload) {
  return parseLocation(await request(`/api/locations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function deleteLocation(id) {
  return parseOkResponse(await request(`/api/locations/${id}`, { method: 'DELETE' }));
}

export async function getHistory(locationId, hours) {
  return parseHistoryResponse(await request(`/api/history/${locationId}?hours=${hours}`));
}

export async function getAdminAccess() {
  return parseAdminAccessResponse(await request('/api/admin/access'));
}

export async function createGroup(payload) {
  return parseGroup(await request('/api/admin/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function createUser(payload) {
  return parseUserWithGroups(await request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function updateUser(id, payload) {
  return parseUserWithGroups(await request(`/api/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}
