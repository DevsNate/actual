# Custom file responsibility inventory

This reference classifies every file in the audited delta from stock Actual v26.8.1 commit `063df03763ca772b51f6264752b88ddec22cfb8a` to fork `main` head `3e45c9be8be57309151598a6dd5fe627014efd47`.

This is a responsibility and portability map, not a deletion plan. A file marked `KEEP-LAB` remains useful in `DevsNate/actual`; it simply should not be assumed to belong unchanged in a future clean product repository.

## Classification vocabulary

- **CANONICAL-CANDIDATE** — implementation or contract whose responsibility is broadly useful outside Actual and outside one YNAB wire shape. Promotion still requires extraction review.
- **CANONICAL-CONCEPT** — an architectural/domain rule worth preserving, but the current implementation is mixed with host or compatibility details.
- **YNAB-COMPATIBILITY** — recovered stock YNAB protocol, entity, calculation, parser, or projection behavior.
- **ACTUAL-ADAPTER** — connects semantic behavior to retained Actual authentication, worker, Redux, or other host infrastructure.
- **TRANSITIONAL** — exists because old Actual and new semantic systems currently coexist.
- **DEV-TOOLING** — local build/test/development infrastructure for the compatibility laboratory.
- **REFERENCE-DOC** — records decisions, evidence-derived architecture, or fork history.
- **INHERITED-FIX** — a small upstream/portability correction not part of the semantic product model.

Disposition vocabulary:

- **PROMOTE-CANDIDATE** — audit for extraction into the final project once behavior/domain boundaries stabilize.
- **EXTRACT-CONCEPT** — preserve the idea/invariant but redesign or separate the implementation before promotion.
- **KEEP-LAB** — retain in `actual` as compatibility/reference implementation; do not copy into the final product by default.
- **REBUILD-FINAL** — the final product may need the responsibility, but should implement it against its own host/runtime architecture.
- **REFERENCE-ONLY** — retain as historical/architectural provenance rather than product code.
- **NO-PROMOTION** — no reason to carry this delta into the final product.

## Root and development infrastructure

| File                                                | Responsibility             | Disposition   | Notes                                                                                                 |
| --------------------------------------------------- | -------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `bin/semantic-stack`                                | DEV-TOOLING                | KEEP-LAB      | Convenience wrapper for the fork-specific Docker stack.                                               |
| `docker-compose.semantic.yml`                       | DEV-TOOLING / TRANSITIONAL | REBUILD-FINAL | Useful local topology, but it explicitly runs retained Actual server/auth beside semantic PostgreSQL. |
| `sync-server.Dockerfile`                            | TRANSITIONAL / DEV-TOOLING | KEEP-LAB      | Modified to build/test the expanded Actual monorepo and semantic stack; not a final runtime decision. |
| `yarn.lock`                                         | BUILD ARTIFACT             | NO-PROMOTION  | Dependency-lock consequence of the fork changes.                                                      |
| `packages/component-library/src/themes/Theming.mdx` | INHERITED-FIX              | NO-PROMOTION  | Case-sensitive path portability correction for Linux builds.                                          |

## `packages/semantic-core`

| File                                 | Responsibility            | Disposition       | Notes                                                                                                                                                                     |
| ------------------------------------ | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                         | package scaffolding       | NO-PROMOTION      | Recreate as needed.                                                                                                                                                       |
| `package.json`                       | MIXED package boundary    | REBUILD-FINAL     | Package is conceptually useful, but currently exports both generic semantic contracts and stock bootstrap behavior.                                                       |
| `tsconfig.json`                      | package scaffolding       | REBUILD-FINAL     | Final repo should use its own build configuration.                                                                                                                        |
| `vitest.config.ts`                   | package scaffolding       | REBUILD-FINAL     | Final repo should use its own test configuration.                                                                                                                         |
| `src/index.ts`                       | MIXED export surface      | EXTRACT-CONCEPT   | Re-exports portable contracts and `stock-budget-bootstrap`; final canonical package should not expose stock representation from its root.                                 |
| `src/auth.ts`                        | CANONICAL-CANDIDATE       | PROMOTE-CANDIDATE | Framework-independent authenticated-principal/error contracts. Final naming/roles still require review.                                                                   |
| `src/auth.test.ts`                   | CANONICAL-CANDIDATE tests | PROMOTE-CANDIDATE | Port only with retained auth contract.                                                                                                                                    |
| `src/catalog.ts`                     | CANONICAL-CANDIDATE       | PROMOTE-CANDIDATE | Catalog membership, knowledge, command/change/receipt abstractions; currently includes fields also needed by stock projection but is not tied to Express/React.           |
| `src/budget.ts`                      | MIXED CANONICAL-CANDIDATE | EXTRACT-CONCEPT   | Generic plan/entity/read/change-set contracts are useful; current `BudgetEntity` remains representation-agnostic only structurally while callers store YNAB `be_*` kinds. |
| `src/budget-lifecycle.ts`            | CANONICAL-CANDIDATE       | PROMOTE-CANDIDATE | Atomic rename/delete command contracts and replay result shape.                                                                                                           |
| `src/stock-budget-bootstrap.ts`      | YNAB-COMPATIBILITY        | KEEP-LAB          | Admitted PLAN-001 stock `be_*` bootstrap defaults, system categories/payees, targets, identities, and field values.                                                       |
| `src/stock-budget-bootstrap.test.ts` | YNAB-COMPATIBILITY tests  | KEEP-LAB          | Executable evidence fixture for the stock bootstrap. Final YNAB adapter may derive tests from it, but it is not canonical domain logic.                                   |

