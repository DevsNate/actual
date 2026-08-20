# Selective Actual fork decision

- Status: accepted
- Date: 2026-08-16
- Baseline: Actual v26.8.1, commit `063df03763ca772b51f6264752b88ddec22cfb8a`

## Decision

Reuse Actual's authentication, users, sessions, roles, server operations, and
evidence-verified infrastructure and domain code. Retain the React application
only as a migration surface while a clean Ember budgeting client replaces it.
Replace Actual's CRDT and opaque budget-file relay as the active budgeting
store and synchronization protocol.

The final web product is a literal 1:1 recreation of the stock YNAB web
application at the observable visual and functional level. The recreated web
application is delivered through the clean Ember client described in
[`ember-web-migration.md`](ember-web-migration.md). It and the lightly modified
stock iOS application use one canonical
semantic command layer and one PostgreSQL budgeting authority. The web product
uses a native web API. The iOS app uses a YNAB-shaped compatibility gateway over
the same commands and state. React remains reachable only until equivalent
Ember vertical slices replace it and must not become a second budgeting
authority.

The complete parity objective and acceptance rule are defined in
[`product-objective.md`](product-objective.md).

## Retained foundations

- password, OpenID, and trusted-header authentication;
- users, sessions, roles, expiration, and administration;
- configuration, secrets, migrations, hosting, middleware, HTTPS, and health;
- React application and component library as temporary migration references;
- reusable accessibility, localization, theme, and asset work that can be
  extracted without coupling Ember to React or preventing 1:1 stock YNAB web
  parity;
- import/export and optional bank-provider implementations behind semantic
  adapters; and
- domain algorithms that pass evidence-backed compatibility tests.

Initially, Actual's `account.sqlite` remains authoritative for identity and
server administration. It is not authoritative for plans or budgeting data.

## Replaced foundations

- `@actual-app/crdt` as the cross-client budgeting protocol;
- `/sync/sync`, `sync-simple.js`, Merkle exchange, and `messages_crdt` as the
  live synchronization path;
- encrypted budget blobs as canonical live state;
- per-cell last-write-wins conflict resolution; and
- independent Actual and YNAB budgeting authorities.

CRDT code may remain temporarily for importing an existing Actual file and for
migration tests. It must not receive new product behavior.

## New boundaries

1. Actual authentication adapter
2. Canonical PostgreSQL semantic database
3. Atomic semantic command service
4. Ordered knowledge ledger and idempotency receipts
5. YNAB protocol gateway
6. Framework-independent web query and command API
7. Clean Ember budgeting client delivering the 1:1 YNAB web recreation
8. Evidence-backed compatibility and parity fixture suite

## Non-negotiable rules

- There is exactly one authoritative budgeting database.
- Authentication is reused, not independently reimplemented.
- Web and iOS clients invoke the same domain commands.
- The final web product targets 100% observable stock YNAB parity for the
  defined supported version/capture horizon.
- React and Ember never own or independently calculate canonical budget state.
- No knowledge advances before the complete semantic transaction commits.
- Stock behavior is implemented only from admitted evidence.
- UI/interaction evidence is first-class alongside protocol, entity,
  calculation, and synchronization evidence.
- Unknown protocol fields are preserved when the observed contract requires
  them.
- Every deviation from stock Actual is recorded in the stock change ledger.
