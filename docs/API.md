# API Reference

This document describes the HTTP contract exposed by the dashboard backend.

The source of truth for payload parsing lives in [shared/contracts/index.js](../shared/contracts/index.js). If an endpoint, request body, response body, or error code changes, update this file in the same change.

## Conventions

- All API routes are rooted at `/api`.
- All responses are JSON.
- All routes except `POST /api/auth/login` and `POST /api/auth/logout` require an authenticated session cookie.
- Error responses use a shared envelope:

```json
{
  "error": "human readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

## Error codes

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | No valid authenticated session was provided |
| `INVALID_CREDENTIALS` | Login username or password was rejected |
| `INVALID_REQUEST` | The request body failed contract validation |
| `FORBIDDEN_GROUP` | The authenticated user cannot access the requested group or location |
| `FORBIDDEN_ADMIN` | The authenticated user is not an admin |
| `USER_NOT_FOUND` | The session or explicit user override points at an unknown user |
| `NOT_FOUND` | The requested entity does not exist or is not visible to the current user |
| `DUPLICATE_SENSOR_MAC` | A location already uses that sensor MAC |
| `DUPLICATE_GROUP` | A group with that name already exists |
| `DUPLICATE_USERNAME` | A user with that username already exists |
| `CONTRACT_VIOLATION` | The backend generated a payload that failed shared contract validation |
| `INTERNAL_SERVER_ERROR` | Unexpected server-side failure |

## Authentication

### `POST /api/auth/login`

Authenticates a user and sets an HTTP-only signed session cookie.

Request body:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Success `200`:

```json
{
  "user": {
    "_id": "660000000000000000000001",
    "name": "Default Admin",
    "username": "admin",
    "role": "admin",
    "groupIds": ["660000000000000000000010"]
  },
  "groups": [
    {
      "_id": "660000000000000000000010",
      "name": "Default Home",
      "description": ""
    }
  ]
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 INVALID_CREDENTIALS`

### `POST /api/auth/logout`

Clears the current session cookie.

Success `200`:

```json
{
  "ok": true
}
```

### `GET /api/me`

Returns the authenticated user context resolved from the session cookie.

Success `200`:

```json
{
  "user": {
    "_id": "660000000000000000000001",
    "name": "Default Admin",
    "username": "admin",
    "role": "admin",
    "groupIds": ["660000000000000000000010"]
  },
  "groups": [
    {
      "_id": "660000000000000000000010",
      "name": "Default Home",
      "description": ""
    }
  ],
  "allowUserOverride": false
}
```

Common errors:

- `401 AUTH_REQUIRED`
- `401 USER_NOT_FOUND`

## Readings

### `GET /api/current`

Returns the latest visible reading per visible location for the current user.

Success `200`:

```json
[
  {
    "location": {
      "_id": "660000000000000000000100",
      "name": "Living Room",
      "sensorMac": "AA:BB:CC:DD:EE:FF",
      "groupId": "660000000000000000000010",
      "groupName": "Default Home"
    },
    "reading": {
      "temperature": 21.3,
      "humidity": 48,
      "battery": 92,
      "rssi": -63,
      "timestamp": "2026-04-09T18:42:00.000Z"
    }
  }
]
```

Common errors:

- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_GROUP`

### `GET /api/history/:locationId`

Returns time-bucketed history for one visible location.

Query parameters:

- `hours`
  Number of hours to include. Defaults to `24`.

Success `200`:

```json
[
  {
    "timestamp": "2026-04-09T17:00:00.000Z",
    "temperature": 21.1,
    "humidity": 47.5,
    "battery": 92
  }
]
```

Common errors:

- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_GROUP`

## Locations

### `GET /api/locations`

Returns all locations visible to the current user.

Success `200`:

```json
[
  {
    "_id": "660000000000000000000100",
    "name": "Living Room",
    "sensorMac": "AA:BB:CC:DD:EE:FF",
    "groupId": "660000000000000000000010",
    "groupName": "Default Home"
  }
]
```

Common errors:

- `401 AUTH_REQUIRED`

### `POST /api/locations`

Creates a location in a group visible to the current user.

Request body:

```json
{
  "name": "Kitchen",
  "sensorMac": "11:22:33:44:55:66",
  "groupId": "660000000000000000000010"
}
```

Success `201`:

```json
{
  "_id": "660000000000000000000101",
  "name": "Kitchen",
  "sensorMac": "11:22:33:44:55:66",
  "groupId": "660000000000000000000010",
  "groupName": "Default Home"
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_GROUP`
- `409 DUPLICATE_SENSOR_MAC`

### `PUT /api/locations/:id`

Updates one visible location. Any subset of the documented fields may be sent.

Request body:

```json
{
  "name": "Kitchen South",
  "sensorMac": "11:22:33:44:55:66",
  "groupId": "660000000000000000000010"
}
```

Success `200`:

```json
{
  "_id": "660000000000000000000101",
  "name": "Kitchen South",
  "sensorMac": "11:22:33:44:55:66",
  "groupId": "660000000000000000000010",
  "groupName": "Default Home"
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_GROUP`
- `404 NOT_FOUND`
- `409 DUPLICATE_SENSOR_MAC`

### `DELETE /api/locations/:id`

Deletes one visible location and its readings.

Success `200`:

```json
{
  "ok": true
}
```

Common errors:

- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_GROUP`
- `404 NOT_FOUND`

## Admin

All `/api/admin/*` routes require an authenticated admin user.

### `GET /api/admin/access`

Returns the current access-management view: all groups and all users.

Success `200`:

```json
{
  "groups": [
    {
      "_id": "660000000000000000000010",
      "name": "Default Home",
      "description": ""
    }
  ],
  "users": [
    {
      "_id": "660000000000000000000001",
      "name": "Default Admin",
      "username": "admin",
      "role": "admin",
      "groupIds": ["660000000000000000000010"],
      "groups": [
        {
          "_id": "660000000000000000000010",
          "name": "Default Home"
        }
      ]
    }
  ]
}
```

Common errors:

- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_ADMIN`

### `POST /api/admin/groups`

Creates a new group.

Request body:

```json
{
  "name": "Garage",
  "description": "Detached garage sensors"
}
```

Success `201`:

```json
{
  "_id": "660000000000000000000020",
  "name": "Garage",
  "description": "Detached garage sensors"
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_ADMIN`
- `409 DUPLICATE_GROUP`

### `POST /api/admin/users`

Creates a new user.

Request body:

```json
{
  "name": "Anna",
  "username": "anna",
  "password": "anna",
  "role": "member",
  "groupIds": ["660000000000000000000010"]
}
```

Success `201`:

```json
{
  "_id": "660000000000000000000002",
  "name": "Anna",
  "username": "anna",
  "role": "member",
  "groupIds": ["660000000000000000000010"],
  "groups": [
    {
      "_id": "660000000000000000000010",
      "name": "Default Home"
    }
  ]
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_ADMIN`
- `409 DUPLICATE_USERNAME`

### `PUT /api/admin/users/:id`

Updates an existing user. Any subset of the fields below may be sent.

Request body:

```json
{
  "name": "Anna Kowalska",
  "password": "new-password",
  "role": "member",
  "groupIds": ["660000000000000000000010"]
}
```

Success `200`:

```json
{
  "_id": "660000000000000000000002",
  "name": "Anna Kowalska",
  "username": "anna",
  "role": "member",
  "groupIds": ["660000000000000000000010"],
  "groups": [
    {
      "_id": "660000000000000000000010",
      "name": "Default Home"
    }
  ]
}
```

Common errors:

- `400 INVALID_REQUEST`
- `401 AUTH_REQUIRED`
- `403 FORBIDDEN_ADMIN`
- `404 NOT_FOUND`

## Maintenance rule

When changing any of the following, update this file in the same change:

- adding or removing API endpoints
- changing request body fields
- changing response body fields
- changing error codes or authorization behavior
- changing session or authentication flow that affects API usage
