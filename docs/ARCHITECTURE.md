# Architecture

## Structure

```
src/
  server.js             — entry point: HTTP server, Socket.io, MongoDB, MQTT wiring
  app.js                — Express config: middleware and route mounts (importable without binding a port)
  mqtt/
    subscriber.js       — MQTT connection, topic subscription, emits parsed 'reading' events via EventEmitter
    atc.js              — pure ATC frame decoder (hex → { temperature, humidity, battery, frameCounter })
  services/
    readings.js         — location lookup, deduplication, DB write, Socket.io emit
  routes/
    locations.js        — CRUD for Location documents
    readings.js         — GET /api/current, GET /api/history/:locationId
  models/
    Location.js         — { name, sensorMac }
    Reading.js          — { locationId, temperature, humidity, battery, rssi, frameCounter, timestamp }
public/
  index.html
  style.css
  app.js                — dashboard UI: cards, charts, location management, theme toggle
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
  mqtt/subscriber.js
    - connects to broker
    - parses raw JSON payload
    - calls mqtt/atc.js to decode service_data hex
    - emits internal 'reading' event: { address, name, rssi, temperature, humidity, battery, frameCounter }
        │
        ▼
  services/readings.js  (listens to 'reading' event)
    - looks up Location by MAC address
    - drops silently if MAC is unassigned
    - deduplication: checks (locationId, frameCounter) within 10s window
    - writes Reading document to MongoDB
    - emits Socket.io 'reading' event to all browser clients
        │
        ├──▶ MongoDB (persistent storage)
        │
        └──▶ Browser (Socket.io — live card updates)
                │
                └── GET /api/history/:locationId  (on page load / range change)
                      - $bucketAuto aggregation, max 300 buckets
                      - timestamp averaged as $toLong → $toDate
```

## Module responsibilities

| File | Responsibility |
|---|---|
| `src/server.js` | Entry point — HTTP server, Socket.io, MongoDB, MQTT wiring |
| `src/app.js` | Express app config — middleware and route mounts, importable without a port |
| `src/mqtt/subscriber.js` | MQTT lifecycle, raw message → parsed event via EventEmitter |
| `src/mqtt/atc.js` | Decode ATC custom advertisement hex (pure function, no side effects) |
| `src/services/readings.js` | Location lookup, dedup, DB write, Socket.io emit |
| `src/routes/locations.js` | Location CRUD API |
| `src/routes/readings.js` | Current + history query API |
| `src/models/Location.js` | Mongoose schema for named sensor locations |
| `src/models/Reading.js` | Mongoose schema for timestamped sensor readings |
| `public/app.js` | Dashboard UI: cards, charts, location management, theme toggle |

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

### Architecture: layered monolith, not microservices
Single Node.js process. Modules communicate via a Node.js EventEmitter, not a message queue. This is sufficient for a local home dashboard with a handful of sensors. The layering (mqtt → service → routes) provides testability and clear ownership without the operational overhead of separate services.

### Chart scales: shared across locations, ±5 padding
All location charts use the same y-axis min/max so sensors can be visually compared. Scales are computed from the global min/max of all loaded data, with ±5 units of padding. Scales are recalculated live when an incoming reading would breach the current padding.

### Theme: CSS custom properties + localStorage
Light/dark/system modes implemented via CSS variables on `<html data-theme>`. System mode uses `prefers-color-scheme` media query. Selection persisted in `localStorage`. Charts are rebuilt on theme change so Chart.js colors update.
