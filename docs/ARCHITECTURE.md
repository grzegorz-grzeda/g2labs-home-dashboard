# Architecture

## Structure

```
src/
  server.js             — entry point and composition root: HTTP server, Socket.io, db, reading source wiring
  app.js                — Express app factory: middleware and route mounts with injected dependencies
  auth.js               — password hashing and signed session cookie helpers
  config.js             — env parsing and runtime mode selection
  adapters/
    db/
      mongo.js          — MongoDB-backed db adapter
      mock.js           — in-memory db adapter for tests/demo mode
  mqtt/
    subscriber.js       — MQTT connection, topic subscription, emits parsed 'reading' events via EventEmitter
    mock-generator.js   — generated readings source for tests/demo mode
    atc.js              — pure ATC frame decoder (hex → { temperature, humidity, battery, frameCounter })
  services/
    readings.js         — injected reading handler: location lookup, deduplication, DB write, Socket.io emit
  routes/
    admin.js            — admin-only router factory for groups and user access management
    locations.js        — location CRUD router factory
    readings.js         — readings query router factory
  models/
    Group.js            — { name, description }
    User.js             — { name, username, passwordHash, role, groupIds[] }
    Location.js         — { name, sensorMac, groupId }
    Reading.js          — { locationId, temperature, humidity, battery, rssi, frameCounter, timestamp }
frontend/
  index.html            — Vite entry HTML
  src/
    main.jsx            — React entry point
    App.jsx             — dashboard SPA shell and state management
    styles.css          — dashboard styles
frontend-dist/          — generated client build served by Express (gitignored)
docs/
  ARCHITECTURE.md
  img/
```

## Data flow

```
ATC MiThermometer (BLE advertisement)
        │
      blester (one or more RPi scanners)
        │ MQTT  topic: atc  or  atc/#
        ▼
  mqtt/subscriber.js or mqtt/mock-generator.js
    - connects to broker and parses messages
      or generates synthetic readings in test mode
    - emits internal 'reading' event: { address, rssi, temperature, humidity, battery, frameCounter }
        │
        ▼
  services/readings.js  (injected handler)
    - looks up Location by MAC address
    - drops silently if MAC is unassigned
    - deduplication: checks (locationId, frameCounter) within 10s window
    - writes Reading through the configured db adapter
    - emits Socket.io 'reading' only to sockets whose user context can access the location's group
        │
        ├──▶ MongoDB (persistent storage)
        │
        ├──▶ Mock DB (test/demo mode)
        │
        └──▶ Browser (Socket.io — live card updates)
                │
                ├── POST /api/auth/login
                │   - verifies credentials and sets a signed session cookie
                │
                ├── GET /api/me
                │   - resolves the current user context
                │   - returns the authenticated user and visible groups
                │
                ├── /api/admin/*
                │   - admin-only group and user management
                │
                └── GET /api/history/:locationId  (on page load / range change)
                      - route is filtered by the current user's accessible groups
                      - Mongo: $bucketAuto aggregation, max 300 buckets
                      - Mock DB: equivalent in-memory bucketing
```

## Module responsibilities

| File | Responsibility |
|---|---|
| `src/server.js` | Entry point and composition root — injects db + reading source adapters |
| `src/app.js` | Express app factory — middleware and route mounts with injected dependencies |
| `src/auth.js` | Password hashing and signed session cookie helpers |
| `src/config.js` | Runtime config and mode selection |
| `src/adapters/db/mongo.js` | Mongo-backed db adapter |
| `src/adapters/db/mock.js` | In-memory db adapter for test/demo mode |
| `src/mqtt/subscriber.js` | MQTT lifecycle, raw message → parsed event via EventEmitter |
| `src/mqtt/mock-generator.js` | Synthetic reading source for tests and local demos |
| `src/mqtt/atc.js` | Decode ATC custom advertisement hex (pure function, no side effects) |
| `src/services/readings.js` | Injected reading handler: lookup, dedup, DB write, Socket.io emit |
| `src/routes/admin.js` | Admin-only router for groups and user membership management |
| `src/routes/locations.js` | Location CRUD router factory |
| `src/routes/readings.js` | Current + history query router factory |
| `src/models/Group.js` | Mongoose schema for access-control groups |
| `src/models/User.js` | Mongoose schema for users and group membership |
| `src/models/Location.js` | Mongoose schema for named sensor locations |
| `src/models/Reading.js` | Mongoose schema for timestamped sensor readings |
| `frontend/src/App.jsx` | React dashboard UI: login/logout, cards, charts, access management, location management, theme toggle |
| `frontend/src/styles.css` | Client-side styling for the React dashboard |
| `vite.config.js` | Vite build config targeting `frontend-dist/` |

