# Fork architecture records

This directory contains the governing architecture and change records for the
YNAB-compatible Actual fork. These records are versioned with source so the
fork never loses the distinction between stock Actual behavior and project
behavior.

Read these documents before changing synchronization, persistence,
authentication, plan lifecycle, or the React data boundary:

1. [`selective-fork-decision.md`](selective-fork-decision.md)
2. [`stock-actual-change-ledger.md`](stock-actual-change-ledger.md)
3. [`semantic-plan-lifecycle.md`](semantic-plan-lifecycle.md)

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
