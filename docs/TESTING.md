# Testing

This document explains what the test suite covers and when to use each layer.

## Main commands

Run everything:

```bash
npm test
```

Run only unit/integration-style tests:

```bash
npm run test:unit
```

Run only browser tests:

```bash
npm run test:ui
```

## Current layers

### Unit and narrow integration tests

Run with Node's built-in test runner:

```bash
npm run test:unit
```

Current coverage includes:

- auth helpers
- API auth and authorization responses
- Mongo adapter access-filter regression coverage
- auth service orchestration
- access service orchestration
- location service orchestration
- readings query service orchestration
- Mongo access bootstrap behavior

These tests are the fastest place to catch backend regressions.

### UI smoke tests

Run with Playwright:

```bash
npm run test:ui
```

The suite starts the real app in test mode:

```bash
APP_MODE=test PORT=4173 MOCK_INTERVAL_MS=250 npm run start:test
```

That means the browser exercises:

- the real Express app
- the real React frontend
- the mock db adapter
- the generated reading source

Current UI coverage includes:

- login flow
- dashboard render and live status
- time-format toggle
- location CRUD
- group-based access filtering
- admin access management
- mobile layout smoke coverage

## Expected skip behavior

One Playwright case is intentionally skipped in desktop Chromium:

- the mobile-only layout assertion runs only in the mobile Chromium project

So a passing suite normally looks like:

- unit tests passing
- UI tests passing
- `1 skipped`

## When to add tests

### Add or update unit tests when:

- changing auth/session logic
- changing group/location access rules
- changing bootstrap/migration behavior
- adding or changing backend services
- changing adapter-side business rules

### Add or update API-level tests when:

- changing route authorization behavior
- changing expected `401`/`403`/`404`/`409` behavior
- changing contract validation or route payload shapes

### Add or update Playwright tests when:

- changing visible UI flows
- changing navigation, forms, or page structure
- changing mobile responsiveness
- adding admin/user-facing product behavior

## Test placement

- `tests/unit/*.test.js`
  Backend helpers, services, adapters, and route-level integration checks
- `tests/e2e/*.spec.js`
  Browser-level smoke and workflow coverage

## Practical verification guidance

- Small backend refactor:
  - run `npm run test:unit`
- API or auth change:
  - run `npm test`
- UI change:
  - run `npm test`
- Docs-only change:
  - no runtime tests required unless the docs describe changed behavior

## Future gaps worth filling

- more direct route/contract success-case tests
- targeted Socket.io auth/update tests
- migration-script tests if more explicit migration commands are added