## Decisions log

### Storage: raw writes + query-time aggregation
Every raw MQTT reading is written immediately. The `/api/history` endpoint uses MongoDB `$bucketAuto` to downsample into at most `CHART_BUCKETS` (default 300) points for the chart. This avoids data loss while keeping chart performance constant regardless of time range.

Alternatives considered: averaging buffer (loses data), last-value-per-interval (synthetic gaps), min/max/avg per document (adds complexity for marginal gain).

### Deduplication: frame counter + time window
The ATC advertisement includes a uint8 frame counter (byte 12). Multiple RPi scanners seeing the same BLE frame produce identical MQTT messages. Before writing, check if `(locationId, frameCounter)` was stored within the last 10 seconds. If yes, drop the duplicate.

A unique index on `(locationId, frameCounter)` alone was rejected because the counter wraps at 255, causing false collisions. The time window bounds the dedup scope correctly.

### Location model: assignment at write time
Readings store a `locationId` (ObjectId) stamped at ingest time, not the raw MAC. If a sensor is reassigned to a different location, historical readings stay with the original location (they reflect where the sensor physically was). Unassigned MACs are silently dropped.

Deleting a location cascades to delete its readings (clean slate, no orphans).

### Access control: users see locations through groups
Each location belongs to one group. Users can belong to multiple groups. Read access for current readings, history, location rows, and live Socket.io updates is granted when the location's `groupId` is in the user's `groupIds`.

The current user is resolved through a signed session cookie shared by HTTP requests and Socket.io handshakes. Test mode can optionally allow explicit user overrides for debugging, but the standard user flow is authenticated login.

Admins are a special case: an admin can access all groups and serves as the default bootstrap user for fresh or migrated MongoDB deployments.

### Admin operations: manage access from the dashboard
The dashboard includes an admin-only Access Management section. It is backed by `/api/admin/access`, `/api/admin/groups`, and `/api/admin/users*`. Admins can create groups, create users, and update a user's role or group membership without editing Mongo documents directly.

### Authentication: local credentials, signed cookies
Passwords are stored as salted `scrypt` hashes. Successful login returns an HTTP-only signed cookie. That cookie is the single source of truth for both API authorization and live Socket.io subscriptions, which keeps browser refreshes and websocket reconnects consistent without a separate session store.

The test suite includes direct HTTP integration coverage for `401` and `403` access-control behavior in addition to UI-level Playwright flows.

### Frontend: React SPA built with Vite
The browser UI is now a dedicated React application under `frontend/`. Express serves the compiled assets from `frontend-dist/`, which is produced by `npm run build:client`. This keeps the backend API and Socket.io wiring unchanged while giving the frontend proper component/state structure.

### API contract: shared parsers between frontend and backend
The project uses shared contract parsers in `shared/contracts/`. Routes validate incoming request bodies and validate outgoing response shapes before sending JSON. The React frontend consumes the same contract layer through a small API client, which keeps both sides aligned on payload structure and error codes.

### Architecture: layered monolith, not microservices
Single Node.js process. Modules communicate via a Node.js EventEmitter, not a message queue. This is sufficient for a local home dashboard with a handful of sensors. The layering (mqtt → service → routes) provides testability and clear ownership without the operational overhead of separate services.

### Dependency injection: adapters chosen at startup
The entry point composes the app from injected dependencies. Production uses MongoDB + MQTT. Test/demo mode can swap these for an in-memory db and a generated reading source without changing route logic, Socket.io behavior, or reading processing rules.

### Chart scales: shared across locations, ±5 padding
All location charts use the same y-axis min/max so sensors can be visually compared. Scales are computed from the global min/max of all loaded data, with ±5 units of padding. Scales are recalculated live when an incoming reading would breach the current padding.

### Theme: CSS custom properties + localStorage
Light/dark/system modes implemented via CSS variables on `<html data-theme>`. System mode uses `prefers-color-scheme` media query. Selection persisted in `localStorage`. Charts are rebuilt on theme change so Chart.js colors update.
