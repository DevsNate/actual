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

| ID         | Stock area                                 | Disposition        | Current status | Replacement or retained boundary                  |
| ---------- | ------------------------------------------ | ------------------ | -------------- | ------------------------------------------------- |
| ACTUAL-001 | Authentication and sessions                | Keep               | implemented    | Actual account DB plus semantic principal adapter |
| ACTUAL-002 | Express server shell                       | Keep and extend    | implemented    | Feature-gated semantic catalog route mounted      |
| ACTUAL-003 | File and user-access catalog               | Modify             | migrating      | Canonical plans and memberships in PostgreSQL     |
| ACTUAL-004 | CRDT sync endpoint and relay               | Replace            | proposed       | Semantic commands and ordered knowledge ledger    |
| ACTUAL-005 | Encrypted budget file as live authority    | Replace            | proposed       | Canonical PostgreSQL budget store                 |
| ACTUAL-006 | `loot-core` domain handlers                | Extract and modify | proposed       | Evidence-verified semantic services               |
| ACTUAL-007 | React application shell                    | Retain selectively | deferred       | Actual admin/provider/fallback surfaces           |
| ACTUAL-008 | Import, export, and backups                | Modify             | deferred       | Canonical-store adapters                          |
| ACTUAL-009 | Bank-provider ingestion                    | Modify             | deferred       | Provider facts enter through semantic commands    |
| ACTUAL-010 | Compatibility-server login                 | Remove             | proposed       | Actual authentication adapter                     |
| ADD-001    | Canonical semantic database                | Add                | implemented    | PostgreSQL foundation; entity authority follows   |
| ADD-002    | Knowledge and receipt ledger               | Add                | implemented    | Ordered per-plan/device synchronization state     |
| ADD-003    | YNAB protocol gateway                      | Add                | migrating      | Evidence-derived stock projections                |
| ADD-004    | Web semantic API                           | Add                | implemented    | Read-only authenticated catalog slice             |
| ADD-005    | Compatibility fixture suite                | Add                | migrating      | Stock captures plus semantic and black-box tests  |
| ADD-006    | Framework-independent semantic contracts   | Add                | implemented    | `@actual-app/semantic-core` workspace             |
| ADD-007    | Local semantic development stack           | Add                | implemented    | Fork server plus PostgreSQL Compose environment   |
| ADD-008    | Semantic budget client bridge              | Add                | implemented    | Typed worker boundary; no token access from React |
| ADD-009    | Shared budget command application services | Add                | implemented    | One orchestration path for React and stock routes |
| ADD-013    | Deployed stock Web runtime                 | Add                | investigating  | Schema-44 gateway over canonical semantics        |
| ADD-014    | Typed canonical account aggregate          | Add                | implemented    | Captured Checking creation/lifecycle authority    |

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
- **Correction:** The adapter converts Actual's Unix-seconds `expires_at`
  before comparing it with `Date.now()` milliseconds. The route-level
  integration test uses an epoch-shaped expiring session to prevent recurrence.
- **Commit/PR:** `7c60694` introduced the adapter; `[AI] Mount semantic catalog
API` contains the expiry correction and first route integration.
- **Status:** implemented; gateway middleware integration remains pending.

### ACTUAL-002 — Express server shell

- **Disposition:** Keep and extend.
- **Stock location:** `packages/sync-server/src/app.ts`.
- **Reason:** Hosting, middleware, configuration, HTTPS, limits, health, and
  static React serving are reusable infrastructure.
- **Fork boundary:** Mount semantic routes and the stock compatibility gateway
  without weakening existing middleware.
- **Verification required:** Stock sync-server tests and route-isolation tests.
- **Implementation:** When explicitly enabled, the retained server mounts
  `GET /semantic/v1/catalog` before the React catch-all. PostgreSQL migration
  failure or missing database configuration prevents startup. The default
  remains disabled, leaving all stock routes unchanged.
- **Verification:** Production Vite build, focused route/auth tests, and a
  disposable PostgreSQL end-to-end test through an Actual session.
- **Commit/PR:** `[AI] Mount semantic catalog API`.
- **Status:** implemented for the catalog slice; gateway and command routes
  remain pending.

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
- **Implementation:** `@actual-app/semantic-postgres` now owns the canonical
  plan, membership, and catalog-knowledge schema and provides a principal-
  scoped catalog reader. The stock file catalog remains reachable until the
  semantic route adapters and migration path are complete.
