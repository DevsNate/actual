# Semantic account creation

This record translates the admitted `ACCOUNT-002` unlinked Checking-account
capture into one canonical application command. It does not generalize account
types, linked accounts, account close/reopen, or arbitrary transaction writes.

## Evidence boundary

The governing fixture is
`analysis/evidence/stock-captures/account-002/`, indexed by
`analysis/evidence/BEHAVIOR_KNOWLEDGE_BASE.md`.

The stock web invocation uses a dedicated account endpoint. Its request and
acknowledgement are admitted, and a clean stock budget bootstrap proves the
terminal entity group and calculations. The worker's intermediate
`syncBudgetData` envelope remains a recapture gate. It must be captured through
browser-level CDP with both the page and `csw.js` worker attached; it must not
be reconstructed from the terminal state.

## Atomic command

The semantic command accepts only the captured first unlinked Checking account
shape: name, nonnegative integer milliunit balance, and ISO starting-balance
date. It requires exactly one live Starting Balance system payee and exactly
one live Immediate Income system category. It creates in one change set:

1. one live, open, on-budget Checking account;
2. one enabled account-bound transfer payee with the captured defaults; and
3. one cleared, accepted Starting Balance transaction in Immediate Income.

Canonical identities are deterministic from plan plus idempotency key. The
receipt owns exact replay. Reusing a key with another payload fails, and an
existing unrelated live account is unsupported until a multi-account fixture
is admitted.

## Calculation projection

Account source rows and calculation rows remain separate modules. The admitted
calculation projector validates the exact three-entity relationship and emits:

- one account calculation with cleared balance and one transaction;
- current-month cleared and rolling balance;
- next-month zero cleared balance with the prior rolling balance;
- current-month Immediate Income and Ready to Assign; and
- next-month carried Ready to Assign.

Malformed identities, extra accounts or transactions, tombstones, non-Checking
types, transfer fields, or divergent system relationships fail closed.

## Transport boundary

`POST /semantic/v1/plans/:planId/accounts` is the retained Actual-session
adapter over the shared command. It validates the captured request surface and
does not construct entities itself. A YNAB-compatible direct-import adapter is
deferred until its stock authentication and worker coordination envelope are
captured under browser-level CDP.

## Verification

Focused request, command, projection, and calculation tests pass. Disposable
PostgreSQL integration proves one knowledge advance, three canonical entities,
one receipt, exact replay without duplicates, and stock bootstrap readback.
