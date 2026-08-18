# Final repository promotion policy

This reference defines how work may later move from `DevsNate/actual` into a separate final product repository.

The policy exists to prevent two failure modes:

1. copying migration/compatibility baggage into the final product because it already works in the fork; and
2. rewriting proven synchronization/domain behavior from memory and losing evidence-backed invariants.

A promotion is therefore an **explicit extraction with provenance**, not a bulk repository copy.

## Core rule

> Promote responsibilities and invariants, not filenames, packages, or commits.

A commit can contain both portable and non-portable work. A package can contain both canonical contracts and stock YNAB representation. Passing tests in `DevsNate/actual` proves the fork behavior at that boundary; it does not automatically prove that the implementation is the desired final architecture.

## Promotion statuses

Use these statuses for a responsibility being evaluated for the final product:

### `NOT-EVALUATED`

No promotion decision has been made.

### `CONCEPT-READY`

The underlying invariant/domain behavior is sufficiently understood to preserve, but the current implementation is not cleanly portable.

### `EXTRACTION-READY`

The current code has a defined portable boundary, required evidence is admitted where applicable, compatibility behavior is verified, and extraction dependencies are understood.

### `PROMOTED`

The responsibility exists in the final repository with its own tests and recorded provenance.

### `SUPERSEDED`

A previously promoted design was intentionally replaced. The replacement must record why; history should not be silently rewritten.

## Promotion unit

The promotion unit is the smallest coherent responsibility that can be tested independently.

Good examples:

- exact receipt replay for an idempotent command;
- principal/device-scoped knowledge tracking;
- canonical change-set transaction boundary;
- authorized plan read service;
- plan lifecycle command orchestration.

Bad default promotion units:

- “all of `semantic-postgres`”;
- “commit 20”;
- “every file under `sync-server/src/semantic`”;
- “copy the fork and delete old Actual later.”

## Required gates

A responsibility may become `EXTRACTION-READY` only when every applicable gate below is satisfied.

### Gate 1 — Behavior/evidence authority

For behavior derived from stock YNAB:

- the relevant behavior ID(s) are admitted under the governing evidence workflow;
- unsupported variants remain explicit rather than inferred;
- exact source/derived/knowledge/replay behavior needed by the responsibility is known;
- if mobile readback is required by the governing workflow, it has been completed.

Pure infrastructure responsibilities such as a generic migration runner do not need a YNAB behavior ID, but their assumptions must still be documented.

### Gate 2 — Compatibility verification

For a responsibility that participates in YNAB compatibility:

- the implementation in `DevsNate/actual` reproduces the admitted behavior;
- focused unit tests pass;
- disposable PostgreSQL integration covers persistence/replay where applicable;
- the compatibility path fails closed for unadmitted shapes;
- stock verification status is recorded separately from evidence status.

A final implementation must not be used to retroactively justify missing evidence in the compatibility laboratory.

### Gate 3 — Host independence

The proposed canonical responsibility must be explainable without requiring inherited Actual internals.

A canonical candidate should not require imports or concepts such as:

- Actual Redux slices;
- loot-core worker message names;
- Actual async storage;
- Actual SQLite account/session database details;
- Actual CRDT messages;
- legacy Actual budget-file authority.

If it does, classify the implementation as an Actual adapter and extract only the underlying concept.

### Gate 4 — Representation independence

The proposed canonical domain/application layer must be explainable without treating stock YNAB serialization as the domain model.

Specifically, canonical code should not need to know names such as:

- `be_accounts`;
- `be_payees`;
- `be_transactions`;
- `be_monthly_budget_calculations`;
- `ce_user_budgets`;
- stock schema version numbers;
- stock request/response envelope fields.

Exceptions belong in a deliberate `compatibility/ynab` boundary.

If a current shared service constructs `be_*` entities directly, the semantic operation may be `CONCEPT-READY` while the implementation remains non-promotable until the representation is separated.

### Gate 5 — Persistence ownership

Before promoting storage code, explicitly decide whether each stored fact is:

- canonical product state;
- synchronization metadata;
- derived/cached state;
- YNAB compatibility state;
- migration-only/transitional state.