- **Verification:** Strict package typecheck, catalog-isolation test, and
  repository-wide lint.
- **Commit/PR:** `6e50cfc`.
- **Status:** migrating.

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

- **Disposition:** Retain selectively; do not use as the primary parity UI.
- **Stock locations:** `packages/desktop-client` and
  `packages/component-library`.
- **Reason:** React remains useful for Actual administration, providers,
  migration, and bounded fallback surfaces. Literal client parity is better
  served by preserving the deployed stock YNAB Web runtime.
- **Replacement boundary:** The deployed client uses the Web schema-44 gateway.
  Neither React nor the frozen Ember experiment owns canonical budget state.
- **Portability correction:** The component-library theme documentation now
  shares the lowercase `src/themes` directory used by its CSS package exports.
  Stock tracked the documentation under `src/Themes`, which succeeds on a
  case-insensitive macOS checkout but breaks the Linux production build.
- **Evidence:** Deep client inspection dated 2026-08-19 and
  `project-docs/architecture/ember-web-migration.md`.
- **Implementation:** `packages/ynab-web` provides an isolated Ember 7
  workspace, strict semantic catalog and login parsers, an in-memory adapter to
  Actual's existing login/session authority, guarded login and plan routes, a
  semantic API service, and a forbidden-import/storage boundary test. The
  development server proxies only `/account` and `/semantic` to the retained
  Actual server.
- **Verification:** Package formatting/template lint, strict Ember typecheck,
  browser unit and login-to-catalog acceptance tests, production build, and
  repository typecheck pass.
- **Direction correction:** The Ember work is preserved under
  `packages/ynab-web` but is frozen as experimental fallback. Its two commits
  remain valid provenance and are not reverted.
- **Status:** deferred for budgeting UI; retained surfaces remain available.

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
- **Initial scope:** budgets, memberships, devices, knowledge ranges, change
  sets, idempotency receipts, and tombstones.
- **Later scope:** accounts, payees, categories, transactions, splits,
  schedules, targets, and mappings.
- **Implementation:** `packages/semantic-postgres` migration
  `0001_semantic_foundation.sql` historically defined plan-named budget rows,
  memberships, catalog knowledge, devices, change sets, entity changes, and
  durable receipts. Text
  identifiers deliberately preserve opaque stock identities rather than
  assuming every admitted identifier is a UUID.
- **Catalog extension:** `0002_catalog_command_ledger.sql` separates catalog
  device knowledge, ordered catalog change sets, complete entity changes, and
  exact command receipts from the per-plan budget ledger.
- **Catalog command extension:**
  `0004_catalog_command_schema_version.sql` versions catalog command envelopes
  without rewriting the already-applied catalog migration.
- **Identity-vocabulary migration:** `0005_budget_identity_schema.sql` renames
  every budget-scoped table, column, constraint, and index from the early
  internal plan vocabulary to `budget_id` while preserving distinct
  `budget_version_id` and membership identities, ledger rows, cursors,
  tombstones, and receipts.
- **Entity extension:** `0003_canonical_plan_entities.sql` adds structured
  date/currency metadata and a schema-versioned, tombstone-capable canonical
  entity snapshot table. Complete JSON payloads preserve unknown fields; no
  entity-specific behavior is inferred.
- **PLAN-001 bootstrap extension:** `buildStockBudgetBootstrap` materializes the
  58 authoritative source entities demonstrated by the sealed PLAN-001 stock
  capture: budget, six master categories, fifteen categories, three system
  payees, one onboarding setting, two onboarding events, two monthly budgets,
  and twenty-eight monthly-category rows. Calculation rows remain projections,
  while `budget_views`, the prior-month row, and `opened_budget` remain later
  client-authored events rather than server bootstrap data. The captured
  subscription deadline rule is creation date plus thirteen months and three
  days.
- **Boundary:** This is the canonical storage foundation, not yet the live
  authority for budgeting entities. No inferred account, transfer, schedule,
  or target policy is encoded in this migration.
- **Verification:** Migration contract test, strict TypeScript build, focused
  repository tests, root lint/typecheck, and a disposable PostgreSQL 17
  integration run that applies the migration twice and exercises plan/catalog
  persistence, tombstone commit, exact replay, and conflicting replay.
