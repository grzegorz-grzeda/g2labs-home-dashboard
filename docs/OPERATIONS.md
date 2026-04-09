# Operations

This document covers how to run, bootstrap, and maintain the dashboard outside the narrow developer happy path.

## Runtime modes

### Production-style mode

Use real MongoDB and MQTT:

```bash
npm start
```

This builds the React client into `frontend-dist/` and then starts the Node server.

### Backend development

Use auto-restart while editing backend code:

```bash
npm run dev
```

### Frontend development

Use Vite for interactive client work:

```bash
npm run dev:client
```

### Test/demo mode

Run the whole app without MongoDB or MQTT:

```bash
APP_MODE=test npm start
```

This uses:

- the in-memory mock db adapter
- the generated reading source
- seeded users/groups for auth and access-control testing

## Mongo bootstrap

Mongo-backed installs now have an explicit access bootstrap path:

```bash
npm run bootstrap:mongo
```

Use it when:

- preparing a fresh Mongo database before first start
- moving an older database onto the current user/group/auth model
- you want migration/repair to happen intentionally instead of only during app startup

The bootstrap path:

- creates `Default Home` if no groups exist
- creates `Default Admin` if no users exist
- backfills missing `Location.groupId`
- backfills missing `User.groupIds`
- backfills missing `User.role`
- backfills missing `User.passwordHash`
- promotes the first user to `admin` if no admin exists

## Recommended deployment checklist

Before starting the app on a new machine or environment:

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Set at least:
   - `MONGODB_URI`
   - `MQTT_BROKER`
   - `SESSION_SECRET`
   - `DEFAULT_ADMIN_PASSWORD`
4. Run `npm run bootstrap:mongo` if using a real Mongo database
5. Run `npm test`
6. Start with `npm start`

## Authentication operations

- Default Mongo bootstrap admin:
  - username: `admin`
  - password: `DEFAULT_ADMIN_PASSWORD`
- Legacy Mongo users missing a password hash are backfilled with `DEFAULT_USER_PASSWORD`
- Session auth uses a signed HTTP-only cookie

If login behaves unexpectedly after a migration:

1. Run `npm run bootstrap:mongo`
2. Verify the user has the expected `role`
3. Verify the user has the expected `groupIds`
4. Verify visible locations have matching `groupId`

## Troubleshooting

### UI is empty but not crashing

Likely causes:

- the user is authenticated as a `member` without access to the relevant location groups
- locations are assigned to a different group than expected
- legacy Mongo data has not been bootstrapped yet

Check:

- user `role`
- user `groupIds`
- location `groupId`

### UI stays disconnected

Check:

- the browser has a valid session cookie
- the current user exists
- the socket handshake can resolve the same user context as the API
- `SESSION_SECRET` is stable for the running process

### New MQTT readings do not appear

Check:

- the location exists for that sensor MAC
- the location has a valid `groupId`
- the current user can access that group
- the MQTT topic and broker match the blester publisher

### Historical charts look empty

Check:

- the current user can access that location
- the selected range is wide enough
- the location still exists and the readings were not deleted with it

## Safe maintenance habits

- Prefer `npm test` before and after meaningful backend or frontend changes
- Update `docs/API.md` when API routes, payloads, error codes, or auth behavior change
- Update `docs/MIGRATIONS.md` when models or bootstrap/backfill behavior change
- Keep `docs/TESTING.md` aligned with how tests are actually run
