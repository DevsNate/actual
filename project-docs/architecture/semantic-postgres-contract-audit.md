# Semantic PostgreSQL contract audit

- Audited: 2026-08-20
- Scope: every custom PostgreSQL table, identity, cursor, constraint, receipt,
  payload store, and transaction boundary used by the semantic server
- Governing evidence: admitted stock captures and the fork architecture records

This audit exists to prevent the early PostgreSQL foundation from becoming an
accidental product specification. A database name or constraint is not evidence
of stock behavior. Proven identities and consistency mechanisms are retained;
unsupported cardinality and compatibility details remain explicit limitations.

## Identity vocabulary

| Canonical name              | Meaning                                                                        | Decision                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `budget_id`                 | Stable YNAB budget identity exposed as `budget_id` by catalog/create responses | Retain as the canonical budget key. Former internal `plan_id` is migrated to this name.                                |
| `budget_version_id`         | Distinct stock budget materialization/version identity                         | Retain separately. Never substitute it for `budget_id`. Resolve version-only protocol requests at an adapter boundary. |
| `membership_id`             | Principal-to-budget catalog membership identity (`ce_user_budgets.id`)         | Retain independently from both budget identities.                                                                      |
| `principal_id`              | Authenticated authority/scoping identity                                       | Retain. It is never accepted from an unauthenticated request as authority.                                             |
| `device_id`                 | Client/device knowledge and replay scope                                       | Retain as an opaque protocol identity.                                                                                 |
| `change_set_id`             | Server ledger entry identity                                                   | Retain. It does not identify a budget or entity.                                                                       |
| `idempotency_key`           | Caller-scoped retry identity                                                   | Retain only together with its principal/budget, device, and payload digest.                                            |
| `entity_kind` + `entity_id` | Identity inside a budget projection or change set                              | Retain as an open pair while domains are admitted incrementally. It is not a substitute for typed domain records.      |

The schema deliberately has no third internal budget identity. It also does not
collapse `budget_id`, `budget_version_id`, or `membership_id`.

## Catalog-scoped tables

### `semantic_catalog_knowledge`

- `principal_id` is the primary key.
- `server_knowledge` is the current ordered catalog revision for that principal.
- `updated_at` is operational metadata, not a protocol identity.

This table owns catalog ordering only. It does not contain budget knowledge.

### `semantic_catalog_devices`

- `(principal_id, device_id)` is the primary key.
- `server_knowledge_of_device` records the admitted client knowledge counter.
- `updated_at` is operational metadata.

The row is locked before accepting a catalog command. It prevents one device's
cursor from acknowledging another device's work.

### `semantic_catalog_change_sets`

- `change_set_id` is the immutable ledger identity.
- `(principal_id, server_knowledge)` is unique and orders catalog changes.
- `(principal_id, origin_device_id, idempotency_key)` is unique.
- starting/ending device knowledge, schema version, command kind, and payload
  digest preserve the accepted command envelope.
- `committed_at` records commit time only.

Migration 0005 rewrites historical internal command labels
`create-plan`/`rename-plan`/`delete-plan` to budget terminology without changing
knowledge, digests, or responses.

### `semantic_catalog_entity_changes`

- `(change_set_id, ordinal)` is the primary key.
- `entity_kind`, `entity_id`, `is_tombstone`, and `payload` preserve each ordered
  catalog projection in the accepted change set.

This is immutable history. It is not the current membership table.

### `semantic_catalog_command_receipts`

- `(principal_id, device_id, idempotency_key)` is the primary key.
- `(principal_id, server_knowledge)` references the exact catalog change set.
- digest, device knowledge range, server knowledge, and JSON response provide
  exact replay.

A repeated key with a different digest fails. A receipt response is returned as
stored; it is not reconstructed from current state.

## Budget-scoped tables

### `semantic_budgets`

- `budget_id` is the primary key.
- `budget_version_id` is distinct and currently unique.
- `name`, `currency_format`, and `date_format` are current budget metadata.
- `is_tombstone` is budget-level terminal state; membership deletion is separate.
- `server_knowledge` is the current ordered budget revision.
- timestamps are operational metadata.