- **Commit/PR:** `6e50cfc`; bundled migration support is included in `[AI]
Mount semantic catalog API`; PLAN-001 bootstrap is included in `[AI] Add
evidence-backed plan creation`.
- **Status:** implemented; live routing and budgeting tables remain pending.

### ADD-014 — Typed canonical account aggregate

- **Disposition:** Add.
- **Scope:** Evidence-admitted unlinked Checking-account creation, rename,
  pristine deletion, close, and reopen only.
- **Implementation:** Migration 0006 adds typed `semantic_accounts`,
  `semantic_payees`, and `semantic_transactions`. The account application
  service builds one canonical account aggregate and a separate stock delivery
  projection. `PostgresSemanticStore.commitUnlinkedAccountCreation` commits the
  canonical rows, compatibility projections, knowledge advancement, and exact
  replay receipt in one transaction. Migration 0007 adds typed transaction
  kind/memo and lifecycle writers for rename, pristine deletion, close, and
  reopen.
- **Boundary:** `be_*` rows remain unknown-field-preserving compatibility
  projections. They are not account authority. Other account types, linked
  accounts, and general transaction semantics remain outside this admitted
  slice. Close amount validation temporarily reads the compatibility snapshot
  at the stock adapter boundary until ordinary transactions are cut over.
- **Verification:** Contract tests cover the typed schema and adapter boundary.
  Disposable PostgreSQL integration verifies atomic persistence and exact
  replay with one account, one account-bound payee, one starting-balance
  transaction, rename/delete lifecycle, one manual adjustment, close/reopen,
  and no duplicate rows under replay.
- **Status:** implemented for captured unlinked Checking-account lifecycle.

### ADD-002 — Knowledge and receipt ledger

- **Disposition:** Add.
- **Requirements:** Ordered per-plan knowledge, originating device knowledge,
  schema version, affected identities, tombstones, idempotency key, and
  acknowledgment state committed with the semantic operation.
- **Evidence:** `STARTUP-001`, `PLAN-001`, and stock protocol analysis.
- **Implementation:** `PostgresSemanticStore.commitChangeSet` uses one
  PostgreSQL transaction with an idempotency advisory lock and plan/device row
  locks to append an ordered change set and tombstone-capable entity changes,
  advance knowledge, and persist the exact response receipt. Identical
  requests replay the stored response; reuse of an idempotency key with another
  digest fails closed.
- **Catalog implementation:** `commitCatalogCommand` independently locks the
  principal/device/idempotency tuple, checks both knowledge counters, appends
  the versioned catalog change set and complete entity changes, advances
  catalog knowledge, and stores the exact response receipt in one transaction.
- **Plan creation implementation:** `PostgresSemanticStore.createPlan` commits
  the plan, owner membership, catalog change, PLAN-001 bootstrap change set,
  canonical entity snapshots, both knowledge ledgers, and both exact replay
  receipts in one PostgreSQL transaction. A reused key with the same digest
  returns the original identities; a different digest fails closed.
- **Verification:** Focused tests cover first commit, exact replay, conflicting
  replay rollback, validation before database access, and the schema's
  knowledge/receipt foreign-key constraints. The same lifecycle passes against
  disposable PostgreSQL 17, with exactly one change set and receipt after
  replay.
- **Commit/PR:** `6e50cfc`; plan creation is included in `[AI] Add
evidence-backed plan creation`.
- **Status:** implemented for budget/catalog command storage and atomic plan
  creation; acknowledgment delivery beyond the HTTP response, remaining
  product commands, and pruning policy remain pending.

### ADD-003 — YNAB protocol gateway

- **Disposition:** Add.
- **Initial scope:** authenticated signed-in bootstrap and catalog/plan
  projection.
- **Rule:** Implement only admitted endpoint and entity contracts. Explicitly
  reject unsupported operations.
- **Evidence:** `STARTUP-001` and `PLAN-001`.
- **Implementation:** A sanitized 2026-08-17 stock-web capture confirms the
  catalog form envelope and non-secret request-context header names. The first
  adapter authenticates `x-session-token` through retained Actual sessions and
  projects canonical memberships, including tombstones, as complete
  `ce_user_budgets` records. See `stock-catalog-gateway.md`.
- **Plan-create gateway:** The admitted `POST /api/budgets` adapter now accepts
  the stock Token-authenticated envelope, JSON-encoded currency/date fields,
  device identity, and client request identity. It delegates to the existing
  atomic `PlanCreationService`, uses the client request ID for exact replay,
  and returns the stock online API acknowledgement `{ id: budgetVersionId }`.
  The unmodified stock dialog creates and opens the plan, then completes
  catalog and budget bootstrap against the canonical PostgreSQL state.
