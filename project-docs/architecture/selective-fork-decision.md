# Selective Actual fork decision

- Status: accepted
- Date: 2026-08-16
- Baseline: Actual v26.8.1, commit `063df03763ca772b51f6264752b88ddec22cfb8a`

## Decision

Reuse Actual's authentication, users, sessions, roles, server operations, and
evidence-verified infrastructure and domain code. Preserve the deployed stock
YNAB Web client as the primary Web client and the stock YNAB iOS application as
the Mobile client, adapting only their infrastructure boundaries. Replace
Actual's CRDT and opaque budget-file relay as the active budgeting store and
synchronization protocol.

The final Web product targets literal 1:1 stock YNAB behavior at the observable
visual and functional level. It is delivered by relocating the preserved
deployed client behind a schema-44 Web compatibility gateway. It and the
minimally modified stock iOS application use one canonical semantic command
layer and one PostgreSQL budgeting authority. iOS uses a separate schema-42
compatibility gateway over the same commands and state. The clean Ember
scaffold described in
[`ember-web-migration.md`](ember-web-migration.md) is frozen as experimental
fallback only.

The complete parity objective and acceptance rule are defined in
[`product-objective.md`](product-objective.md).

## Retained foundations

- password, OpenID, and trusted-header authentication;
- users, sessions, roles, expiration, and administration;
- configuration, secrets, migrations, hosting, middleware, HTTPS, and health;
- React application and component library as optional Actual administration,
  provider, migration, and fallback surfaces;
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
6. Web schema-44 compatibility gateway
7. iOS schema-42 compatibility gateway
8. Relocatable deployed stock Web runtime and minimum client patch boundary
9. Evidence-backed compatibility and parity fixture suite

## Non-negotiable rules

- There is exactly one authoritative budgeting database.
- Authentication is reused, not independently reimplemented.
- Web and iOS gateways normalize into the same domain commands.
- The final web product targets 100% observable stock YNAB parity for the
  defined supported version/capture horizon.
- Client-specific compatibility code never owns canonical budget state.
- Stock client internals are patched only when a concrete relocation
  incompatibility cannot be handled at configuration or transport boundaries.
- No knowledge advances before the complete semantic transaction commits.
- Stock behavior is implemented only from admitted evidence.
- UI/interaction evidence is first-class alongside protocol, entity,
  calculation, and synchronization evidence.
- Unknown protocol fields are preserved when the observed contract requires
  them.
- Every deviation from stock Actual is recorded in the stock change ledger.
