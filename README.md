# g2labs-home-dashboard

A local web dashboard for ATC MiThermometer BLE sensor data. Subscribes to MQTT topics published by [blester](https://github.com/g2labs/blester), stores readings in MongoDB, and presents current values and historical plots in a browser.

![Dashboard screenshot](docs/img/screenshot.png)

## Features

- Parses ATC custom advertisement format from blester MQTT payloads
- Group-aware location management — assign sensor MACs to named rooms and groups via the UI
- User context with group-based access control for location readouts
- Admin access management for groups, roles, and user membership
- Local username/password login with cookie-backed sessions
- Historical charts with automatic resolution scaling (`$bucketAuto`) across any time range
- Shared y-axis scales across all location charts with ±5 padding
- Real-time card updates via Socket.io
- Light / dark / system theme toggle, persisted in localStorage

## Requirements

- Node.js 18+
- MongoDB (local or remote)
- An MQTT broker reachable from the machine running this app
- [blester](https://github.com/g2labs/blester) scanning ATC MiThermometer devices and publishing to the `atc` topic

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and adjust as needed (all values have defaults):

```bash
cp .env.example .env
```

Note: `.env.example` is a sample local-network configuration. If you omit a variable entirely, the application falls back to the runtime defaults listed below.

## Configuration

| Variable | Runtime default | Description |
|---|---|---|
| `APP_MODE` | `production` | Use `test` to run with the mock DB and generated readings |
| `DB_DRIVER` | `mongo` in production, `mock` in test mode | Force database adapter selection |
| `READING_SOURCE` | `mqtt` in production, `generator` in test mode | Force live MQTT or generated readings |
| `MQTT_BROKER` | `mqtt://localhost:1883` | MQTT broker URL |
| `MQTT_TOPIC` | `atc` | Topic to subscribe to (also subscribes to `atc/#`) |
| `MONGODB_URI` | `mongodb://localhost:27017/home-dashboard` | MongoDB connection string |
| `PORT` | `3000` | HTTP port |
| `CHART_BUCKETS` | `300` | Max data points per chart (aggregated by MongoDB) |
| `MOCK_INTERVAL_MS` | `5000` | Reading interval for the mock generator in test mode |
| `SESSION_SECRET` | `local-dashboard-dev-secret` | HMAC secret used to sign session cookies |
| `DEFAULT_ADMIN_PASSWORD` | `admin` | Bootstrap password for the auto-created default admin |
| `DEFAULT_USER_PASSWORD` | `changeme` | Password used when backfilling legacy users without a password |
| `ALLOW_USER_OVERRIDE` | `true` in test mode, otherwise `false` | Allows `x-user-id` override for API/socket debugging |

## Running

```bash
# Production
npm start

# Backend development (auto-restarts on file change)
npm run dev

# Frontend development (Vite)
npm run dev:client

# Test/demo mode with mock DB + generated readings
APP_MODE=test npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Mongo bootstrap

For existing Mongo-backed installs, you can now run the access bootstrap explicitly:

```bash
npm run bootstrap:mongo
```

That command applies the same default-access migration used by the server at startup:

- creates `Default Home` if no groups exist
- creates `Default Admin` if no users exist
- backfills missing `groupId`, `groupIds`, `role`, and `passwordHash` fields on legacy documents
- promotes the first user to `admin` if no admin exists yet

This is useful when preparing a database ahead of deployment instead of relying on implicit startup repair.

## Test mode

For UI testing or local development without MongoDB and MQTT, run:

```bash
APP_MODE=test npm start
```

In test mode:

- the database dependency is injected as an in-memory mock adapter
- the MQTT dependency is injected as a generated reading source
- the dashboard still uses the same HTTP routes and Socket.io updates as production
- seeded users and groups are available through the login form for auth and access-control testing
- the React frontend is built from `frontend/` into `frontend-dist/` and then served by Express

## UI testing

Playwright smoke tests can run against the injected mock mode, so the browser exercises the real dashboard without external dependencies.

```bash
npm install
npx playwright install
npm test
```

Or run the suites individually:

```bash
npm run test:unit
npm run test:ui
```

The Playwright config starts the app automatically with:

```bash
APP_MODE=test PORT=4173 MOCK_INTERVAL_MS=250 npm run start:test
```

## Frontend structure

The browser UI now lives in a dedicated React/Vite project:

- `frontend/` contains the source app
- `frontend-dist/` contains the generated build output
- Express serves the compiled frontend from `frontend-dist/`
- [docs/API.md](docs/API.md) documents the HTTP contract used between the React app and the backend
- [docs/OPERATIONS.md](docs/OPERATIONS.md) covers runtime/bootstrap/maintenance workflows
- [docs/TESTING.md](docs/TESTING.md) explains the current test layers and commands
- [docs/MIGRATIONS.md](docs/MIGRATIONS.md) records important data-model and bootstrap transitions

## Versioning

- The application version follows SemVer from [package.json](package.json).
- The current HTTP contract is API `v1`.
- New frontend and external clients should call `/api/v1/*`.
- The legacy `/api/*` prefix is still accepted as a backward-compatible alias while the versioned API settles.
- Any breaking API contract change should introduce a new API version and update [docs/API.md](docs/API.md) in the same change.

Current coverage includes:

- API-level authentication and authorization responses
- direct service-layer coverage for auth, access, locations, readings queries, and Mongo bootstrap behavior
- shared contract validation for key API request/response shapes
- dashboard smoke test for seeded cards and charts
- login flow with persisted authenticated sessions
- clock format toggle behavior
- location CRUD flow in the mock DB
- member login and group-based access filtering
- admin group and membership management flow
- mobile viewport smoke test

## Authentication and access

Locations belong to a single group. Users can belong to one or more groups. A user can view current readings, historical charts, and location rows only for locations assigned to one of their groups.

The current implementation uses local username/password authentication with signed cookie sessions:

- `POST /api/auth/login` verifies credentials and sets an HTTP-only session cookie
- the canonical API prefix is `/api/v1`, with `/api` kept as a compatibility alias
- HTTP requests resolve the current user from that cookie
- Socket.io connections resolve the current user from the same cookie during the handshake
- `ALLOW_USER_OVERRIDE=true` can still be used in test mode for request/socket debugging
- admins get an Access Management section in the UI for creating groups, creating users, and updating user roles/group membership

In test mode, the seeded users are:

- `Grzegorz` / password `grzegorz` as an `admin`, with access to all groups
- `Anna` / password `anna` with access to `Family`

Default Mongo bootstrap behavior:

- if no groups exist, the app creates `Default Home`
- if no users exist, the app creates `Default Admin` with username `admin`, role `admin`, and password from `DEFAULT_ADMIN_PASSWORD`
- existing locations without a `groupId` are assigned to `Default Home`
- users missing `groupIds` are backfilled to `Default Home`
- users missing `passwordHash` are backfilled to `DEFAULT_USER_PASSWORD`
- if no admin exists, the first user is promoted to `admin`

## Backend structure

The backend now uses a small application-service layer between routes and adapters:

- `src/services/auth-service.js` handles request user resolution, login, logout cookie creation, and `/api/me`
- `src/services/location-service.js` handles location CRUD orchestration
- `src/services/access-service.js` handles admin access-management orchestration
- `src/services/readings-query-service.js` handles current/history query orchestration
- `src/bootstrap/access-bootstrap.js` contains the shared Mongo default-access bootstrap path used by both startup and `npm run bootstrap:mongo`

## Data flow

```
ATC MiThermometer (BLE)
        │
      blester
        │ MQTT  topic: atc
        ▼
  g2labs-home-dashboard
        │ saves raw readings
        ▼
     MongoDB
        │ $bucketAuto aggregation
        ▼
   Browser dashboard
```

## MQTT payload

Blester publishes BLE advertisement data as JSON. The dashboard decodes temperature, humidity, and battery from the ATC custom service UUID (`0000181a-0000-1000-8000-00805f9b34fb`):

```json
{
  "address": "AA:BB:CC:DD:EE:FF",
  "name": "ATC_XXXX",
  "rssi": -65,
  "service_data": {
    "0000181a-0000-1000-8000-00805f9b34fb": "aabbccddeeff09c12d6013880a"
  }
}
```

Readings from unassigned MACs are silently dropped. Assign a sensor to a location via the Locations panel in the UI.

## License

MIT