- **Budget-read foundation:** The principal-scoped PostgreSQL reader can now
  resolve a canonical plan by its opaque budget-version identity, and the pure
  stock budget projector converts the 58 admitted PLAN-001 source entities to
  their complete `be_*` wire tables without losing unknown fields. Projection
  rejects malformed entity kinds and identity/key collisions. Calculated rows
  are produced by a separate BUDGET-001 projector only for pristine plans: it
  emits the exact captured zero/null bootstrap defaults and deterministic
  `mbc/` and `mcbc/` identities. Any state requiring nonzero formulas fails
  closed. The shared compatibility dispatcher now routes admitted bootstrap
  and backfill requests without duplicating authentication.
- **First write extension:** BUDGET-001 also admits the exact first
  client-authored delta: one prior-month monthly-budget row and one
  `opened_budget` onboarding event. The compatibility operation validates the
  complete row shapes, commits both canonical entities and both knowledge
  counters atomically through the existing PostgreSQL receipt ledger, returns
  the captured empty acknowledgement surface, and replays the stored response
  without duplicate rows. Internal bootstrap-role metadata keeps month
  boundaries stable and is omitted from the stock projection.
- **Verification:** Source projection fixtures, strict TypeScript checks,
  repository lint, production sync-server build, and disposable PostgreSQL 17
  authorization/readback integration.
- **Status:** migrating; read-only `syncCatalogData` membership projection and
  stock plan creation are implemented. Pristine-plan `syncBudgetData`
  bootstrap/backfill and the exact BUDGET-001 `opened_budget` write are routed.
  Initial user, family, all other budget deltas/writes, nonzero calculations,
  and catalog-write operations remain explicit unsupported boundaries.

### ADD-004 — Web semantic API

- **Disposition:** Add.
- **Initial scope:** plan picker queries and plan lifecycle commands over the
  same semantic service used by ADD-003.
- **Implementation:** Feature-gated `GET /semantic/v1/catalog` authenticates
  with the retained `X-Actual-Token`, derives the principal server-side, and
  returns only that principal's canonical PostgreSQL memberships and catalog
  knowledge. Authenticated `POST /semantic/v1/budgets` accepts only the admitted
  name, currency-format, and date-format inputs and delegates atomic creation
  to the same canonical store. Storage errors expose neither partial data nor
  database details.
- **Configuration:** `ACTUAL_SEMANTIC_ENABLED=true` plus
  `ACTUAL_SEMANTIC_DATABASE_URL`. Disabled is the default.
- **Verification:** Unauthorized/scoped/error route tests, production bundle,
  and disposable PostgreSQL integration through a real Actual account/session
  row. See `semantic-catalog-api.md`.
- **Commit/PR:** `[AI] Mount semantic catalog API`; create is included in `[AI]
Add evidence-backed plan creation`.
- **Lifecycle extension:** `PostgresBudgetLifecycleStore` and the thin lifecycle
  HTTP router implement evidence-backed rename and delete without adding those
  policies to the general command store. Rename advances catalog and budget
  knowledge atomically. Delete advances only catalog knowledge, emits the
  complete `Unknown` membership tombstone, and retains the plan/entity cache.
- **Status:** implemented for catalog reads and plan create/rename/delete;
  activation/materialization UI and stock compatibility projection remain
  pending.

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
- **Commit/PR:** `7c60694`.
- **Status:** implemented.