The current uniqueness of `budget_version_id` supports the admitted one-current-
version model. It is **not** evidence for complete Fresh Start/version-history
cardinality. That model must be revisited when version-history evidence is
admitted rather than inferred now.

### `semantic_budget_memberships`

- `membership_id` is the primary key.
- `budget_id` references `semantic_budgets`.
- `(budget_id, principal_id)` is currently unique.
- `permissions` and `is_tombstone` are retained catalog membership facts.

A membership tombstone removes discovery/access for one principal. It does not
physically delete the budget, its ledger, or a client's local cache.

The one-membership-per-principal constraint matches the admitted owner path.
Sharing/permission mutation cardinality remains unadmitted and must be revisited
before collaboration features are enabled.

### `semantic_budget_devices`

- `(budget_id, device_id)` is the primary key.
- `server_knowledge_of_device` is the client knowledge counter for this budget.

Catalog and budget device counters are intentionally separate.

### `semantic_budget_change_sets`

- `change_set_id` is the immutable ledger identity.
- `(budget_id, server_knowledge)` is unique and orders budget changes.
- `(budget_id, origin_device_id, idempotency_key)` is unique.
- starting/ending device knowledge, schema version, and digest preserve the
  accepted command envelope.

`serverKnowledgeAdvance` is validated by the application command and materialized
as the next ledger knowledge. The current admitted values are 1 (source change)
or 2 (source plus a derivation revision). This is not inferred from whether a
calculated response happened to be empty.

### `semantic_budget_entity_changes`

- `(change_set_id, ordinal)` is the primary key.
- kind, identity, tombstone, and JSON payload preserve immutable ordered history.

### `semantic_budget_device_receipts`

- `(budget_id, device_id, idempotency_key)` is the primary key.
- `(budget_id, server_knowledge)` references the exact budget change set.
- digest, knowledge range, server knowledge, and response provide exact replay.

Acknowledgement-only receipts may reference an existing change set without
creating another change set. They advance only the device cursor.

### `semantic_budget_entities`

- `(budget_id, entity_kind, entity_id)` is the primary key.
- schema version, tombstone, JSON payload, and last server knowledge are the
  current materialized projection.
- the delivery index orders changed projection rows by budget knowledge.

This table is **transitional compatibility projection storage**. It currently
contains admitted YNAB `be_*` rows and preserves unknown JSON fields so stock
clients can bootstrap and receive deltas. Its generic name does not make those
wire rows canonical domain records. New domain services must construct typed
domain changes first and delegate `be_*` conversion to the YNAB adapter. A later
canonical domain store may coexist with or replace this projection without
changing ledger/receipt semantics.

## Transaction and replay boundaries

- Migrations are serialized with a PostgreSQL advisory transaction lock and are
  recorded in `semantic_schema_migrations`.
- Catalog and budget commands run in one PostgreSQL transaction.
- Knowledge rows and device rows are locked before mutation.
- Idempotency is serialized by a scoped advisory transaction lock.
- Ledger rows, current projections, cursors, and receipts commit together or
  roll back together.
- JSONB is used where unknown compatibility fields must survive round trips;
  admitted protocol adapters still validate the exact supported shape.

`READ COMMITTED` is sufficient for the current implementation because the
specific authority/cursor rows are locked. Any new operation that reads a set
whose membership affects validity must add an explicit lock or stronger
transaction predicate; it must not rely on a prior unlocked snapshot.

## Migration 0005 guarantees

Migration `0005_budget_identity_schema.sql`:

1. renames all seven budget-scoped tables;
2. renames every budget-scoped `plan_id` column to `budget_id`;
3. renames constraints and indexes so diagnostics use the canonical vocabulary;
4. preserves `budget_version_id` as a distinct column;
5. updates only historical internal lifecycle command labels; and
6. does not delete, recreate, or re-key any budget, membership, device, ledger,
   entity, or receipt row.

The PostgreSQL integration test populates the 0001–0004 schema before applying
0005, then verifies identity, membership, device knowledge, change knowledge,
entity history, replay response, current projection, and command label after
the migration. It also reruns the complete migration set twice to prove
idempotency.

