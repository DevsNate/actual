# Fork architecture records

This directory contains the governing architecture and change records for the
YNAB-compatible Actual fork. These records are versioned with source so the
fork never loses the distinction between stock Actual behavior and project
behavior.

Read these documents before changing synchronization, persistence,
authentication, plan lifecycle, the Web runtime boundary, or either stock
client compatibility boundary:

1. [`product-objective.md`](product-objective.md)
2. [`selective-fork-decision.md`](selective-fork-decision.md)
3. [`engineering-change-policy.md`](engineering-change-policy.md)
4. [`stock-web-runtime-strategy.md`](stock-web-runtime-strategy.md)
5. [`evidence-gap-matrix.md`](evidence-gap-matrix.md)
6. [`stock-actual-change-ledger.md`](stock-actual-change-ledger.md)
7. [`ember-web-migration.md`](ember-web-migration.md) — superseded experiment
8. [`semantic-budget-lifecycle.md`](semantic-budget-lifecycle.md)
9. [`semantic-docker-development.md`](semantic-docker-development.md)
10. [`semantic-account-creation.md`](semantic-account-creation.md)
11. [`semantic-postgres-contract-audit.md`](semantic-postgres-contract-audit.md)

The `reference/` subdirectory contains repository-audit and promotion-planning
records. Those documents preserve provenance and repository-boundary analysis,
but they do not replace admitted YNAB evidence or the governing decisions above.

## Required workflow

Every change that alters stock Actual behavior must update the stock change
ledger in the same commit. Use one stable ledger ID per architectural change;
subsequent refinements amend that entry instead of inventing a new description
of the same decision.

Each ledger entry records:

- the stock component and behavior;
- whether it is kept, modified, replaced, removed, or newly added;
- why the fork differs;
- the evidence authorizing the behavior;
- the replacement boundary;
- verification and migration status; and
- the commit or pull request once published.

Stock-specific behavior may not move from `proposed` to `implemented` without
an admitted evidence fixture. Infrastructure that does not encode stock
behavior may be implemented from ordinary engineering requirements.

The product objective is stricter than compatibility of a single endpoint or
screen: final parity claims are evaluated against the observable visual,
interaction, semantic, calculation, synchronization, and compatible-client
requirements in `product-objective.md`.
