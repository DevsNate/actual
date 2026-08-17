# Stock Actual change ledger

This is the authoritative inventory of how this fork differs from stock Actual
v26.8.1. The baseline commit is
`063df03763ca772b51f6264752b88ddec22cfb8a`.

## Status vocabulary

- **admitted**: supported by accepted evidence or a non-behavioral engineering
  requirement.
- **proposed**: direction chosen, but implementation has not started.
- **implemented**: source exists and focused tests pass.
- **migrating**: replacement exists while the stock path is still reachable.
- **retired**: stock path is no longer reachable in production.
- **deferred**: intentionally outside the current delivery slice.

## Summary

| ID         | Stock area                               | Disposition        | Current status | Replacement or retained boundary                     |
| ---------- | ---------------------------------------- | ------------------ | -------------- | ---------------------------------------------------- |
| ACTUAL-001 | Authentication and sessions              | Keep               | implemented    | Actual account DB plus semantic principal adapter    |
| ACTUAL-002 | Express server shell                     | Keep and extend    | admitted       | Existing host mounts semantic web and stock gateways |
| ACTUAL-003 | File and user-access catalog             | Modify             | proposed       | Canonical plans and memberships in PostgreSQL        |
| ACTUAL-004 | CRDT sync endpoint and relay             | Replace            | proposed       | Semantic commands and ordered knowledge ledger       |
| ACTUAL-005 | Encrypted budget file as live authority  | Replace            | proposed       | Canonical PostgreSQL budget store                    |
| ACTUAL-006 | `loot-core` domain handlers              | Extract and modify | proposed       | Evidence-verified semantic services                  |
| ACTUAL-007 | React application shell                  | Keep and reshape   | admitted       | YNAB-compatible UI over semantic web API             |
| ACTUAL-008 | Import, export, and backups              | Modify             | deferred       | Canonical-store adapters                             |
| ACTUAL-009 | Bank-provider ingestion                  | Modify             | deferred       | Provider facts enter through semantic commands       |
| ACTUAL-010 | Compatibility-server login               | Remove             | proposed       | Actual authentication adapter                        |
| ADD-001    | Canonical semantic database              | Add                | proposed       | PostgreSQL budgeting authority                       |
| ADD-002    | Knowledge and receipt ledger             | Add                | proposed       | Ordered per-plan/device synchronization state        |
| ADD-003    | YNAB protocol gateway                    | Add                | proposed       | Evidence-derived stock projections                   |
| ADD-004    | Web semantic API                         | Add                | proposed       | React query/command boundary                         |
| ADD-005    | Compatibility fixture suite              | Add                | migrating      | Stock captures plus semantic and black-box tests     |
| ADD-006    | Framework-independent semantic contracts | Add                | implemented    | `@actual-app/semantic-core` workspace                |

## Detailed entries

### ACTUAL-001 — Authentication and sessions

- **Disposition:** Keep.
- **Stock locations:** `packages/sync-server/src/app-account.js`,
  `account-db.js`, `accounts/`, and `util/validate-user.ts`.
- **Reason:** Actual already provides password, OpenID, trusted-header login,
  sessions, expiry, roles, rate limiting, and administration.
- **Fork boundary:** Expose a stable internal authenticated principal to both
  the semantic web API and the YNAB gateway. Do not duplicate passwords or
  sessions in PostgreSQL.
- **Evidence:** Source audit; authentication behavior is not a recovered YNAB
  budgeting rule.
- **Verification required:** Existing authentication tests plus adapter tests
  for valid, expired, disabled, and unauthorized principals.
- **Implementation:**
  `packages/sync-server/src/semantic/session-principal-adapter.ts`
  projects a validated Actual session into the shared semantic principal type.
- **Verification:** Focused tests cover valid, non-expiring, missing, expired,
  and identity-mismatch cases. The existing sync-server authentication suite is
  retained.
- **Status:** implemented; gateway middleware integration remains pending.

### ACTUAL-002 — Express server shell

- **Disposition:** Keep and extend.
- **Stock location:** `packages/sync-server/src/app.ts`.
- **Reason:** Hosting, middleware, configuration, HTTPS, limits, health, and
  static React serving are reusable infrastructure.
- **Fork boundary:** Mount semantic routes and the stock compatibility gateway
  without weakening existing middleware.
- **Verification required:** Stock sync-server tests and route-isolation tests.
- **Status:** admitted.

### ACTUAL-003 — File and user-access catalog

- **Disposition:** Modify, then remove authority.
- **Stock location:**
  `packages/sync-server/src/app-sync/services/files-service.ts`.
- **Reason:** Ownership concepts are reusable, but file/group/encryption state
  cannot coexist as a second authoritative plan catalog.
- **Replacement:** PostgreSQL `plans` and `plan_memberships`, keyed to Actual
  user IDs, with explicit YNAB budget and budget-version identities.
- **Migration:** A compatibility view or importer may expose legacy files
  during transition.
- **Evidence:** `STARTUP-001` and `PLAN-001`.
- **Status:** proposed.

### ACTUAL-004 — CRDT synchronization

- **Disposition:** Replace and retire from the live path.
- **Stock locations:** `packages/crdt`,
  `packages/sync-server/src/app-sync.ts`, `sync-simple.js`, and
  `packages/loot-core/src/server/sync`.
