# Semantic PostgreSQL storage

This package currently provides the canonical **consistency and replay**
boundary for the selective Actual fork. Its generic budget-entity rows are a
transitional stock-client compatibility projection, not the finished canonical
budgeting database. It is intentionally independent of Express, React, Actual's
CRDT messages, and budgeting-policy implementations; protocol-specific row
construction that still exists here is tracked for removal in the contract
audit.

## Current scope

- distinct budget, budget-version, and membership identities;
- structured date/currency metadata and complete budget compatibility
  projections;
- principal memberships and catalog knowledge;
- principal/device catalog knowledge plus ordered catalog change and receipt
  schema;
- per-budget and per-device knowledge;
- ordered change sets with schema versions and affected entity identities;
- explicit tombstones;
- durable idempotency receipts containing the exact accepted response; and
- typed canonical account, account-bound payee, starting-balance, and manual
  adjustment storage for admitted Checking-account creation and lifecycle;
- transactional migrations protected by a PostgreSQL advisory lock.

`commitChangeSet` serializes reuse of a device idempotency key, locks budget and
device knowledge, and commits the change set, knowledge advancement, and exact
response receipt in one database transaction. An identical retry replays the
receipt. A different payload using the same key fails closed.

The command explicitly declares whether the admitted operation advances one
source revision or also triggers a second server-derivation revision. The
current boundary accepts only `1` or `2`; callers cannot infer arbitrary
knowledge jumps. A derivation pass may advance knowledge even when its terminal
calculation delta is empty, as demonstrated by account reopen. Calculated rows
remain a separate projection module.

`createBudget` commits the budget, owner membership, catalog change, complete
evidence-backed budget bootstrap, both knowledge ledgers, materialized entity
snapshots, and exact receipts in one PostgreSQL transaction. The authenticated
native semantic API is the first caller; compatibility projections remain
separate adapters over the same command.

Budget projection snapshots retain a complete JSON payload, entity kind,
identity, schema version, tombstone state, and last server knowledge. This is
the unknown-field-preserving YNAB compatibility boundary; its generic JSON
rows are not automatically canonical domain records. Domain services may
interpret only fields supported by admitted evidence.

Migration 0005 corrects the early internal plan vocabulary (`plan_id`) to
`budget_id` and
`semantic_budget_*` without collapsing `budget_version_id` or membership ID.
Migration 0006 is the first typed domain cutover. It stores the admitted
account aggregate independently from `be_*` compatibility projections, while
`commitUnlinkedAccountCreation` commits both representations, knowledge, and
the exact replay receipt atomically.
Migration 0007 admits typed account rename, pristine deletion, close, and
reopen. These lifecycle writers update canonical rows in the same PostgreSQL
transaction as compatibility projections, ordered knowledge, and replay
receipts.
The full field-by-field audit is recorded in
`project-docs/architecture/semantic-postgres-contract-audit.md`.

## Deliberate exclusions

Typed account storage owns only the evidence-admitted unlinked Checking-account
creation, rename, pristine deletion, close, and reopen shapes. Other account
types, linked accounts, general transactions, splits, transfers, schedules,
targets, and credit-card semantics remain gated on their canonical domain
cutovers. Existing narrow compatibility implementations do not broaden that
authority. The package also does not duplicate Actual authentication;
memberships refer to principals produced by the retained Actual session system.

All changes to this boundary must update
`project-docs/architecture/stock-actual-change-ledger.md` in the same commit.

Set `SEMANTIC_POSTGRES_TEST_URL` when running the package tests to enable the
disposable PostgreSQL integration suite. The suite applies migrations twice to
verify idempotence and exercises catalog persistence, tombstone commit, exact
receipt replay, and conflicting replay.
