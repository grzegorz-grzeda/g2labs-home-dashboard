# Project guidance

## Start here

Read only the files relevant to the area you are changing:

- Always read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing data flow, ingestion, persistence, or charting behavior.
- Read [src/app.js](src/app.js) and [src/server.js](src/server.js) when changing app wiring, middleware, HTTP setup, Socket.io, MongoDB startup, or MQTT startup.
- Read [src/models/](src/models/) when changing stored fields, validation, or delete behavior.
- Read [src/mqtt/](src/mqtt/) when changing ATC parsing or MQTT topic handling.
- Read [src/services/](src/services/) when changing deduplication, DB writes, or socket emission.
- Read [src/routes/](src/routes/) when changing HTTP endpoints.
- Read [public/](public/) when changing dashboard UI behavior, theming, or responsive layout.

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
- Location and reading visibility must always be filtered through the current user's accessible groups for both HTTP responses and live Socket.io updates.

## Frontend conventions

- Prefer existing CSS custom properties for theme-aware UI surfaces.
- When chart UI colors should react to theme changes, read them from CSS variables via `cssVar()`.
- Keep the dashboard usable on small screens; preserve responsive behavior when changing layouts, cards, tables, or charts.
- Preserve the user context controls when changing the header or location management UI.

## Verification

- After changing code, run a relevant verification step before handoff. Treat this as required, not optional.
- Run the narrowest useful check that gives confidence in the changed area.
- For server changes, at minimum verify the app still starts with `npm start` or `npm run dev`.
- For UI changes, run `npm run test:ui` when the affected behavior is covered by Playwright. If not, verify the affected screen in both desktop and mobile-sized layouts when possible.
- If a meaningful verification step could not be run, say so clearly in the handoff and explain why.

## Commit guidance

- Use a concise subject line.
- In the body, explain why the change was made and any important tradeoffs.
- Add any co-author trailer only if the current tool or workflow expects it.