- **Reason:** Opaque per-cell messages cannot centrally enforce atomic split,
  transfer, schedule, target, or account-lifecycle invariants.
- **Replacement:** Semantic commands, one database transaction, ordered
  knowledge, retained tombstones, and idempotency receipts.
- **Migration:** CRDT is permitted only for imports and explicit migration
  tests until retired.
- **Evidence:** Stock protocol analysis and admitted entity fixtures.
- **Status:** proposed.

### ACTUAL-005 — Budget-file authority

- **Disposition:** Replace.
- **Reason:** The server must validate and project semantic entities; it cannot
  treat an encrypted client database as unknowable canonical state.
- **Replacement:** PostgreSQL canonical budget schema.
- **Migration:** Existing Actual files become import/export artifacts.
- **Status:** proposed.

### ACTUAL-006 — `loot-core` domain behavior

- **Disposition:** Extract and modify feature by feature.
- **Stock locations:** account, transaction, payee, category, budget, target,
  rule, and schedule handlers under `packages/loot-core/src/server`.
- **Reason:** Much domain logic is valuable, but persistence currently ends in
  CRDT batches and some policies differ from observed stock behavior.
- **Replacement boundary:** Pure validation/calculation plus repositories and
  atomic semantic commands. No direct CRDT emission.
- **Evidence gate:** Each stock-specific rule requires an admitted fixture.
- **Status:** proposed.

### ACTUAL-007 — React application

- **Disposition:** Keep and reshape.
- **Stock locations:** `packages/desktop-client` and
  `packages/component-library`.
- **Reason:** The open-source React foundation avoids recreating routing,
  accessibility, localization, responsive behavior, and basic components.
- **Replacement boundary:** The data layer calls the semantic web API. UI
  workflows and appearance are recreated from captured stock behavior.
- **Status:** admitted.

### ACTUAL-008 — Import, export, and backups

- **Disposition:** Modify.
- **Reason:** Existing parsers and formats are useful, but must not bypass
  semantic validation or create another authority.
- **Replacement boundary:** Import emits semantic commands; export reads a
  canonical snapshot.
- **Status:** deferred.

### ACTUAL-009 — Bank-provider ingestion

- **Disposition:** Keep provider integrations; modify ingestion.
- **Reason:** OAuth/provider work is reusable. Imported facts must enter the
  same transaction and deduplication commands as every other client.
- **Status:** deferred.

### ACTUAL-010 — Standalone compatibility login

- **Disposition:** Remove when the auth adapter lands.
- **Current location:** external `compatibility-server` prototype.
- **Reason:** A second login authority would duplicate identities and sessions.
- **Replacement:** ACTUAL-001 authentication adapter.
- **Status:** proposed.

### ADD-001 — Canonical semantic database

- **Disposition:** Add.
- **Initial scope:** plans, memberships, devices, knowledge ranges, change
  sets, idempotency receipts, and tombstones.
- **Later scope:** accounts, payees, categories, transactions, splits,
  schedules, targets, and mappings.
- **Status:** proposed.

### ADD-002 — Knowledge and receipt ledger

- **Disposition:** Add.
- **Requirements:** Ordered per-plan knowledge, originating device knowledge,
  schema version, affected identities, tombstones, idempotency key, and
  acknowledgment state committed with the semantic operation.
- **Evidence:** `STARTUP-001`, `PLAN-001`, and stock protocol analysis.
- **Status:** proposed.

### ADD-003 — YNAB protocol gateway

- **Disposition:** Add.
- **Initial scope:** authenticated signed-in bootstrap and catalog/plan
  projection.
- **Rule:** Implement only admitted endpoint and entity contracts. Explicitly
  reject unsupported operations.
- **Evidence:** `STARTUP-001` and `PLAN-001`.
- **Status:** proposed.

### ADD-004 — Web semantic API

- **Disposition:** Add.
- **Initial scope:** plan picker queries and plan lifecycle commands over the
  same semantic service used by ADD-003.
- **Status:** proposed.

### ADD-005 — Compatibility fixture suite

- **Disposition:** Add and expand continuously.
- **Contents:** Redacted stock request/response fixtures, invariant tests,
  replay/idempotency tests, and black-box web/iOS acceptance.
- **Status:** migrating; existing external evidence packages will be imported
  deliberately rather than copied wholesale.

### ADD-006 — Framework-independent semantic contracts

- **Disposition:** Add.
- **Location:** `packages/semantic-core`.
- **Initial scope:** authenticated principal and catalog/plan membership
  contracts with no dependency on Express, SQLite, PostgreSQL, React, or CRDT.
- **Reason:** Both the stock gateway and React API need one stable domain
  vocabulary without depending on one another's transports.
- **Verification:** Strict TypeScript build and package tests.
- **Status:** implemented.

## Ledger update template

Copy this block for a new architectural delta:

```markdown
### ID — Title

- **Disposition:** Keep | Modify | Replace | Remove | Add.
- **Stock locations:**
- **Observed stock behavior:**
- **Fork behavior:**
- **Reason:**
- **Evidence:**
- **Migration/rollback:**
- **Verification:**
- **Status:** proposed | implemented | migrating | retired | deferred.
- **Commit/PR:**
```
