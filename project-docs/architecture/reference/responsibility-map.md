# Fork responsibility map

This reference maps the audited fork by **responsibility**, not by package or filename. It describes what each layer currently owns, where responsibilities are intentionally mixed, and what boundary a future final product should target.

It is derived from the verified baseline-to-`main` commit and file inventories. It does not replace admitted YNAB evidence or the governing fork architecture records.

## Current runtime shape

The fork currently has two client-facing paths converging on one semantic/PostgreSQL foundation:

```text
Retained Actual client
  React / Redux
       |
       v
loot-core worker bridge
       |
       v
/semantic/v1 native semantic HTTP
       |
       +------------------------+
                                |
Stock YNAB-compatible client    |
       |                        |
       v                        |
/api/v1 + /api stock gateways   |
       |                        |
       +-----------+------------+
                   |
                   v
          shared application services
                   |
                   v
          semantic contracts / stores
                   |
                   v
              PostgreSQL
```

The important property is convergence: native Actual-facing and stock YNAB-facing transports increasingly call the same semantic services and persistence boundary rather than maintaining independent business authorities.

## Responsibility layers

### 1. Semantic contract layer

**Primary location:** `packages/semantic-core`

**Current responsibility:** framework-independent principal, catalog, plan, lifecycle, change-set, knowledge, replay and result contracts.

**Strength:** largely independent of Express, React, Redux, SQLite, CRDT and PostgreSQL implementation details.

**Current leak:** `stock-plan-bootstrap.ts` lives in the same package and the generic `PlanEntity` abstraction is used to persist stock YNAB `be_*` entity kinds. This means package location alone does not prove canonical representation ownership.

**Target boundary:** final canonical contracts must be importable without importing or understanding YNAB table names, stock schema versions, Actual worker types, or retained Actual sessions.

### 2. Synchronization and persistence substrate

**Primary location:** `packages/semantic-postgres`

**Current responsibility:**

- catalog and plan knowledge;
- per-device knowledge;
- ordered change sets;
- explicit entity changes and tombstones;
- idempotency locks and payload digests;
- exact stored receipts and replay;
- principal-scoped reads;
- PostgreSQL transaction boundaries;
- canonical entity snapshots with unknown-field preservation.

**Strength:** this is the most portable implementation area in the fork.

**Current leaks:**

- plan lifecycle storage directly rewrites a `be_budget` entity payload during rename;
- some catalog/tombstone presentation details are evidence-derived;
- generic JSON entity snapshots currently allow compatibility representation to serve as de facto canonical state.

**Target boundary:** persistence owns consistency, ordering, replay and storage; it should not need to know YNAB wire/table naming except in a deliberately separate compatibility store/projection if such storage remains necessary.

### 3. Canonical application orchestration

**Primary location:** `packages/sync-server/src/semantic/*-service.ts`

**Current responsibility:** translate a semantic user operation into one atomic command against readers/writers, allocate identities, construct digests, and centralize operation-level semantics outside HTTP handlers.

**Examples:**

- plan creation;
- plan rename/delete;
- checking-account creation.

**Strength:** commit 14 established the correct architectural direction: transports call shared services rather than building semantic commands independently.

**Current leak:** plan creation calls `buildStockPlanBootstrap`; checking-account creation directly constructs `be_accounts`, `be_payees`, and `be_transactions` records. The orchestration boundary is good, but representation ownership is not yet clean.

**Target boundary:** application services express operations such as `CreatePlan`, `RenamePlan`, `CreateCheckingAccount`, and `DeleteAccount` in canonical domain terms. A YNAB compatibility layer separately translates those results to/from admitted stock representations.

### 4. YNAB compatibility layer

**Primary locations:**

- `packages/semantic-core/src/stock-plan-bootstrap.ts`;
- `packages/sync-server/src/semantic/stock-*`.

**Current responsibility:** reproduce only observed/admitted stock behavior, including:

- schema/version/header validation;
- `syncCatalogData` and `syncBudgetData` envelopes;
- stock authentication forms and endpoint shapes;
- `ce_*` and `be_*` entity projection;
- exact bootstrap/backfill/delta table surfaces;
- captured calculated rows;
- exact complete-record mutation parsers;
- fail-closed behavior for unsupported operations;
- source-only versus derivation-triggered server knowledge advancement.

**Strength:** the compatibility code is intentionally narrow and evidence-gated. Its strictness is a feature, not accidental inflexibility.

**Target boundary:** move conceptually behind `compatibility/ynab`. It may remain a first-class supported adapter indefinitely, but it must not define the canonical internal domain representation.

