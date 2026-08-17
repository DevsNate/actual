# Semantic PostgreSQL storage

This package is the canonical persistence boundary for the selective Actual
fork. It is intentionally independent of Express, React, the YNAB gateway,
Actual's CRDT messages, and budgeting-policy implementations.

## Current scope

- plan and budget-version identities;
- structured date/currency metadata and complete canonical plan-entity
  snapshots;
- principal memberships and catalog knowledge;
- principal/device catalog knowledge plus ordered catalog change and receipt
  schema;
- per-plan and per-device knowledge;
- ordered change sets with schema versions and affected entity identities;
- explicit tombstones;
- durable idempotency receipts containing the exact accepted response; and
- transactional migrations protected by a PostgreSQL advisory lock.

`commitChangeSet` serializes reuse of a device idempotency key, locks plan and
device knowledge, and commits the change set, knowledge advancement, and exact
response receipt in one database transaction. An identical retry replays the
receipt. A different payload using the same key fails closed.

The catalog ledger migration is intentionally schema-only for now. No route
may advance it until the atomic plan lifecycle writer can commit catalog facts
and the complete canonical budget bootstrap together.

Canonical entity snapshots retain a complete JSON payload, entity kind,
identity, schema version, tombstone state, and last server knowledge. This is
the unknown-field-preserving storage boundary; domain services may interpret
only fields supported by admitted evidence.

## Deliberate exclusions

This foundation does not define account, transaction, split, transfer,
schedule, target, credit-card, or account-lifecycle policy. Those tables and
commands are admitted only after their behavior is supported by the stock
evidence knowledge base. It also does not duplicate Actual authentication;
memberships refer to principals produced by the retained Actual session
system.

All changes to this boundary must update
`project-docs/architecture/stock-actual-change-ledger.md` in the same commit.

Set `SEMANTIC_POSTGRES_TEST_URL` when running the package tests to enable the
disposable PostgreSQL integration suite. The suite applies migrations twice to
verify idempotence and exercises catalog persistence, tombstone commit, exact
receipt replay, and conflicting replay.
