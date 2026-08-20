# Final product seed map

This reference identifies the smallest set of responsibilities from `DevsNate/actual` that are plausible starting points for a future clean final-product repository.

It is **not** a migration command, implementation plan, or authorization to copy code. It complements `promotion-policy.md` and `responsibility-map.md` by answering a narrower question:

> If a clean final repository were initialized later, what should be considered first, what should stay behind, and what must be redesigned before promotion?

The seed map is based on the verified stock Actual v26.8.1 baseline-to-`main` audit. Future YNAB reconnaissance may change domain ordering or reveal additional dependencies.

## Seed principle

The final repository should start from the smallest stable architectural core, not from a copy of the current fork.

The preferred sequence is:

```text
synchronization invariants
        |
        v
canonical contracts
        |
        v
canonical persistence
        |
        v
application/domain operations
        |
        +----------------------+
        |                      |
        v                      v
native product API       compatibility/ynab
        |
        v
final web/client
```

The current Actual host remains useful as a compatibility laboratory during this process.

## Seed group A — preserve first

These responsibilities are the strongest early candidates because they solve infrastructure problems without requiring the final product to inherit Actual UI/runtime architecture or YNAB wire naming.

### A1. Ordered knowledge model

Preserve the concepts of:

- principal-scoped catalog server knowledge;
- plan-scoped budget server knowledge;
- device knowledge of server state;
- server knowledge of device mutations;
- ordered change sets;
- explicit expected-knowledge validation.

Current source areas include `packages/semantic-core` contracts and `packages/semantic-postgres` storage.

**Seed status:** `CONCEPT-READY`; substantial implementation is likely `EXTRACTION-READY` after representation audit.

### A2. Exact idempotency and receipt replay

Preserve:

- command identity scoped to the appropriate principal/plan and device;
- payload digest comparison;
- atomic receipt storage with the committed change;
- exact replay of the original response;
- conflicting key reuse rejection;
- transaction rollback on failure.

This is one of the clearest reusable pieces in the existing PostgreSQL implementation.

**Seed status:** strong `CANONICAL-CANDIDATE`.

### A3. Change-set and tombstone semantics

Preserve:

- one atomic command producing an ordered change set;
- explicit entity identities;
- explicit tombstones rather than destructive disappearance;
- schema/version metadata where useful;
- retained materialized state for authorized reads and replay.

Do not assume the current generic `entity_kind + JSON payload` shape is automatically the final canonical storage model.

**Seed status:** invariant is `CONCEPT-READY`; current implementation requires storage-ownership review.

### A4. Source versus derivation revisions

Preserve the explicit operation-level distinction between:

- a source revision only; and
- a source revision followed by a second server-derivation revision.

A second revision is tied to the derivation pass and is not inferred from whether a terminal calculated delta happens to be nonempty.

The current `serverKnowledgeAdvance: 1 | 2` mechanism is a useful bounded representation of the observed behavior, but the final API may choose a more semantic type such as `derivation: none | run`.

**Seed status:** `CONCEPT-READY`.

### A5. Authorized semantic read boundaries

Preserve the idea that canonical reads are principal-authorized and identity-based, including lookup by stable plan identity and compatibility-facing budget-version identity where needed.

The final repository should choose whether budget-version identity belongs to canonical state or only the YNAB adapter.

**Seed status:** reader concepts and much of the PostgreSQL implementation are `CANONICAL-CANDIDATE`.

### A6. Migration discipline

Preserve:

- ordered, append-only database migrations;
- recorded migration application;
- disposable PostgreSQL integration verification;
- failure-before-partial-authority behavior.

Do not copy current package/workspace build plumbing solely because it exists.

**Seed status:** `CANONICAL-CANDIDATE`.

## Seed group B — preserve the semantic, redesign the representation

These responsibilities are important final-product behavior, but the existing code currently mixes semantic orchestration with YNAB `be_*` representation.