### ADD-015 — Evidence-backed Checking close and reopen

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/account.ts`, migration 0007,
  `packages/semantic-postgres/src/store.ts`, and
  `packages/sync-server/src/semantic/stock-account-lifecycle.ts`.
- **Observed stock behavior:** ACCOUNT-005 closes an open Checking account with
  one exact Manual Balance Adjustment that negates its working balance, then
  reopens the same account identity without deleting its history or bound
  transfer payee. Both operations advance source plus derivation knowledge;
  reopen's derivation delta is empty.
- **Fork behavior:** The protocol parser admits only the complete captured rows
  and exact system relationships. PostgreSQL closes/reopens the canonical
  account and stores the adjustment atomically with delivery state and receipt.
- **Evidence:** `analysis/evidence/stock-captures/account-005/`.
- **Boundary:** Non-Checking and uncaptured close shapes fail closed. Balance
  validation remains at the stock snapshot boundary until canonical ordinary
  transactions are admitted.
- **Verification:** Focused positive/adversarial parsing, strict typecheck, and
  disposable PostgreSQL create/rename/close/reopen/replay integration.
- **Status:** implemented for the captured Checking shape.

### ADD-007 — Local semantic development stack

- **Disposition:** Add.
- **Purpose:** Run the forked React/server build and canonical PostgreSQL
  authority together without modifying stock Actual's Compose workflows.
- **Implementation:** `docker-compose.semantic.yml` builds the fork server,
  enables the semantic API, waits for PostgreSQL health, persists server and
  database state separately, and provides an on-demand integration-test
  target. `bin/semantic-stack` exposes explicit lifecycle commands.
- **Safety boundary:** The default password is local-development-only. Reset is
  an explicit destructive command. Docker does not replace physical iPhone
  compatibility acceptance.
- **Verification:** Image build, service health, bundled migration count,
  retained Actual authentication, authenticated catalog read, and disposable
  integration tests.
- **Commit/PR:** `[AI] Add semantic Docker development stack`.
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

### ADD-008 — Semantic budget client bridge

- **Disposition:** Add.
- **Location:** `packages/loot-core/src/server/semantic-budgets` and
  `packages/desktop-client/src/semantic-budgets`.
- **Fork behavior:** Typed catalog, read, create, rename, and delete commands
  cross the existing worker message bus. Loot-core alone owns the retained
  login token, durable semantic device identity, and HTTP envelope parsing.
- **Reason:** React must not read credentials or become a second transport
  implementation.
- **Migration/rollback:** The stock local SQLite budget lifecycle is not yet
  redirected. A projection or materialization boundary is required before a
  canonical plan can be opened by the legacy Actual UI without creating dual
  authority.
- **Verification:** Core and web typechecks plus focused HTTP, identity, and UI
  API tests.
- **Status:** implemented through the isolated Redux catalog/snapshot state;
  manager presentation and budget-screen projection remain pending.

### ADD-009 — Shared budget command application services

- **Disposition:** Add.
- **Location:** `packages/sync-server/src/semantic/budget-creation-service.ts`
  and `budget-lifecycle-service.ts`.
- **Fork behavior:** Semantic HTTP and future stock-compatible adapters call
  the same budget creation, rename, and delete orchestration. Identity allocation,
  PLAN-001 bootstrap construction, knowledge expectations, payload digests,
  and stored responses are not transport concerns.
- **Reason:** Duplicating command assembly in two routers would create behavior
  drift even if both write to the same PostgreSQL tables.
- **Verification:** Existing route command-shape tests, runtime PostgreSQL
  integration tests, lint, and strict typechecks.
- **Status:** implemented and consumed by the first stock catalog adapter; all
  later transport slices must continue to call these services rather than
  rebuilding command orchestration.

### ADD-010 — Evidence-backed Checking account creation

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/account.ts`,
  `packages/sync-server/src/semantic/account-creation-service.ts`, the native
  and stock account-operation adapters, and the stock account
  source/calculation projectors.
- **Observed stock behavior:** `ACCOUNT-002` creates one open on-budget
  Checking account, one enabled account-bound transfer payee, one cleared
  Starting Balance in Immediate Income, and the exact captured account,
  monthly-account, and Ready-to-Assign calculations.
- **Fork behavior:** One canonical account intent is mapped to three YNAB
  compatibility projections and committed atomically through the shared
  budget-change writer. The retained Actual-session and stock direct-import
  routes are independent thin protocol adapters. The stock route resolves its
  external budget-version identity before invoking the canonical service.
  Stock source and calculated projections remain separate modules.
- **Evidence:** `analysis/evidence/stock-captures/account-002/`. The dedicated
  endpoint and terminal bootstrap are admitted. Two browser-root page+worker
  recaptures confirm the page POST/HTTP 201 contract and observe no worker
  network request; the final instrumented commit observes no worker message.
- **Migration/rollback:** The command supports repeated unlinked Checking
  accounts with nonnegative starting balances. A browser-root bootstrap admits
  one independent entity/calculation group per account and additive budget
  calculations. Other types, linked accounts, and lifecycle mutations still
  fail closed.
