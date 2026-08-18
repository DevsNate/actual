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

| ID         | Stock area                               | Disposition        | Current status | Replacement or retained boundary                  |
| ---------- | ---------------------------------------- | ------------------ | -------------- | ------------------------------------------------- |
| ACTUAL-001 | Authentication and sessions              | Keep               | implemented    | Actual account DB plus semantic principal adapter |
| ACTUAL-002 | Express server shell                     | Keep and extend    | implemented    | Feature-gated semantic catalog route mounted      |
| ACTUAL-003 | File and user-access catalog             | Modify             | migrating      | Canonical plans and memberships in PostgreSQL     |
| ACTUAL-004 | CRDT sync endpoint and relay             | Replace            | proposed       | Semantic commands and ordered knowledge ledger    |
| ACTUAL-005 | Encrypted budget file as live authority  | Replace            | proposed       | Canonical PostgreSQL budget store                 |
| ACTUAL-006 | `loot-core` domain handlers              | Extract and modify | proposed       | Evidence-verified semantic services               |
| ACTUAL-007 | React application shell                  | Keep and reshape   | admitted       | YNAB-compatible UI over semantic web API          |
| ACTUAL-008 | Import, export, and backups              | Modify             | deferred       | Canonical-store adapters                          |
| ACTUAL-009 | Bank-provider ingestion                  | Modify             | deferred       | Provider facts enter through semantic commands    |
| ACTUAL-010 | Compatibility-server login               | Remove             | proposed       | Actual authentication adapter                     |
| ADD-001    | Canonical semantic database              | Add                | implemented    | PostgreSQL foundation; entity authority follows   |
| ADD-002    | Knowledge and receipt ledger             | Add                | implemented    | Ordered per-plan/device synchronization state     |
| ADD-003    | YNAB protocol gateway                    | Add                | migrating      | Evidence-derived stock projections                |
| ADD-004    | Web semantic API                         | Add                | implemented    | Read-only authenticated catalog slice             |
| ADD-005    | Compatibility fixture suite              | Add                | migrating      | Stock captures plus semantic and black-box tests  |
| ADD-006    | Framework-independent semantic contracts | Add                | implemented    | `@actual-app/semantic-core` workspace             |
| ADD-007    | Local semantic development stack         | Add                | implemented    | Fork server plus PostgreSQL Compose environment   |
| ADD-008    | Semantic plan client bridge              | Add                | implemented    | Typed worker boundary; no token access from React |
| ADD-009    | Shared plan command application services | Add                | implemented    | One orchestration path for React and stock routes |

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

- **Disposition:** Keep and reshape.
- **Stock locations:** `packages/desktop-client` and
  `packages/component-library`.
- **Reason:** The open-source React foundation avoids recreating routing,
  accessibility, localization, responsive behavior, and basic components.
- **Replacement boundary:** The data layer calls the semantic web API. UI
  workflows and appearance are recreated from captured stock behavior.
- **Portability correction:** The component-library theme documentation now
  shares the lowercase `src/themes` directory used by its CSS package exports.
  Stock tracked the documentation under `src/Themes`, which succeeds on a
  case-insensitive macOS checkout but breaks the Linux production build.
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
- **Implementation:** `packages/semantic-postgres` migration
  `0001_semantic_foundation.sql` defines canonical plans, memberships, catalog
  knowledge, devices, change sets, entity changes, and durable receipts. Text
  identifiers deliberately preserve opaque stock identities rather than
  assuming every admitted identifier is a UUID.
- **Catalog extension:** `0002_catalog_command_ledger.sql` separates catalog
  device knowledge, ordered catalog change sets, complete entity changes, and
  exact command receipts from the per-plan budget ledger.
- **Catalog command extension:**
  `0004_catalog_command_schema_version.sql` versions catalog command envelopes
  without rewriting the already-applied catalog migration.
- **Entity extension:** `0003_canonical_plan_entities.sql` adds structured
  date/currency metadata and a schema-versioned, tombstone-capable canonical
  entity snapshot table. Complete JSON payloads preserve unknown fields; no
  entity-specific behavior is inferred.
- **PLAN-001 bootstrap extension:** `buildStockPlanBootstrap` materializes the
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
- **Status:** migrating; read-only `syncCatalogData` membership projection is
  implemented. Pristine-plan `syncBudgetData` bootstrap/backfill and the exact
  BUDGET-001 `opened_budget` write are routed. Initial user, family, all other
  budget deltas/writes, nonzero calculations, and catalog-write operations
  remain explicit unsupported boundaries.

### ADD-004 — Web semantic API

- **Disposition:** Add.
- **Initial scope:** plan picker queries and plan lifecycle commands over the
  same semantic service used by ADD-003.
- **Implementation:** Feature-gated `GET /semantic/v1/catalog` authenticates
  with the retained `X-Actual-Token`, derives the principal server-side, and
  returns only that principal's canonical PostgreSQL memberships and catalog
  knowledge. Authenticated `POST /semantic/v1/plans` accepts only the admitted
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
- **Lifecycle extension:** `PostgresPlanLifecycleStore` and the thin lifecycle
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

### ADD-008 — Semantic plan client bridge

- **Disposition:** Add.
- **Location:** `packages/loot-core/src/server/semantic-plans` and
  `packages/desktop-client/src/semantic-plans`.
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

### ADD-009 — Shared plan command application services

- **Disposition:** Add.
- **Location:** `packages/sync-server/src/semantic/plan-creation-service.ts`
  and `plan-lifecycle-service.ts`.
- **Fork behavior:** Semantic HTTP and future stock-compatible adapters call
  the same plan creation, rename, and delete orchestration. Identity allocation,
  PLAN-001 bootstrap construction, knowledge expectations, payload digests,
  and stored responses are not transport concerns.
- **Reason:** Duplicating command assembly in two routers would create behavior
  drift even if both write to the same PostgreSQL tables.
- **Verification:** Existing route command-shape tests, runtime PostgreSQL
  integration tests, lint, and strict typechecks.
- **Status:** implemented and consumed by the first stock catalog adapter; all
  later transport slices must continue to call these services rather than
  rebuilding command orchestration.