### B1. Plan creation

Preserve the semantic operation:

- create one plan;
- establish ownership/membership;
- initialize the plan atomically;
- establish initial knowledge and receipts;
- make retries exact and safe.

Redesign before promotion:

- do not make `buildStockPlanBootstrap` the canonical domain initializer;
- decide which default categories/payees/settings are genuine product domain state versus YNAB compatibility state;
- project any required `be_*` bootstrap separately for YNAB clients.

**Current status:** `CONCEPT-READY`, not wholesale-copy ready.

### B2. Plan lifecycle

Preserve:

- rename as one semantic lifecycle operation;
- deletion/removal semantics as explicitly defined rather than inferred;
- catalog and budget knowledge coordination;
- idempotent replay.

Redesign:

- remove direct persistence knowledge of `be_budget` payload editing from canonical storage;
- keep YNAB tombstone/name projection details in the adapter.

**Current status:** mixed `CANONICAL-CANDIDATE` / compatibility implementation.

### B3. Checking-account creation

Preserve the semantic relationship demonstrated by evidence:

- a checking account is created atomically with the related transfer-payee relationship and opening/starting-balance transaction behavior required by compatible clients;
- identity, replay, ordering, and knowledge movement are one operation.

Redesign:

- canonical service should express `Account`, `Payee/transfer relationship`, and `OpeningBalanceTransaction` domain changes rather than constructing `be_accounts`, `be_payees`, and `be_transactions` directly;
- YNAB-specific defaults and fields belong in the compatibility projector/parser.

**Current status:** `CONCEPT-READY`; implementation is representation-coupled.

### B4. Calculations and derivation engine

Preserve the architectural separation between source mutations and derived projections.

Do not promote the current stock calculation modules as the final canonical engine by default. They intentionally encode only admitted YNAB states and fail closed for unsupported combinations.

The final product will need to decide whether calculations are:

- computed canonical domain state;
- cached/materialized derived state;
- compatibility-only projections; or
- some combination of those.

The current evidence-derived calculation modules remain valuable as compatibility/reference tests regardless of the final canonical implementation.

**Current status:** architecture `CONCEPT-READY`; stock formulas/projectors remain `YNAB-COMPATIBILITY`.

## Seed group C — keep as first-class compatibility code, not canonical domain

These responsibilities should remain available because stock YNAB compatibility is a project requirement, but they should sit behind a dedicated adapter boundary.

Likely future area:

```text
packages/compatibility-ynab/
```

or equivalent.

Responsibilities include:

- `syncCatalogData` request/response handling;
- `syncBudgetData` bootstrap/backfill/delta handling;
- YNAB API/schema version checks;
- YNAB authentication/header conventions;
- `ce_*` catalog serialization;
- `be_*` source serialization;
- stock complete-record mutation parsing;
- stock calculated-row projection;
- exact response envelopes;
- fail-closed unsupported-operation behavior;
- direct-import account endpoint compatibility.

Current primary sources are `stock-*` modules in `packages/sync-server/src/semantic` plus `stock-budget-bootstrap.ts`.

**Default disposition:** leave operating in `DevsNate/actual` until a final YNAB adapter is intentionally implemented/extracted. Do not dissolve these rules into the canonical domain.

## Seed group D — leave in the Actual compatibility laboratory

Do not copy these into the final repository merely because they currently work:

- `session-principal-adapter.ts`;
- `packages/loot-core/src/server/semantic-budgets/*`;
- `packages/desktop-client/src/semantic-budgets/*`;
- semantic registrations in inherited Actual worker/Redux files;
- current `/semantic/v1` Express host composition;
- current `postgres-runtime.ts` composition root;
- `docker-compose.semantic.yml` as a final deployment decision;
- `bin/semantic-stack` as a final product CLI;
- sync-server Docker/build changes made to host the transitional architecture.

These are useful and should remain maintained in the compatibility laboratory while needed.

