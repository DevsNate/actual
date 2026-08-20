# Engineering change policy

- Status: accepted
- Date: 2026-08-20
- Applies to: canonical domains, compatibility gateways, retained Actual
  infrastructure, deployed stock clients, and migration code

## Purpose

The fork must converge toward one understandable product architecture. A fix
is not acceptable merely because it makes one observed scenario pass. Changes
must correct the layer that owns the violated invariant and must not create a
new exception path that later changes have to work around.

## Source-first rule

For every defect or missing behavior:

1. Reproduce and classify the failing observable boundary.
2. Trace the request through the compatibility adapter, application service,
   semantic contract, persistence transaction, and response projection.
3. Identify the single layer that owns the broken invariant.
4. Repair or simplify that owning layer.
5. Remove superseded branches, duplicate helpers, stale projections, and
   compatibility exceptions made unnecessary by the repair.
6. Verify the fix below and above the repaired boundary.

Do not add a gateway special case for a domain defect, a persistence special
case for a projection defect, or a client patch for a server-owned semantic
defect.

## One operation, one authority

Each supported user operation has:

- one canonical command and validation policy;
- one application service coordinating the operation;
- one atomic PostgreSQL transaction;
- one ordered knowledge transition;
- one exact replay receipt; and
- client-specific request and response adapters that do not own state.

Web schema 44, iOS schema 42, and native semantic HTTP may expose different
wire shapes, but they must converge on that same operation. A second command
implementation for another transport is a design failure.

## Evidence and abstraction

Evidence determines observable stock behavior. It does not dictate a copy of
stock's private implementation. When several captures demonstrate one stable
rule, encode the rule once in the canonical domain and test each adapter
against it.

Do not generalize beyond admitted evidence, but also do not encode fixture IDs,
capture-specific ordering accidents, or one-off response patches as domain
policy. Unknown fields are preserved at compatibility boundaries when the
observed contract requires them.

## Change acceptance

A behavioral change is complete only when it includes, as applicable:

- a root-cause statement naming the owning layer;
- a canonical invariant or command-level test;
- PostgreSQL transaction, rollback, and replay coverage;
- compatibility request/response tests for each supported client;
- calculated-state readback rather than response-only assertions;
- a stock-client runtime check for the admitted workflow;
- removal of superseded code; and
- an update to the architecture record, evidence matrix, and stock Actual
  change ledger.

Passing a narrow regression test without these surrounding checks is not
evidence that the architecture is correct.

## Refactor trigger

Stop feature work and repair the boundary when any of the following occurs:

- the same operation is implemented in more than one transport;
- a new boolean, reason string, or fallback exists only to bypass an older
  workaround;
- a compatibility adapter begins calculating canonical budget state;
- a persistence repository begins interpreting client UI behavior;
- a client patch compensates for a server-owned invariant;
- an exact replay requires reconstructing rather than reading its receipt;
- a fix requires weakening complete-row, identity, or knowledge validation;
  or
- a module cannot be tested without assembling unrelated domains.

The preferred response is a bounded refactor that reduces branches and
clarifies ownership, not another conditional.

## Big-picture review

Before admitting each domain, review its place in the full product:

```text
stock behavior evidence
        |
client protocol adapter
        |
canonical application command
        |
atomic PostgreSQL authority
        |
ordered changes and exact replay
        |
Web and iOS projections/readback
```

Domain work may proceed only when it strengthens this path and does not revive
Actual CRDT, encrypted budget files, or client-specific budgeting authorities.
