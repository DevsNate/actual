# Repository authority boundaries

This reference defines the intended authority split among a future research repository, the current `DevsNate/actual` fork, and a future final product repository.

It is a repository-organization policy, not permission to create or activate the research/capture workflow. YNAB/Codex capture work remains outside this audit until explicitly resumed.

The product objective includes both a lightly modified stock YNAB iOS client and a literal 1:1 stock YNAB web recreation. See `product-objective.md`.

## Proposed repository roles

### 1. Private research repository

Working name: `ynab-research`.

**Primary question:**

> What does stock YNAB actually do and present at every observable client boundary?

**Authority:** observed behavior, visual/interaction evidence, protocol evidence, calculation evidence, evidence packages, behavior/UI/entity/calculation/protocol atlases, dependency mapping, capture tooling, redaction/validation tooling.

**Expected contents:**

```text
README.md
WORKFLOW.md
atlas/
  BEHAVIOR_ATLAS.md
  UI_ATLAS.md
  INTERACTION_ATLAS.md
  ENTITY_ATLAS.md
  CALCULATION_ATLAS.md
  PROTOCOL_ATLAS.md
  DEPENDENCY_GRAPH.md
evidence/
  ui/
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

UI evidence should preserve the conditions needed to reproduce a stock state faithfully: stock version/capture date, viewport/device conditions, navigation context, screenshots or other permitted visual references, interaction path, loading/error/hover/focus/selected states, and linked semantic/protocol behavior IDs where applicable.

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
- cross-client/reference integration tests;
- reusable React/component experiments when they help prove a path toward exact web parity without making this fork the final product authority.

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

> Given the evidence and compatibility proof, what architecture reproduces the supported stock YNAB experience exactly while remaining maintainable as our product?

**Authority:**

- canonical product domain model;
- canonical persistence model;
- final native API;
- final web/client architecture;
- 100% observable visual and functional stock YNAB web-parity implementation for the supported version/capture horizon;
- web parity/acceptance tests linked back to research evidence;
- deployment/runtime design;
- production tests;
- dedicated YNAB compatibility adapter when the product supports the lightly modified stock iOS client directly.

**Must not inherit automatically:**

- Actual worker/Redux/session internals;
- legacy CRDT/file authority;
- migration-only composition;
- `be_*` entities as canonical product state;
- stock protocol modules in canonical packages;
- Actual visual/interaction behavior where it differs from the stock YNAB parity target.

The final implementation may reuse Actual's React/component foundations where useful, but reuse is subordinate to the 1:1 YNAB parity requirement. An inherited component or interaction that visibly or functionally differs from stock YNAB must be changed or replaced.

## Source-of-truth matrix

| Question | Authoritative repository |
|---|---|
| What was observed in stock YNAB? | research repo |
| What does the supported stock YNAB web UI look like and how does it interact? | research repo |
| What evidence supports a behavior/parity conclusion? | research repo |
| What behavior/UI evidence IDs are admitted? | research repo |
| How did this fork diverge from stock Actual? | `DevsNate/actual` |
| Does the compatibility/reference implementation reproduce admitted protocol/domain behavior? | `DevsNate/actual` tests + architecture ledger |
| How does retained Actual auth/worker/Redux integrate with semantic storage? | `DevsNate/actual` |
| What is the intended production domain architecture? | final product repo |
| Does the final web product reproduce the supported stock YNAB evidence horizon 1:1? | final product parity tests evaluated against research evidence |
| What code is deployed as the final product? | final product repo |
| What tests govern the final canonical implementation? | final product repo |

## Evidence flow

The intended flow is one-way:

```text
stock YNAB
    |
    v
research repository
observe UI + behavior + protocol + calculations
redact -> classify -> seal -> admit
    |
    | admitted evidence/invariants
    v
DevsNate/actual
reproduce protocol/domain behavior -> fail closed -> PostgreSQL proof -> stock verification
    |
    | promotion candidate + provenance
    v
final product repository
extract/rebuild canonical system
recreate stock web UI 1:1
run final parity + production tests
```

The final product must not become the source that decides what YNAB does. If final behavior or presentation and admitted evidence disagree, investigate the evidence/compatibility path rather than silently redefining the stock contract from product code.

## Artifact movement rules

### Research -> `actual`

Allowed after redaction/admission as needed:

- sanitized fixtures;
- exact behavior/UI evidence IDs/references;
- schema examples;
- calculation examples;
- protocol samples required by compatibility tests;
- selected UI references needed to validate a reusable React/component approach.

Do not copy raw authentication/session/browser-profile material.

### Research -> final product

The final web parity suite may consume sanitized/admitted UI and interaction references, behavior expectations, viewport/version metadata, and semantic/calculation expectations. The final repo should reference research evidence rather than becoming the master archive for raw captures.

### `actual` -> final product

Allowed only through the promotion policy:

- canonical concepts;
- extracted portable code;
- reusable React/component foundations that pass the YNAB parity requirement;
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

- behavior/UI evidence is not re-authored in the final repo;
- fork history is not moved into the final repo as product architecture;
- final domain decisions are not governed from the compatibility lab;
- raw captures are not mirrored into public implementation repos;
- parity tests in the final repo may reference evidence IDs, but the research corpus remains the authority for what stock YNAB displayed/did.

## Branch/review policy for current audit

The current repository-reference work lives on `repo-reference-audit`.

`main` remains the product/compatibility branch and is not changed by this audit unless the reference branch is deliberately reviewed and merged later.

The reference docs are descriptive and provisional. They do not override the existing governing architecture records. The newly clarified 100% web-parity objective should be promoted into those governing records when this reference work is deliberately adopted.

## When the final repository should become active

Creating a repository namespace is low risk, but active duplicated domain implementation should wait until the foundational domain graph is sufficiently understood.

A reasonable domain activation threshold is confidence in the core relationships among:

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

UI research does not need to wait for that threshold. Visual/interaction reconnaissance can map the stock application broadly in parallel because those observations are evidence, not duplicated production implementation. Exact final UI implementation should still be tied to admitted behavior so a screen is not declared complete while its underlying actions remain semantically different.

## Repository lifecycle

### Near term

```text
research repo      inactive until capture work is explicitly resumed
actual             active compatibility laboratory
final repo         optional namespace/architecture shell only
```

### During broad reconnaissance

```text
research repo      rapidly accumulates behavior + UI + protocol map/evidence
actual             continues admission-by-admission compatibility proof
final repo         remains mostly inactive
```

### After foundational model stabilizes

```text
actual custom work + admitted UI evidence
      |
classify by promotion policy
      |
      v
final domain/persistence + web-parity design
      |
      v
promote/rebuild selected responsibilities
```

### Long term

```text
research repo = scientific/evidence record for stock behavior and UI
actual        = compatibility/reference implementation
final repo    = maintained production product with 1:1 YNAB web parity
```

## Boundary conclusion

The three repositories are not three copies of the same application.

They represent three different authorities:

1. **observation** — research, including exact UI/interaction evidence;
2. **compatibility proof** — Actual fork;
3. **product design, exact web recreation, and production implementation** — final repository.

Keeping those authorities separate is what lets the project learn aggressively without forcing every research or migration artifact into the final architecture while still making literal stock YNAB web parity a measurable product requirement.