## Seed group E — do not carry forward as live authority

The governing fork architecture intends to replace, in the live budgeting authority path:

- Actual CRDT synchronization as canonical mutation authority; and
- encrypted/opaque Actual budget files as canonical budget state authority.

This seed map does not authorize deleting those inherited systems from `DevsNate/actual`. They remain part of the migration/compatibility host until their runtime dependencies are intentionally retired.

## Proposed final repository bootstrap

When the final repository becomes active, start smaller than the current fork. A plausible initial skeleton is:

```text
apps/
  server/
  web/                 # when product UI work begins

packages/
  domain/
  application/
  sync-contracts/
  persistence-postgres/
  compatibility-ynab/  # initially minimal or empty

tests/
  integration/

docs/
  architecture/
  provenance/
```

This is illustrative, not binding. Package boundaries should follow actual responsibilities discovered by extraction.

## First promotion tranche

The first tranche should contain no account/category/transaction business implementation unless the behavior map is sufficiently stable.

A safer first tranche is:

1. synchronization/knowledge vocabulary;
2. command/change-set contracts;
3. exact idempotency receipt semantics;
4. PostgreSQL migration runner and storage primitives;
5. authorized plan/catalog read primitives;
6. provenance/test infrastructure.

This gives the final repo a durable technical spine without prematurely freezing the budgeting domain model.

## Second promotion tranche

After foundational YNAB reconnaissance has mapped at least plan, account, transaction, payee, category, transfer, and split relationships well enough to expose the dependency graph, evaluate:

- canonical plan initialization;
- account lifecycle;
- transaction model;
- payee/category identity and relationship model;
- derivation/calculation engine boundaries;
- native API contracts.

Only then should the clean repo begin absorbing broad domain behavior.

## YNAB adapter promotion

The YNAB adapter can be promoted independently of the native product UI once its dependency direction is clean:

```text
compatibility/ynab
        |
        v
canonical application services
```

Never:

```text
canonical domain
        |
        v
YNAB wire projector
```

The compatibility laboratory remains the place where exact stock behavior is first proven. The final adapter receives only admitted and verified compatibility responsibilities with provenance.

## Provenance template for a seed extraction

Every extraction into the final repo should add a record similar to:

```text
Responsibility: exact plan change-set receipt replay
Promotion status: PROMOTED
Source repository: DevsNate/actual
Source baseline: Actual v26.8.1 / 063df037...
Source commits: 6e50cfc, 0ce59af, d6d21b5
Source files:
  packages/semantic-core/src/budget.ts
  packages/semantic-postgres/src/store.ts
Evidence dependencies:
  infrastructure invariant; exercised by admitted plan/account operations
Intentional differences:
  renamed Actual-specific package namespaces
  separated compatibility payload storage from canonical state
Final tests:
  ...
```

## Activation threshold for the final repository

Creating an empty repository or reserving its name can happen at any time. Broad implementation should wait until the project can answer, with reasonable confidence:

- what the canonical account/transaction/category/payee relationships are;
- how transfers and splits alter those relationships;
- what source facts drive the central budget calculations;
- which YNAB entities are domain facts versus compatibility serialization artifacts;
- which synchronization invariants are independent of YNAB representation.

This does not require exhaustive knowledge of every future YNAB feature. It requires enough of the foundational graph that the clean domain model is unlikely to be redesigned after every capture.

## Final seed decision

The existing fork already contains a valuable technical spine. The clean final product should preserve that spine deliberately while refusing to inherit the two forms of historical baggage around it:

1. **Actual-host baggage** — worker/Redux/session/CRDT/file migration constraints; and
2. **YNAB-representation baggage** — treating `ce_*`/`be_*` wire entities as the canonical domain merely because they were the first evidence-backed representation implemented.

The intended outcome is not a rewrite from memory and not a fork copy. It is a provenance-preserving extraction of verified invariants into a cleaner authority boundary.