### Semantic-core conclusion

`semantic-core` should not be promoted wholesale. The auth/catalog/lifecycle/change-set contracts are strong candidates; the root export surface and plan entity abstraction need redesign so stock `be_*` representation cannot become the canonical domain by accident.

## `packages/semantic-postgres`

| File                                                 | Responsibility                               | Disposition       | Notes                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.gitignore`                                         | package scaffolding                          | NO-PROMOTION      | Recreate as needed.                                                                                                                                                                                                                              |
| `package.json`                                       | CANONICAL-CANDIDATE package boundary         | PROMOTE-CANDIDATE | Very small dependency surface (`semantic-core`, `pg`), but should point at extracted final contracts.                                                                                                                                            |
| `tsconfig.json`                                      | package scaffolding                          | REBUILD-FINAL     | Final repo configuration.                                                                                                                                                                                                                        |
| `vitest.config.ts`                                   | package scaffolding                          | REBUILD-FINAL     | Final repo configuration.                                                                                                                                                                                                                        |
| `README.md`                                          | REFERENCE-DOC / CANONICAL-CONCEPT            | REFERENCE-ONLY    | Important record of storage invariants and deliberate exclusions; rewrite into final architecture docs when promoted.                                                                                                                            |
| `migrations/0001_semantic_foundation.sql`            | HISTORICAL CANONICAL-CANDIDATE               | REFERENCE-ONLY    | Original plan-named schema. Kept immutable because deployed migration history cannot be rewritten. Migration 0005 corrects its vocabulary.                                                                                                       |
| `migrations/0002_catalog_command_ledger.sql`         | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Separate principal/device catalog knowledge, ordered changes, and receipts.                                                                                                                                                                      |
| `migrations/0003_canonical_plan_entities.sql`        | CANONICAL-CONCEPT                            | EXTRACT-CONCEPT   | Unknown-field-preserving entity snapshots are valuable; a final domain model should decide whether generic JSON entity storage remains canonical or becomes compatibility storage.                                                               |
| `migrations/0004_catalog_command_schema_version.sql` | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Versioned catalog change-set concept.                                                                                                                                                                                                            |
| `migrations/0005_budget_identity_schema.sql`         | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Data-preserving rename to `budget_id` and `semantic_budget_*`; retains distinct budget-version and membership identities.                                                                                                                        |
| `src/errors.ts`                                      | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Stable persistence/sync error taxonomy, subject to final naming.                                                                                                                                                                                 |
| `src/migrate.ts`                                     | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Transactional ordered migration runner independent of Actual runtime.                                                                                                                                                                            |
| `src/foundation-migration.ts`                        | BUILD/EMBED ADAPTER                          | REBUILD-FINAL     | Raw-SQL bundling helper for the current build system.                                                                                                                                                                                            |
| `src/catalog-command-migration.ts`                   | BUILD/EMBED ADAPTER                          | REBUILD-FINAL     | Same.                                                                                                                                                                                                                                            |
| `src/canonical-budget-entity-migration.ts`           | BUILD/EMBED ADAPTER                          | REBUILD-FINAL     | Same.                                                                                                                                                                                                                                            |
| `src/catalog-schema-version-migration.ts`            | BUILD/EMBED ADAPTER                          | REBUILD-FINAL     | Same.                                                                                                                                                                                                                                            |
| `src/budget-identity-schema-migration.ts`            | BUILD/EMBED ADAPTER                          | REBUILD-FINAL     | Same; embeds the audited 0005 compatibility migration.                                                                                                                                                                                           |
| `src/index.ts`                                       | package export surface                       | EXTRACT-CONCEPT   | Rebuild around the promoted subset.                                                                                                                                                                                                              |
| `src/types.ts`                                       | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Store command/result aliases and seed types; seed-specific types may stay lab-only.                                                                                                                                                              |
| `src/store.ts`                                       | MIXED CANONICAL-CANDIDATE                    | EXTRACT-CONCEPT   | Contains the most valuable atomic knowledge/idempotency/replay machinery, but also plan/bootstrap/catalog assumptions and compatibility-influenced payload behavior. Extract primitives/services rather than copy the 1000-line store wholesale. |
| `src/store.test.ts`                                  | MIXED tests                                  | EXTRACT-CONCEPT   | Preserve atomicity, replay, knowledge mismatch, validation and rollback cases around the extracted store.                                                                                                                                        |
| `src/postgres.integration.test.ts`                   | CANONICAL-CANDIDATE integration tests        | EXTRACT-CONCEPT   | Strong disposable-Postgres proof of store semantics; port scenarios that survive schema redesign.                                                                                                                                                |
| `src/budget-reader.ts`                               | CANONICAL-CANDIDATE                          | PROMOTE-CANDIDATE | Principal-authorized plan/budget-version read boundary; entity shape may change with final domain storage.                                                                                                                                       |
| `src/budget-lifecycle-store.ts`                      | MIXED CANONICAL-CONCEPT + YNAB-COMPATIBILITY | EXTRACT-CONCEPT   | Atomic lifecycle/replay/knowledge logic is reusable, but current rename directly rewrites `be_budget` payload and delete/catalog semantics include stock-derived details.                                                                        |

### Semantic-postgres conclusion

This is the strongest source of promotable implementation, but it should be split into final persistence primitives, canonical domain storage, and YNAB compatibility storage/projection rather than copied as one package.

## `packages/sync-server` host integration

| File                 | Responsibility                | Disposition | Notes                                                                                                    |
| -------------------- | ----------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `package.json`       | TRANSITIONAL                  | KEEP-LAB    | Adds semantic/PostgreSQL dependencies to inherited Actual server.                                        |
| `src/app.ts`         | ACTUAL-ADAPTER / TRANSITIONAL | KEEP-LAB    | Feature-gated mounts for `/semantic/v1`, stock `/api/v1`, and stock account `/api` within Actual server. |
| `src/load-config.js` | ACTUAL-ADAPTER                | KEEP-LAB    | Adds semantic enable/database settings to Actual configuration.                                          |
| `tsconfig.json`      | TRANSITIONAL build config     | KEEP-LAB    | Build support for new semantic imports.                                                                  |
| `vite.config.mts`    | TRANSITIONAL build config     | KEEP-LAB    | Bundles SQL/raw migration imports into Actual server build.                                              |

## Semantic native APIs and application services

| File                                                | Responsibility                                 | Disposition       | Notes                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/semantic/catalog-api.ts`                       | ACTUAL-ADAPTER / HTTP ADAPTER                  | REBUILD-FINAL     | Thin authenticated Express transport over `CatalogReader`; final server may need analogous endpoint, not this host-specific implementation.                                                                         |
| `src/semantic/catalog-api.test.ts`                  | adapter tests                                  | KEEP-LAB          | Verifies retained Actual session behavior and semantic envelope.                                                                                                                                                    |
| `src/semantic/budget-api.ts`                        | HTTP ADAPTER / TRANSITIONAL                    | REBUILD-FINAL     | Native semantic read/create Express routes; delegates creation to application service but is coupled to current envelope/auth host.                                                                                 |
| `src/semantic/budget-api.test.ts`                   | adapter tests                                  | KEEP-LAB          | Current host contract proof.                                                                                                                                                                                        |
| `src/semantic/budget-lifecycle-api.ts`              | HTTP ADAPTER / TRANSITIONAL                    | REBUILD-FINAL     | Native rename/delete transport over lifecycle service.                                                                                                                                                              |
| `src/semantic/budget-lifecycle-api.test.ts`         | adapter tests                                  | KEEP-LAB          | Current host contract proof.                                                                                                                                                                                        |
| `src/semantic/account-api.ts`                       | MIXED HTTP ADAPTER + YNAB REQUEST SHAPE        | KEEP-LAB          | Semantic route currently parses the captured stock Checking body shape, so it is not a clean canonical API.                                                                                                         |
| `src/semantic/account-api.test.ts`                  | MIXED adapter/compat tests                     | KEEP-LAB          | Executable proof of the admitted request restrictions.                                                                                                                                                              |
| `src/semantic/budget-creation-service.ts`           | MIXED CANONICAL-CONCEPT + YNAB-COMPATIBILITY   | EXTRACT-CONCEPT   | Good shared application-service boundary, but directly invokes `buildStockBudgetBootstrap` and returns stock-shaped IDs. Preserve orchestration, separate canonical budget creation from YNAB bootstrap projection. |
| `src/semantic/budget-lifecycle-service.ts`          | CANONICAL-CANDIDATE application service        | PROMOTE-CANDIDATE | Centralizes change IDs, digests and lifecycle writer calls outside HTTP. Review response shapes/stock-derived deletion semantics before promotion.                                                                  |
| `src/semantic/account-creation-service.ts`          | MIXED CANONICAL-CONCEPT + YNAB-COMPATIBILITY   | EXTRACT-CONCEPT   | Atomic Checking creation semantics are valuable, but implementation directly constructs captured `be_accounts`, transfer `be_payees`, and Starting Balance `be_transactions`.                                       |
| `src/semantic/account-creation-service.test.ts`     | MIXED semantic/compat tests                    | EXTRACT-CONCEPT   | Preserve semantic invariants while moving exact `be_*` shape tests to YNAB adapter tests.                                                                                                                           |
| `src/semantic/postgres-runtime.ts`                  | ACTUAL-ADAPTER / TRANSITIONAL composition root | KEEP-LAB          | Wires retained Actual sessions, PostgreSQL stores, native APIs and stock gateways together.                                                                                                                         |
| `src/semantic/postgres-runtime.integration.test.ts` | LAB INTEGRATION                                | KEEP-LAB          | Valuable end-to-end compatibility proof inside Actual; final repo should have separate canonical and YNAB acceptance suites.                                                                                        |
| `src/semantic/session-principal-adapter.ts`         | ACTUAL-ADAPTER                                 | KEEP-LAB          | Converts retained Actual account/session DB state into semantic principal.                                                                                                                                          |
| `src/semantic/session-principal-adapter.test.ts`    | ACTUAL-ADAPTER tests                           | KEEP-LAB          | Retained Actual auth proof.                                                                                                                                                                                         |