- **Verification:** Focused domain/adapter/service/projection tests, disposable
  PostgreSQL atomicity, receipt replay, entity-count, and stock-bootstrap
  integration, plus deployed-Web creation and register readback. The live path
  proves the exact `Token token=` authorization wrapper and immediate
  knowledge-indexed read delta after HTTP 201.
- **Status:** implemented and runtime-verified for the canonical command,
  semantic adapter, and YNAB-shaped direct-import adapter over retained Actual
  session authority.

### ADD-011 — Explicit source and derived knowledge advancement

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/budget.ts` and
  `packages/semantic-postgres/src/store.ts`.
- **Observed stock behavior:** Source-only edits such as account/payee rename
  advance budget server knowledge once. Operations that trigger a server
  derivation pass advance twice. The derived delta may be empty, as ACCOUNT-005
  reopen demonstrates. The same distinction appears in ACCOUNT-004,
  split create/category/delete, category create/delete, target status/delete,
  transfer changes, and temporary-transaction deletion.
- **Fork behavior:** Every canonical plan change command explicitly declares a
  supported knowledge advance of `1` or `2`. PostgreSQL validates the value and
  stores the final knowledge and exact receipt atomically. Account creation uses
  `2`; opened-budget and account-rename deltas use `1`.
- **Reason:** A hard-coded `+1` made projected values correct but made the stock
  cursor contract wrong whenever server-derived calculations changed.
- **Evidence:** ACCOUNT-003 (`36 -> 37`), ACCOUNT-004 (`37 -> 39`), and the
  already-admitted split/category/target/transfer/payee fixtures.
- **Migration/rollback:** The range is deliberately limited to the two observed
  cases. Incremental delivery of individual derived revisions remains a later
  transport slice; bootstrap always projects terminal current state.
- **Verification:** Storage unit tests cover both advances and exact receipt
  replay. Disposable PostgreSQL tests cover account creation at `+2`, rename at
  `+1`, bootstrap readback, and the retained plan lifecycle.
- **Status:** implemented.

### ADD-012 — Evidence-backed pristine Checking deletion

- **Disposition:** Add.
- **Location:**
  `packages/sync-server/src/semantic/stock-pristine-account-delete.ts`.
- **Observed stock behavior:** ACCOUNT-004 `Delete Account` sends complete
  tombstones for a pristine Checking account, its bound transfer payee, and its
  only Starting Balance transaction group. The server returns terminal account
  calculations and recalculated budget/Immediate Income rows at `+2` knowledge.
- **Fork behavior:** A dedicated parser requires that exact current three-row
  relationship and rejects any extra transaction or divergent field. It emits
  source tombstones and a calculation delta derived by comparing current and
  terminal canonical projections. It never handles close/reopen.
- **Reason:** Deletion cannot safely share generic account mutation or transfer
  cascade code; the captured cardinality and terminal response are narrower.
- **Evidence:** `analysis/evidence/stock-captures/account-004/`.
- **Migration/rollback:** Other account deletion/closure shapes remain
  unsupported and fail closed.
- **Verification:** Focused negative/positive parser tests, calculation tests,
  strict typecheck, and disposable PostgreSQL create -> rename -> delete
  integration with exact knowledge and remaining-balance assertions.
- **Status:** implemented.

### ADD-013 — Deployed stock Web runtime

- **Disposition:** Add as the primary Web client boundary.
- **Location:** local-only `web-stock-runtime/vendor/` assets plus versioned
  manifests, runtime plans, schema-44 gateway modules, and client-patch records.
- **Fork behavior:** Preserve the deployed YNAB Web shell, routes, templates,
  editor, validation, entity/change-set, and interaction behavior. Redirect the
  minimum runtime configuration, authentication, bootstrap, synchronization,
  and SharedWorker boundaries to the project server.
- **Reason:** Literal parity is best achieved by retaining the deployed client
  behavior already shared with the stock Mobile lineage rather than
  reimplementing it.
- **Evidence:** Deep Web inspection dated 2026-08-19, schema-44 transaction
  capture, STARTUP-001, PLAN-001, and the direction correction dated
  2026-08-20.
- **Wire boundary:** Web schema 44 remains separate from iOS schema 42. Both
  project into the same semantic-core commands and PostgreSQL authority.
- **Provenance:** Raw captured vendor assets are local-only and ignored by Git.
  Every client patch records source/bundle location, reason, before/after hash,
  and runtime verification.
- **Status:** investigating runtime completeness; feature delivery is frozen
  beyond bootstrap/plan lifecycle until the smallest relocatable experiment is
  proven.

### ADD-014 — Canonical untargeted category lifecycle

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/category.ts`,
  `packages/sync-server/src/semantic/stock-category-lifecycle.ts`, and
  `packages/semantic-postgres/migrations/0008_canonical_category_domain.sql`.