## Explicitly unsupported assumptions

The foundation must not silently decide any of the following until evidence is
admitted:

- complete budget-version/Fresh Start history cardinality;
- collaboration and permission mutation cardinality;
- deletion of physical budget data when a membership is tombstoned;
- stock `be_*` payloads as the final canonical domain schema;
- arbitrary server-knowledge jumps beyond admitted derivation rules;
- reconstruction of replay responses from current state;
- cross-device cursor substitution; or
- protocol identity fallback by name.

These are evidence gaps, not implementation defaults.

## iOS 26.30 reconciliation (2026-08-20)

The earlier sections describe what the current PostgreSQL foundation intends to
guarantee. They do **not** mean that the present schema is a complete canonical
budget model. The exact iOS 26.30 extraction now provides a stronger boundary:

- 31 registered entity serializers: 25 budget, 4 catalog, and 2 family;
- separate wire, in-memory, database, identity, relationship, and local-only
  fields for every registered entity;
- grouped parent/child wire shapes for transactions and schedules;
- a six-stage calculation dependency order; and
- exact catalog, budget, and family sync envelope vocabulary.

The generated evidence is stored outside this package in:

- `analysis/ios-shared-library-26.30/canonical_entity_dictionary.json`;
- `analysis/ios-shared-library-26.30/SHARED_SEMANTIC_MODEL.md`;
- `analysis/ios-shared-library-26.30/PROTOCOL_SURFACE.md`; and
- `analysis/ios-shared-library-26.30/CONFIDENCE_AND_GAPS.md`.

### Retain unchanged in principle

| Current facility                                               | Decision | Reason                                                                                   |
| -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| migration ledger and advisory migration lock                   | Retain   | Operational mechanism, independent of budgeting semantics.                               |
| scoped device cursors                                          | Retain   | Exact stock envelopes carry device/server knowledge and the scopes must remain separate. |
| immutable ordered change ledgers                               | Retain   | Required for deterministic delta delivery and auditability.                              |
| payload digests and scoped idempotency keys                    | Retain   | Safe retry boundary; conflicting reuse must fail closed.                                 |
| exact replay receipts                                          | Retain   | A retry must return the accepted result, not a reconstruction from current state.        |
| atomic ledger/projection/cursor/receipt commit                 | Retain   | Prevents acknowledged partial state.                                                     |
| explicit tombstones                                            | Retain   | All three recovered documents use tombstoned entities.                                   |
| distinct `budget_id`, `budget_version_id`, and membership `id` | Retain   | Exact catalog serializers prove they are separate identities.                            |

These are synchronization and consistency foundations. They are not a reason to
retain the current budgeting rows or service boundaries.

### Rebuild as the canonical budgeting core

The next clean schema must introduce typed authoritative records and explicit
relationships for admitted domains. The current generic JSON projection cannot
serve as that model. At minimum, the recovered registry establishes the future
domain surface for:

- accounts, payees, account-linked transfer payees, and account mappings;
- transactions, subtransactions, images, and their transfer/match/schedule
  relationships;
- scheduled transactions and scheduled subtransactions;
- master categories, categories, monthly budget rows, assignments, and money
  movements;
- targets and target-bearing category fields;
- authoritative budget settings and expected income; and
- separately stored derived account, category, monthly, and schedule
  calculations.

The exact table decomposition is a design decision, but the following rules are
now non-negotiable:

1. Protocol `be_*`/`ce_*` row names are adapter vocabulary, not canonical table
   names or domain types.
2. Unknown protocol fields are preserved in compatibility projections without
   becoming authoritative domain columns.
3. Authoritative facts and derived calculations are stored separately.
4. Relationships use typed IDs and constraints rather than JSON lookups.
5. Transaction and schedule parent/child groups commit atomically.
6. Web and iOS adapters call the same domain commands and calculations; neither
   client's payload becomes the domain model.
7. A domain is cut over completely and its transitional direct-row builder is
   removed. New wrappers over old builders are not an accepted migration.

### Current transitional or unsafe boundaries

