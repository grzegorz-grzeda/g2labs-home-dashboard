# Project guidance

## Start here

Read only the files relevant to the area you are changing:

- Always read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing data flow, ingestion, persistence, or charting behavior.
- Read [src/app.js](src/app.js) and [src/server.js](src/server.js) when changing app wiring, middleware, HTTP setup, Socket.io, MongoDB startup, or MQTT startup.
- Read [src/models/](src/models/) when changing stored fields, validation, or delete behavior.
- Read [src/mqtt/](src/mqtt/) when changing ATC parsing or MQTT topic handling.
- Read [src/services/](src/services/) when changing deduplication, DB writes, or socket emission.
- Read [src/routes/](src/routes/) when changing HTTP endpoints.
- Read [docs/API.md](docs/API.md) and [shared/contracts/](shared/contracts/) when changing API endpoints, request/response payloads, error codes, or authentication behavior.
- Read [frontend/](frontend/) when changing dashboard UI behavior, theming, or responsive layout.

## Running the project

```bash
npm start
npm run dev
```

This project expects MongoDB and an MQTT broker. Current defaults are documented in [README.md](README.md).

## Architecture rules

The intended flow is `mqtt/` -> `services/` -> `routes/`, with event-based coordination where needed.

- New MQTT parsing and subscription logic belongs in `src/mqtt/`.
- Business logic belongs in `src/services/`.
- HTTP endpoints belong in `src/routes/`.
- Keep `src/server.js` and `src/app.js` focused on wiring and startup.

## Preserve these decisions

- Check the decisions log in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before proposing alternatives to settled choices.
- All sensor readings are written raw to MongoDB immediately. Do not buffer or average on write.
- Deduplication uses the ATC frame counter plus a 10-second time window. Do not replace this with a unique index.
- Readings are stamped with `locationId` at ingest time. Reassigning a sensor must not move historical data.
- Deleting a location must also delete its readings.
- Locations belong to exactly one group.
- Users can belong to multiple groups.
- Users have a role; admin users can access all groups.
- Users authenticate with username/password and a signed cookie-backed session.
- Location and reading visibility must always be filtered through the current user's accessible groups for both HTTP responses and live Socket.io updates.
- Preserve explicit `401`/`403` API behavior when changing authentication or authorization code.
- Preserve the shared contract layer in `shared/contracts/` when changing API request/response shapes.
- Preserve `docs/API.md` as the human-readable API contract. If API behavior changes, update it in the same change.
- Treat `/api/v1` as the canonical API prefix. Keep the unversioned `/api` alias working unless the change intentionally removes that compatibility layer.
- Preserve the admin Access Management UI when changing user context, groups, or location assignment flows.
- Keep the React SPA buildable through Vite and compatible with Express serving the built assets from `frontend-dist/`.

## Frontend conventions

- Prefer existing CSS custom properties for theme-aware UI surfaces.
- When chart UI colors should react to theme changes, read them from CSS variables via `cssVar()`.
- Keep the dashboard usable on small screens; preserve responsive behavior when changing layouts, cards, tables, or charts.
- Preserve the login/logout flow and authenticated user context controls when changing the header or location management UI.

## Verification

- After changing code, run a relevant verification step before handoff. Treat this as required, not optional.
- Run the narrowest useful check that gives confidence in the changed area.
- When code edits change API routes, contracts, auth rules, or error behavior, also check whether [docs/API.md](docs/API.md) needs an update and make that update before handoff. Treat this as mandatory, not optional.
- For server changes, at minimum verify the app still starts with `npm start` or `npm run dev`.
- For UI changes, prefer `npm test` so unit and Playwright coverage stay aligned. If Playwright does not cover the affected behavior, also verify the affected screen in both desktop and mobile-sized layouts when possible.
- If a meaningful verification step could not be run, say so clearly in the handoff and explain why.

## Commit guidance

- Use a concise subject line.
- In the body, explain why the change was made and any important tradeoffs.
- Add any co-author trailer only if the current tool or workflow expects it.
