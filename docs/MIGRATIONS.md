# Migrations

This document tracks the important data-model and bootstrap transitions in the project.

It is intentionally practical: use it to understand what changed in stored data expectations and what operational step may be required.

## Current migration path

The project currently relies on the shared Mongo access bootstrap path in:

- `src/bootstrap/access-bootstrap.js`
- `npm run bootstrap:mongo`

The server also runs that bootstrap path at startup for Mongo-backed environments.

## Recorded changes

### Access control introduced

Changes:

- `Location.groupId` introduced
- `User.groupIds` introduced
- `User.role` introduced
- `Group` model introduced

Operational impact:

- existing locations need a valid `groupId`
- existing users need `groupIds`
- member visibility depends on matching location/user groups

Bootstrap behavior:

- missing `Location.groupId` is backfilled to `Default Home`
- missing `User.groupIds` is backfilled to `Default Home`

### Local authentication introduced

Changes:

- `User.passwordHash` introduced
- signed session-cookie auth added

Operational impact:

- legacy users need a password hash
- auth is now required for `/api/*` except login/logout

Bootstrap behavior:

- missing `User.passwordHash` is backfilled using `DEFAULT_USER_PASSWORD`

### Admin role and default admin bootstrap

Changes:

- admin role semantics established
- default bootstrap user created for fresh installs

Operational impact:

- at least one admin should exist in each real deployment

Bootstrap behavior:

- if no users exist, create `Default Admin`
- if users exist but no admin exists, promote the first user

## When to run `npm run bootstrap:mongo`

Run it when:

- upgrading an older Mongo database into the current access/auth model
- moving the app to a new machine with an existing database
- troubleshooting missing roles/groups/password hashes
- preparing a fresh production database before first start

## When to update this file

Update `docs/MIGRATIONS.md` whenever you change:

- stored model fields
- bootstrap/backfill behavior
- migration commands
- auth or access assumptions that affect persisted documents
