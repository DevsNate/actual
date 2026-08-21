# Canonical scheduled transaction boundary

- Updated: 2026-08-21
- Evidence: `analysis/evidence/stock-captures/schedule-001`
- Scope: captured ordinary monthly parent lifecycle and one deterministic
  scheduler occurrence

## Admitted behavior

The stock schema-44 adapter accepts only the captured schedule forms:

- create one ordinary monthly parent while applying its exact payee-category
  autofill side effect;
- edit the same parent's amount, memo, or date using a complete stock row;
- materialize one deterministic transaction whose identity is
  `<schedule-id>_<date>` while advancing the parent;
- redate the live parent without altering the materialized occurrence;
- tombstone only the parent on deletion;
- replay an identical request from the stored receipt without another write.

The stock request field `upcoming_instances` remains the captured PostgreSQL
array literal string (`{YYYY-MM-DD}`). The stock server response is a JSON date
array (`["YYYY-MM-DD"]`), which the unchanged Web deserializer iterates before
constructing its date objects. The canonical model stores one typed date and
PostgreSQL persists it as a one-element `date[]`; request and response
projections are deliberately separate.

## Canonical storage

Migration `0016_canonical_scheduled_transaction.sql` adds the typed parent table
and the explicit occurrence relationship on canonical transactions. The
writer validates account, payee, category, identity, source, amount, memo,
cleared state, and date relationships before committing the mutation and its
knowledge/receipt ledger atomically.

Migration `0017_canonical_budget_bootstrap.sql` is the source-boundary repair
needed by schedules and every later category-owning domain. It converts the
already admitted stock budget bootstrap into canonical category groups,
categories, and monthly category rows. `createBudget` performs the same typed
bootstrap in its original transaction, so a new budget cannot expose generic
stock entities without their canonical authority rows.

## Fail-closed boundary

The adapter rejects uncaptured frequencies, scheduled splits, scheduled
transfers, malformed date-array strings, partial rows, unknown relationships,
non-deterministic occurrences, and partial tombstones. No fallback row or
synthetic schedule is created.

## Verification

- Focused stock schedule/parser/calculation tests cover create, edit,
  materialize, redate, delete, malformed input, and exact projection.
- The clean PostgreSQL suite covers canonical bootstrap counts and a complete
  schedule create/replay/edit/materialize/delete lifecycle with terminal
  readback.
- Runtime migrations and strict TypeScript checks pass with 17 migrations.
- Final persistence acceptance through the deployed stock Web editor remains a
  release gate, not a substitute for the captured server contract.
