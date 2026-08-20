# Ember web experiment

- Status: superseded as primary path; preserved experimental fallback
- Date: 2026-08-20
- Superseded by: deployed stock-Web runtime direction, 2026-08-20

## Decision

Do not continue building this clean Ember application as the primary budgeting
Web client. Preserve the existing scaffold and tests as an experimental,
framework-independent fallback only. The primary path is now the preserved
deployed stock YNAB Web client running through a schema-44 compatibility
gateway.

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

## Frozen state

The scaffold contains a retained-Actual login adapter, catalog parser, guarded
plan routes, and tests. No additional register, transaction, budget, target,
schedule, or account UI work is authorized while the stock-Web runtime path is
viable.

## Verification

Any future fallback slice requires:

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