## Stock YNAB compatibility implementation

All files in this section are intentionally stock-protocol/evidence responsibilities. They are valuable and should remain well-tested, but their default destination is the compatibility laboratory or a future dedicated YNAB adapter package — not the canonical domain package.

| File                                                  | Responsibility           | Disposition | Notes                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/semantic/stock-operation.ts`                     | YNAB-COMPATIBILITY       | KEEP-LAB    | Shared stock API/schema constants, request context, parsing helpers and error envelope primitives.                                                                                       |
| `src/semantic/stock-catalog-gateway.ts`               | YNAB-COMPATIBILITY       | KEEP-LAB    | Express mount/auth/headers for stock catalog endpoint.                                                                                                                                   |
| `src/semantic/stock-catalog-gateway.test.ts`          | YNAB-COMPATIBILITY tests | KEEP-LAB    | Stock transport contract proof.                                                                                                                                                          |
| `src/semantic/stock-catalog-operation.ts`             | YNAB-COMPATIBILITY       | KEEP-LAB    | `syncCatalogData` parsing/knowledge/projection semantics.                                                                                                                                |
| `src/semantic/stock-budget-gateway.test.ts`           | YNAB-COMPATIBILITY tests | KEEP-LAB    | Broad `syncBudgetData` compatibility suite.                                                                                                                                              |
| `src/semantic/stock-budget-operation.ts`              | YNAB-COMPATIBILITY       | KEEP-LAB    | Stock budget dispatcher, exact admitted delta recognition, knowledge advancement and fail-closed unsupported behavior. Should be decomposed as coverage grows, not promoted canonically. |
| `src/semantic/stock-budget-bootstrap.ts`              | YNAB-COMPATIBILITY       | KEEP-LAB    | Exact bootstrap/backfill/empty-delta table surfaces.                                                                                                                                     |
| `src/semantic/stock-budget-projection.ts`             | YNAB-COMPATIBILITY       | KEEP-LAB    | Canonical snapshot → stock `be_*` wire conversion, snake casing and collision checks. Candidate for a future dedicated YNAB adapter package, never canonical domain.                     |
| `src/semantic/stock-budget-projection.test.ts`        | YNAB-COMPATIBILITY tests | KEEP-LAB    | Projection contract/evidence tests.                                                                                                                                                      |
| `src/semantic/stock-budget-calculations.ts`           | YNAB-COMPATIBILITY       | KEEP-LAB    | Captured pristine-plan calculation rows and identities.                                                                                                                                  |
| `src/semantic/stock-budget-calculations.test.ts`      | YNAB-COMPATIBILITY tests | KEEP-LAB    | Calculation evidence tests.                                                                                                                                                              |
| `src/semantic/stock-budget-calculation-projection.ts` | YNAB-COMPATIBILITY       | KEEP-LAB    | Chooses supported stock calculation projector by observed state.                                                                                                                         |
| `src/semantic/stock-checking-account-calculations.ts` | YNAB-COMPATIBILITY       | KEEP-LAB    | Evidence-backed Starting Balance/multi-account calculation projection; current pushed version intentionally rejects ordinary transactions.                                               |
| `src/semantic/stock-account-gateway.ts`               | YNAB-COMPATIBILITY       | KEEP-LAB    | Captured direct-import account endpoint and Token auth translation.                                                                                                                      |
| `src/semantic/stock-account-gateway.test.ts`          | YNAB-COMPATIBILITY tests | KEEP-LAB    | Stock account route contract.                                                                                                                                                            |
| `src/semantic/stock-account-rename.ts`                | YNAB-COMPATIBILITY       | KEEP-LAB    | Exact complete-record account + transfer-payee rename parser; rejects unobserved concurrent differences.                                                                                 |
| `src/semantic/stock-account-rename.test.ts`           | YNAB-COMPATIBILITY tests | KEEP-LAB    | Evidence-shaped rename parser tests.                                                                                                                                                     |
| `src/semantic/stock-pristine-account-delete.ts`       | YNAB-COMPATIBILITY       | KEEP-LAB    | Exact pristine delete parser, source tombstones and derived calculation delta.                                                                                                           |
| `src/semantic/stock-pristine-account-delete.test.ts`  | YNAB-COMPATIBILITY tests | KEEP-LAB    | ACCOUNT-004 compatibility tests.                                                                                                                                                         |

### Compatibility conclusion

The `stock-*` family is not technical debt merely because it is not canonical. It is the executable reference implementation of admitted YNAB behavior. The long-term cleanup is to place it behind a clear `compatibility/ynab` boundary, not to merge it into the canonical domain or discard it.

## Actual desktop-client integration

| File                                                                        | Responsibility                | Disposition | Notes                                                                            |
| --------------------------------------------------------------------------- | ----------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `packages/desktop-client/package.json`                                      | ACTUAL-ADAPTER                | KEEP-LAB    | Adds aliases/dependencies required by semantic plan bridge.                      |
| `packages/desktop-client/src/redux/store.ts`                                | ACTUAL-ADAPTER                | KEEP-LAB    | Wires semantic plan slice into inherited Actual Redux store.                     |
| `packages/desktop-client/src/semantic-budgets/api.ts`                       | ACTUAL-ADAPTER                | KEEP-LAB    | React-facing wrappers over Actual worker message bus; allocates idempotency IDs. |
| `packages/desktop-client/src/semantic-budgets/api.test.ts`                  | ACTUAL-ADAPTER tests          | KEEP-LAB    | Worker bridge contract proof.                                                    |
| `packages/desktop-client/src/semantic-budgets/semanticBudgetsSlice.ts`      | ACTUAL-ADAPTER / TRANSITIONAL | KEEP-LAB    | Redux catalog/plan state while legacy Actual budget state still exists.          |
| `packages/desktop-client/src/semantic-budgets/semanticBudgetsSlice.test.ts` | ACTUAL-ADAPTER tests          | KEEP-LAB    | Current client-state proof.                                                      |

## Actual `loot-core` worker integration

| File                                                              | Responsibility                     | Disposition     | Notes                                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/loot-core/src/server/main.ts`                           | ACTUAL-ADAPTER                     | KEEP-LAB        | Registers semantic plan worker app in inherited Actual server worker.                                                                |
| `packages/loot-core/src/server/semantic-budgets/app.ts`           | ACTUAL-ADAPTER                     | KEEP-LAB        | Worker methods for catalog/read/create/rename/delete using retained server config/token/device identity.                             |
| `packages/loot-core/src/server/semantic-budgets/http.ts`          | ACTUAL-ADAPTER                     | KEEP-LAB        | Actual platform fetch wrapper for `/semantic/v1`.                                                                                    |
| `packages/loot-core/src/server/semantic-budgets/http.test.ts`     | ACTUAL-ADAPTER tests               | KEEP-LAB        | Header/envelope/error translation tests.                                                                                             |
| `packages/loot-core/src/server/semantic-budgets/identity.ts`      | ACTUAL-ADAPTER / CANONICAL-CONCEPT | EXTRACT-CONCEPT | Durable client device identity is a useful sync concept, but implementation uses Actual async storage.                               |
| `packages/loot-core/src/server/semantic-budgets/identity.test.ts` | ACTUAL-ADAPTER tests               | KEEP-LAB        | Current storage behavior.                                                                                                            |
| `packages/loot-core/src/server/semantic-budgets/types.ts`         | ACTUAL-ADAPTER DTOs                | REBUILD-FINAL   | Duplicated client transport types for inherited worker boundary; final product should derive/share canonical contracts deliberately. |
| `packages/loot-core/src/types/handlers.ts`                        | ACTUAL-ADAPTER                     | KEEP-LAB        | Adds semantic worker handler types to inherited registry.                                                                            |
| `packages/loot-core/src/types/prefs.ts`                           | ACTUAL-ADAPTER                     | KEEP-LAB        | Adds durable semantic device ID preference.                                                                                          |

