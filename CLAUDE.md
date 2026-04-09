# Claude Code guidance

## Read first

Before making any changes, read:
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target module structure, data flow, and decisions log
- [`server.js`](server.js) — current monolith (target structure not yet implemented)
- [`models/`](models/) — Mongoose schemas for Location and Reading

## Running the project

```bash
npm start        # production
npm run dev      # development, auto-restarts on file change
```

Requires MongoDB and an MQTT broker. Defaults to `localhost` for both — see [`.env.example`](.env.example).

## Architecture

The current code is a monolith. The target is a layered structure:
`mqtt/` → `services/` → `routes/`, communicating via Node.js EventEmitter.
Refactoring is in progress — don't add new logic to `server.js`; put it in the appropriate target layer instead.

## Conventions

- Check `docs/ARCHITECTURE.md` decisions log before proposing alternatives to settled choices (storage strategy, dedup approach, location model, etc.)
- All sensor readings are written raw to MongoDB immediately — no buffering or averaging on write
- Deduplication uses ATC frame counter (byte 12) + 10s time window, not a unique index (uint8 wraps at 255)
- Readings are stamped with `locationId` at ingest time — reassigning a sensor does not move historical data
- Deleting a location cascades to delete its readings
- CSS uses custom properties (`--bg`, `--surface`, `--border`, etc.) for theming — don't hardcode colors
- Chart colors (grid, ticks, tooltip) must be read from CSS variables via `cssVar()` so they respond to theme changes

## Commit style

Concise subject line, body explains the *why* not the *what*. Always add:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
