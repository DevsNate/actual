# Repository authority boundaries

This reference defines the intended authority split among a future research repository, the current `DevsNate/actual` fork, and a future final product repository.

It is a repository-organization policy, not permission to create or activate the research/capture workflow. YNAB/Codex capture work remains outside this audit until explicitly resumed.

## Proposed repository roles

### 1. Private research repository

Working name: `ynab-research`.

**Primary question:**

> What does stock YNAB actually do?

**Authority:** observed behavior, evidence packages, behavior/entity/calculation/protocol atlases, dependency mapping, capture tooling, redaction/validation tooling.

**Expected contents:**

```text
README.md
WORKFLOW.md
atlas/
  BEHAVIOR_ATLAS.md
  ENTITY_ATLAS.md
  CALCULATION_ATLAS.md
  PROTOCOL_ATLAS.md
  DEPENDENCY_GRAPH.md
evidence/
  plans/
  accounts/
  transactions/
  categories/
  payees/
  transfers/
  splits/
  targets/
  schedules/
  ...
tools/
  capture/
  redaction/
  validation/
```

**Privacy default:** private. Raw browser/network/device evidence may contain authentication material, identifiers or other data that must be redacted before any artifact is exported elsewhere.

**Must not become:** the production implementation repository.

### 2. `DevsNate/actual` compatibility laboratory

**Primary question:**

> Can the admitted behavior be reproduced inside the retained Actual environment, using one semantic/PostgreSQL authority and stock-compatible adapters?

**Authority:**

- fork-vs-stock architectural delta;
- compatibility implementation;
- retained Actual integration;
- stock YNAB protocol/projector/parser implementation;
- PostgreSQL migration/compatibility proof;
- cross-client/reference integration tests.

**Long-term role:** compatibility/reference implementation and migration laboratory.

The repository may intentionally contain:

- inherited Actual architecture;
- transitional coexistence;
- strict stock-specific modules;
- migration adapters that would be inappropriate in a clean product repo;
- compatibility fixtures/tests whose job is conformance rather than product elegance.

That is not a failure of cleanup; it is part of the repository's role.

### 3. Final product repository

Working name intentionally unspecified.

**Primary question:**

> Given the evidence and compatibility proof, what architecture do we actually want to maintain as the product?

**Authority:**

- canonical product domain model;
- canonical persistence model;
- final native API;
- final web/client architecture;
- deployment/runtime design;
- production tests;
- optional dedicated YNAB compatibility adapter if the product supports stock clients directly.

**Must not inherit automatically:**

- Actual worker/Redux/session internals;
- legacy CRDT/file authority;
- migration-only composition;
- `be_*` entities as canonical product state;
- stock protocol modules in canonical packages.

## Source-of-truth matrix

| Question | Authoritative repository |
|---|---|
| What was observed in stock YNAB? | research repo |
| What evidence supports a behavior conclusion? | research repo |
| What behavior IDs are admitted? | research repo |
| How did this fork diverge from stock Actual? | `DevsNate/actual` |
| Does the compatibility/reference implementation reproduce admitted behavior? | `DevsNate/actual` tests + architecture ledger |
| How does retained Actual auth/worker/Redux integrate with semantic storage? | `DevsNate/actual` |
| What is the intended production domain architecture? | final product repo |
| What code is deployed as the final product? | final product repo |
| What tests govern the final canonical implementation? | final product repo |

## Evidence flow

The intended flow is one-way:

```text
stock YNAB
    |
    v
research repository
observe -> redact -> classify -> seal -> admit
    |
    | admitted behavior/invariants
    v
DevsNate/actual
reproduce -> fail closed -> PostgreSQL proof -> stock verification
    |
    | promotion candidate + provenance
    v
final product repository
extract/rebuild -> final tests -> production architecture
```

The final product must not become the source that decides what YNAB does. If final behavior and admitted evidence disagree, investigate the evidence/compatibility path rather than silently redefining the stock contract from product code.

## Artifact movement rules

### Research -> `actual`

Allowed after redaction/admission as needed:

- sanitized fixtures;
- exact behavior IDs/references;
- schema examples;
- calculation examples;
- protocol samples required by compatibility tests.

Do not copy raw authentication/session/browser-profile material.

### `actual` -> final product

Allowed only through the promotion policy:

- canonical concepts;
- extracted portable code;
- selected sanitized compatibility fixtures;
- provenance records;
- tests rewritten against final boundaries.

Do not bulk-copy the fork.

### Final product -> `actual`

Avoid creating a reverse dependency where the compatibility laboratory imports production internals directly merely to keep them synchronized.

If both repositories later need a genuinely stable shared library, establish it only after the final architecture stabilizes and the dependency ownership is explicit. Until then, deliberate extraction/porting is safer than cross-repository package coupling.

## No duplicated authority

Documentation may reference another repository, but there should be only one master record for each subject.

Examples:

- behavior evidence is not re-authored in the final repo;
- fork history is not moved into the final repo as product architecture;
- final domain decisions are not governed from the compatibility lab;
- raw captures are not mirrored into public implementation repos.

## Branch/review policy for current audit

The current repository-reference work lives on `repo-reference-audit`.

`main` remains the product/compatibility branch and is not changed by this audit unless the reference branch is deliberately reviewed and merged later.

The reference docs are descriptive and provisional. They do not override the existing governing architecture records.

## When the final repository should become active

Creating a repository namespace is low risk, but active duplicated implementation should wait until the foundational domain graph is sufficiently understood.

A reasonable activation threshold is confidence in the core relationships among:

```text
PLAN
  |
ACCOUNT
  |
TRANSACTION
  +-- PAYEE
  +-- CATEGORY
  +-- TRANSFER
  +-- SPLIT
```

plus enough calculation propagation knowledge to avoid choosing a final internal model that immediately conflicts with newly discovered transaction/category/transfer/split behavior.

Targets, schedules, cards and later features do not all need to be finished first, but reconnaissance should reveal whether they force fundamental changes to the core model.

## Repository lifecycle

### Near term

```text
research repo      inactive until capture work is explicitly resumed
actual             active compatibility laboratory
final repo         optional namespace/architecture shell only
```

### During broad reconnaissance

```text
research repo      rapidly accumulates behavior map/evidence
actual             continues admission-by-admission compatibility proof
final repo         remains mostly inactive
```

### After foundational model stabilizes

```text
actual custom work
      |
classify by promotion policy
      |
      v
final domain/persistence design
      |
      v
promote/rebuild selected responsibilities
```

### Long term

```text
research repo = scientific/evidence record
actual        = compatibility/reference implementation
final repo    = maintained production product
```

## Boundary conclusion

The three repositories are not three copies of the same application.

They represent three different authorities:

1. **observation** — research;
2. **compatibility proof** — Actual fork;
3. **product design and production implementation** — final repository.

Keeping those authorities separate is what lets the project learn aggressively without forcing every research or migration artifact into the final architecture.