## Architecture documentation

| File                                                       | Responsibility                     | Disposition     | Notes                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `project-docs/architecture/README.md`                      | REFERENCE-DOC                      | REFERENCE-ONLY  | Governance/index for fork architecture records.                                                          |
| `project-docs/architecture/selective-fork-decision.md`     | REFERENCE-DOC                      | REFERENCE-ONLY  | Governing decision for retaining Actual shell while replacing budgeting authority.                       |
| `project-docs/architecture/stock-actual-change-ledger.md`  | REFERENCE-DOC                      | REFERENCE-ONLY  | Authoritative fork-delta ledger; remains in `actual`, not copied as final-product architecture.          |
| `project-docs/architecture/semantic-catalog-api.md`        | REFERENCE-DOC                      | REFERENCE-ONLY  | Records native semantic catalog boundary in the fork.                                                    |
| `project-docs/architecture/semantic-budget-lifecycle.md`   | REFERENCE-DOC / CANONICAL-CONCEPT  | EXTRACT-CONCEPT | Strong source for final lifecycle invariants, while transport/compatibility references are lab-specific. |
| `project-docs/architecture/semantic-account-creation.md`   | REFERENCE-DOC / MIXED              | EXTRACT-CONCEPT | Records admitted account semantics and current compatibility boundary.                                   |
| `project-docs/architecture/semantic-docker-development.md` | REFERENCE-DOC / DEV-TOOLING        | REFERENCE-ONLY  | Documents compatibility-lab stack.                                                                       |
| `project-docs/architecture/stock-catalog-gateway.md`       | REFERENCE-DOC / YNAB-COMPATIBILITY | REFERENCE-ONLY  | Stock catalog transport/evidence record.                                                                 |

## File-level conclusions

### Strongest promotion candidates

The files closest to portable final-product code are the framework-independent semantic contracts, the PostgreSQL knowledge/change-set/receipt infrastructure, the migration/reader primitives, and portions of the shared application-service layer. Even these require a deliberate extraction review because the current canonical snapshot boundary still permits YNAB `be_*` entity kinds to act as the persisted semantic representation.

### Keep in the compatibility laboratory

The entire `stock-*` family, retained Actual session adapter, Actual worker bridge, Redux integration, current composition root, and fork-specific Docker stack should remain authoritative in `DevsNate/actual` for compatibility verification. Their existence is useful even if none of them is copied unchanged into the final product.

### Primary architectural debt to resolve before promotion

The main boundary problem is not PostgreSQL or idempotency. It is representation ownership: shared plan/account services currently create or modify YNAB-shaped `be_*` entities directly. The final product should distinguish canonical domain state from YNAB compatibility serialization/projection so that recovered wire/storage details do not become accidental product architecture.