### 5. Native semantic HTTP layer

**Primary locations:**

- `catalog-api.ts`;
- `plan-api.ts`;
- `plan-lifecycle-api.ts`;
- `account-api.ts`.

**Current responsibility:** expose semantic operations to the retained Actual client through Express routes under `/semantic/v1`.

**Current leaks:** retained Actual token authentication, current envelope conventions, and in the account route the captured stock account body shape.

**Target boundary:** final product should define its own native API deliberately. Reuse semantic operations, not these HTTP contracts automatically.

### 6. Actual host adapters

**Primary locations:**

- `session-principal-adapter.ts`;
- `packages/loot-core/src/server/semantic-plans/`;
- `packages/desktop-client/src/semantic-plans/`;
- small registrations in inherited Actual files.

**Current responsibility:** let the retained Actual authentication, worker messaging, async storage and Redux environment consume the semantic server without exposing credentials to React.

**Strength:** allows incremental migration while preserving a working host shell.

**Target boundary:** remain in `DevsNate/actual` unless the final product independently chooses the same host architecture. The final product should not inherit these adapters merely because they were necessary during migration.

### 7. Transitional composition and development environment

**Primary locations:**

- `postgres-runtime.ts`;
- semantic mounts in `sync-server/src/app.ts`;
- semantic config in `load-config.js`;
- `docker-compose.semantic.yml`;
- `bin/semantic-stack`;
- sync-server Docker/build modifications.

**Current responsibility:** run retained Actual infrastructure and new semantic/PostgreSQL authority in one process/development stack.

**Target boundary:** compatibility-lab only. A final repository should choose its own composition root and deployment topology from product requirements.

### 8. Retained inherited Actual systems

These systems are mostly outside the custom-file delta but are essential to understanding the fork:

- retained Actual authentication/session authority;
- retained Express/server shell;
- retained React/component foundations;
- retained worker/client infrastructure;
- legacy file/CRDT budgeting paths still present during migration.

The governing fork records distinguish retention of useful host foundations from replacement of the old budgeting authority.

### 9. Intended retired budgeting authorities

The architecture records intend to remove the following from the **live budgeting authority path**, not necessarily delete their source immediately:

- CRDT synchronization as the canonical budget mutation authority;
- encrypted/opaque Actual budget files as the canonical budget state authority.

Their eventual disposition is separate from this custom-delta audit because most of their code is inherited rather than newly added.

## Representation ownership problem

The most important cross-layer issue found by the audit is this:

```text
Good current boundary:
transport -> shared service -> atomic writer

Still-mixed current boundary:
shared service -> constructs YNAB be_* entities -> generic semantic entity store
```

That design is safe for evidence-first reconstruction, but it should not automatically become the final architecture.

A cleaner target is:

```text
canonical command
      |
      v
canonical domain changes
      |
      +-------------------+
      |                   |
      v                   v
canonical persistence   YNAB projection
                          |
                          v
                    ce_* / be_* wire
```

This does **not** require throwing away the current semantic entity store. It means the final design must decide explicitly which fields/entities are canonical domain state and which exist only because a YNAB-compatible client expects them.

## Knowledge and derivation ownership

The audit also found one important concept that should remain independent of representation:

- an operation may advance one source revision; or
- it may also trigger a second server-derivation revision.

The second revision is about the derivation pass, not whether the terminal calculated delta is nonempty. This behavior should remain an explicit synchronization invariant rather than being inferred from whatever projector happened to emit rows.

## Desired long-term dependency direction

A final architecture should enforce a one-way dependency structure similar to:

```text
canonical contracts/domain
        ^
        |
application services
        ^
        |
canonical persistence

compatibility/ynab ------> canonical contracts/services
native API --------------> canonical contracts/services
web client --------------> native API/contracts
```

The canonical domain must not import the YNAB adapter or Actual host.

The YNAB adapter may import canonical contracts/services because its job is translation.

The Actual compatibility laboratory may compose all of them because it is deliberately the integration host.

## Responsibility conclusions

1. **PostgreSQL is not the main architectural problem.** The knowledge/receipt/change-set machinery is already a strong reusable foundation.
2. **Transport sharing is headed in the right direction.** Native and stock paths increasingly converge on the same services.
3. **Representation ownership is the main extraction issue.** `be_*` entities currently cross into shared services and generic semantic storage.
4. **`stock-*` should remain explicit.** Compatibility code is valuable executable evidence and should become a clear adapter boundary, not be dissolved into canonical code.
5. **Actual integration should remain replaceable.** Worker, Redux, session and composition code prove the migration inside Actual but do not define the final product architecture.