- **Observed stock behavior:** CATEGORY-001 creates one category plus a current
  monthly row, derives a next-month row and two calculations, accepts complete
  rename/move/hide/unhide rows, and terminally tombstones the category and both
  monthly rows when the unused category is deleted.
- **Fork behavior:** A strict schema-44 adapter maps captured relationship-field
  variants into one typed category command. Canonical category definitions and
  monthly budgeting facts commit atomically with compatibility projections,
  ordered knowledge, and exact replay receipts.
- **Boundary:** Only untargeted ordinary categories and unused deletion are
  admitted. Referenced deletion, targets, assignments, and group lifecycle fail
  closed. PAYEE-001 creation remains grouped with ordinary transactions because
  that is the only captured invocation.
- **Verification:** Focused parser and gateway tests cover creation,
  server-derived rows, rename, move, hide, delete, malformed target rejection,
  reference rejection, cursor advancement, and replay. PostgreSQL migration and
  atomic-store tests cover typed row separation.
- **Status:** implemented and verified by the full local suites, strict
  TypeScript checks, and disposable PostgreSQL create/replay/update/delete plus
  authenticated runtime integration.

### ADD-015 — Canonical ordinary transaction and payee aggregate

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/transaction.ts`,
  `packages/sync-server/src/semantic/stock-ordinary-transaction.ts`, and
  `packages/semantic-postgres/migrations/0009_canonical_ordinary_transaction.sql`.
- **Observed stock behavior:** PAYEE-001 creates a new ordinary payee and its
  first unsplit transaction in one schema-44 request. The response normalizes
  `cash_amount` from zero to the transaction amount. Exact transaction deletion
  leaves the payee live; the retained payee can then be renamed and deleted
  once unused.
- **Fork behavior:** A strict stock adapter emits typed transaction/payee
  commands. Canonical rows, compatibility projections, calculation changes,
  knowledge, and exact replay receipts commit atomically. Live-reference payee
  deletion fails closed.
- **Boundary:** Only the uncategorized, unscheduled, non-transfer PAYEE-001
  shape is admitted. Standalone creation, merge, categorized edits, splits,
  transfers, payments, schedules, imports, and matching remain gated.
- **Verification:** Focused positive and adversarial parser tests, strict
  TypeScript checks, all local package suites, clean disposable PostgreSQL
  create/replay/delete/rename/delete readback, and authenticated runtime
  migration tests.
- **Status:** implemented.

### ADD-016 — Canonical split transaction aggregate

- **Disposition:** Add.
- **Location:** `packages/semantic-core/src/split-transaction.ts`,
  `packages/sync-server/src/semantic/stock-split-transaction.ts`, its bounded
  `stock-split-codec.ts`, `packages/semantic-postgres/src/split-transaction-store.ts`,
  and `packages/semantic-postgres/migrations/0010_canonical_split_transaction.sql`.
- **Observed stock behavior:** SPLIT-001/002 create one account-impacting parent
  and exactly two ordered category-impacting children. The server normalizes
  parent and child `cash_amount` values, accepts a parent-payee-only edit or one
  child-category-only edit as a full-group resend, and tombstones all three
  rows atomically on deletion.
- **Fork behavior:** A dedicated stock adapter emits a typed split aggregate.
  PostgreSQL stores the parent and ordered lines separately, while stock rows,
  calculation deltas, knowledge, and replay receipts remain compatibility
  concerns at the transaction boundary. Account totals count the parent once;
  category activity comes from the children.
- **Boundary:** Only the captured two-child create shapes, SPLIT-001 parent
  payee edit, SPLIT-001 single-child category edit, and SPLIT-001 exact delete
  are admitted. Amount/date/memo edits, variable child counts, transfers,
  payments, schedules, imports, and partial tombstones fail closed.
- **Verification:** Focused positive/adversarial adapter tests, strict
  TypeScript, clean PostgreSQL create/replay/edit/delete readback, and the
  authenticated runtime migration suite.
- **Status:** implemented.
