# Ember web migration

- Status: accepted
- Date: 2026-08-20
- Replaces: React-as-final-UI portion of `selective-fork-decision.md`

## Decision

Build the final budgeting Web client as a clean Ember application. Keep
Actual's React client operational only during migration, then retire its
budgeting routes after equivalent Ember vertical slices pass conformance.

The decision follows the recovered current YNAB Web structure: Ember routes,
controllers, services, components, compiled templates, a transaction-editor
service, entity/change-set synchronization, and a server-calculation boundary.
Captured proprietary bundles are evidence only and are not source material for
the implementation.

## Boundaries

The Ember client may depend on:

- framework-independent semantic types and command contracts;
- an authenticated Web API exposed by the retained Actual server shell;
- presentation-specific adapters owned by the Ember workspace; and
- public design assets or newly created project assets.

It must not depend on:

- React components or hooks;
- Actual CRDT messages;
- PostgreSQL repositories directly;
- stock YNAB minified modules; or
- the iOS compatibility wire format as its application API.

## Migration sequence

1. Keep React as the fallback client while Ember is scaffolded.
2. Share authentication through the retained Actual session service.
3. Deliver plan catalog and plan opening as the first complete Ember slice.
4. Add accounts/registers, transactions, budgeting, schedules, and lifecycle
   features one vertical slice at a time.
5. Route both clients through the same semantic application services.
6. Disable each replaced React route only after semantic, browser, and
   compatibility tests pass.
7. Retire the React budgeting client when no production route depends on it.

## Verification

Each slice requires:

- pure semantic tests;
- PostgreSQL integration and replay tests;
- authenticated API tests;
- Ember route/component workflow tests; and
- compatibility tests proving that the same canonical state projects to iOS.

## Current implementation

`packages/ynab-web` now contains the isolated Ember shell and first guarded
workflow. Its login form delegates password validation and session creation to
Actual's retained `/account/login` boundary, keeps the returned session token
in memory only, and reads the canonical plan catalog from `/semantic/v1`.
React, CRDT, browser storage, PostgreSQL, and iOS-wire dependencies are blocked
by the package boundary test.

## Non-goals

- Reimplementing authentication inside Ember.
- Copying deployed YNAB source code.
- Maintaining separate Web and iOS budgeting engines.
- Removing React before an equivalent tested replacement exists.