Do not promote a generic JSON entity store by default simply because it preserves unknown fields well. Unknown-field preservation is valuable for compatibility, but a final canonical model may deserve typed tables/records for stable domain facts.

### Gate 6 — Synchronization invariants

Where applicable, tests must cover:

- expected server knowledge;
- starting/ending device knowledge;
- source revision advancement;
- derivation revision advancement;
- exact idempotent replay;
- conflicting idempotency-key reuse;
- rollback/no-partial-write behavior;
- tombstones;
- unknown/malformed reference rejection.

The distinction between a source revision and a second server-derivation revision must remain explicit. A derivation revision cannot be inferred solely from whether calculated rows are nonempty.

### Gate 7 — Dependency audit

Record the responsibility's direct and conceptual dependencies.

The final direction should remain approximately:

```text
canonical domain/contracts
        ^
        |
application services
        ^
        |
persistence implementations

compatibility/ynab ---> canonical services/contracts
native API ----------> canonical services/contracts
```

Canonical layers must not depend upward on the YNAB adapter or Actual compatibility host.

### Gate 8 — Final-repository tests

Promotion is complete only after the final repository has its **own** tests.

Do not rely indefinitely on tests living in `DevsNate/actual`.

At minimum, promoted responsibilities should have:

- focused unit tests;
- persistence integration tests when applicable;
- failure/replay tests matching the preserved invariants.

YNAB protocol conformance can continue to be proven primarily in the compatibility laboratory, with selected sanitized fixtures mirrored into the final adapter tests when useful.

### Gate 9 — Provenance record

Every promotion should record:

- responsibility name;
- source `DevsNate/actual` commit(s);
- source file(s);
- relevant admitted behavior IDs;
- compatibility verification status;
- destination files/modules;
- intentional differences from the source implementation;
- tests that prove the promoted behavior.

Example:

```text
Responsibility: exact plan-command receipt replay
Source repo: DevsNate/actual
Source commits: 6e50cfc, 0ce59af
Source files: packages/semantic-postgres/src/store.ts
Behavior IDs: infrastructure; PLAN-001 exercises the path
Destination: packages/persistence-postgres/change-set-store.ts
Differences: split catalog and budget stores; removed Actual naming
Verification: ...
```

## Classification-specific rules

### CANONICAL-CANDIDATE

May be promoted after all applicable gates pass. Still requires extraction review.

### CANONICAL-CONCEPT

Never copy by default. Write the invariant first, then implement it against the final architecture.

### YNAB-COMPATIBILITY

Default destination is the compatibility laboratory. If the final product needs first-class YNAB client compatibility, implement/import it only under a dedicated compatibility adapter boundary.

### ACTUAL-ADAPTER

Default destination is `DevsNate/actual` only. Rebuild the responsibility in the final repo if needed against the final host architecture.

### TRANSITIONAL

Do not promote unless a fresh final-product requirement independently justifies the same design.

### REFERENCE-DOC

Keep as provenance. Extract final architecture decisions into new final-repository records rather than copying fork-history documents as governing product design.

## Current likely promotion order

Based only on the repository audit, not on future YNAB reconnaissance, the safest likely extraction order is:

1. synchronization vocabulary and command/change-set contracts;
2. exact idempotency receipt/replay semantics;
3. knowledge/device/change-set persistence primitives;
4. authorization-aware canonical readers;
5. lifecycle/application-service orchestration after representation cleanup;
6. account/transaction domain operations only after the foundational behavior graph is sufficiently mapped;
7. YNAB adapter pieces as a separate compatibility boundary.

The order may change when new evidence reveals dependencies.

## Explicit non-goals

Promotion must **not** become:

- a rewrite deadline;
- a requirement to delete the compatibility laboratory;
- a requirement to duplicate every behavior immediately in two repositories;
- an excuse to generalize beyond admitted behavior;
- a bulk copy of the current semantic entity representation.

## Final principle

`DevsNate/actual` should remain where behavior is **proved in the migration/compatibility environment**.

The final repository should contain only what has been deliberately **promoted as product architecture**.

That separation lets the fork remain strict, evidence-shaped, and occasionally awkward without forcing those constraints to become the permanent internal design of the final product.