| Current code/schema                                     | Finding                                                                                                                                | Required disposition                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic_budget_entities`                              | Generic materialized YNAB wire projection. Useful for compatibility and unknown-field round trips, but not canonical storage.          | Keep only as an explicitly named compatibility projection while typed domains are introduced; do not let new services query it as authority. |
| `semantic_budget_entity_changes` / catalog equivalent   | History stores protocol-shaped entity payloads.                                                                                        | Retain as delivery history or split canonical events from adapter projections; document which role each row has.                             |
| `semantic-core/src/stock-budget-bootstrap.ts`           | A protocol-specific `be_*` bootstrap builder lives in the canonical-core package.                                                      | Move behind the stock compatibility adapter after canonical budget bootstrap commands exist.                                                 |
| `PostgresSemanticStore.createBudget`                    | The persistence store directly creates a `ce_user_budgets` payload.                                                                    | Persist canonical membership first; let the catalog adapter project the stock row.                                                           |
| `semantic-core/src/account.ts`                          | Canonical account is restricted to checking, on-budget, open, nonfavorite, with a positive-only opening balance path.                  | Replace with a typed account aggregate that can represent the recovered account fields and evidence-admitted account types/lifecycle states. |
| `account-creation-service.ts`                           | Correctly introduces an adapter seam, but still hard-codes knowledge advancement and one narrow account product.                       | Preserve the command/service separation; broaden only from admitted account evidence and move derivation count out of the domain API.        |
| `stock-budget-operation.ts`                             | One dispatcher parses protocol, recognizes individual domain deltas, chooses derivation knowledge, builds responses, and commits them. | Reduce to envelope validation/routing. Domain handlers own commands; projection and knowledge policy have dedicated boundaries.              |
| `stock-budget-calculations.ts`                          | Partial hand-written compatibility calculations cover only a subset of the recovered dependency graph.                                 | Replace with the reconstructed shared calculation library and oracle tests before admitting calculation-dependent domains.                   |
| `budget_version_id UNIQUE`                              | Supports the current one-live-materialization path only.                                                                               | Keep provisionally; revisit before Fresh Start/version-history admission.                                                                    |
| membership `(budget_id, principal_id) UNIQUE`           | Supports the admitted owner path only.                                                                                                 | Keep provisionally; revisit before family sharing or membership history.                                                                     |
| `ON DELETE CASCADE` on budget-owned ledgers/projections | Physical budget deletion could destroy receipts and tombstone history. Stock deletion is presently a tombstone/membership operation.   | Do not expose physical deletion. Replace cascades in the clean initial schema unless a separately proven purge operation requires them.      |
| `serverKnowledgeAdvance: 1                              | 2`                                                                                                                                     | Encodes the few admitted source/derivation sequences as a universal command shape.                                                           | Replace with an explicit committed revision sequence or derivation result; do not assume all future commands advance by one or two. |

### Source-integrity repair

The interrupted `plan` to `budget` refactor exposed mismatched receipt and
result fields across semantic-core, semantic-postgres, and sync-server. Those
integration defects were repaired on 2026-08-20. All three workspaces now pass
strict TypeScript checks, and disposable PostgreSQL integration exercises the
renamed budget contracts and exact receipt replay.

## Clean-schema decision

The research database contains disposable test data, so maintaining a long
production migration chain would preserve accidental early design. The target
should be a new clean initial semantic schema assembled from:

1. retained knowledge, ledger, idempotency, receipt, tombstone, and transaction
   machinery;
2. corrected budget/catalog/family identity scopes;
3. typed canonical domain tables admitted from the recovered common semantic
   model; and
4. separate Web and iOS compatibility projections.

Migrations 0001-0006 remain useful as provenance and migration-test evidence,
but they should not automatically become the shipping schema. Build the clean
schema alongside the current implementation, migrate one complete domain at a
time, then remove the replaced transitional path. This is a canonical-core
rebuild inside the retained repository—not a restart of authentication,
deployment, bank integration, evidence, or protocol research.

Migration 0006 is the first such complete-domain cutover: the narrow admitted
unlinked Checking-account aggregate now has typed canonical storage, while its
stock rows remain a separate compatibility projection committed atomically.
