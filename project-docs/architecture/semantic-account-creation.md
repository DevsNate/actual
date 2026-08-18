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
terminal entity group and calculations. Two later browser-root captures had
the page and `csw.js` worker attached before commit. Both repeated the same
page POST and HTTP 201 acknowledgement while the worker emitted no network
request; the final instrumented commit also emitted no worker message. There
is no observed second `syncBudgetData` upload for this operation.

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
later requests use distinct command keys and identities. A browser-root
bootstrap with three controlled accounts proves one independent group per
request and admits repeated unlinked Checking creation.

## Calculation projection

Account source rows and calculation rows remain separate modules. For every
admitted Checking account the calculation projector validates the exact
three-entity relationship and emits:

- one account calculation with cleared balance and one transaction;
- current-month cleared and rolling balance;
- next-month zero cleared balance with the prior rolling balance;
- current-month Immediate Income and Ready to Assign; and
- next-month carried Ready to Assign.

With multiple accounts, account and monthly-account calculations remain
independent. Current Immediate Income and current/next Ready to Assign are the
safe-integer sum of all captured Starting Balances. The evidence fixture is
`123450 + 234560 + 345670 = 703680`.

Malformed identities, extra transactions without a matching account,
tombstones, non-Checking types, transfer fields, or divergent system
relationships fail closed.

## Transport boundary

`POST /semantic/v1/plans/:planId/accounts` is the retained Actual-session
semantic adapter over the shared command. The stock-shaped adapter is mounted
at `POST /api/direct_import/budgets/:planId/accounts`; it accepts the captured
`Authorization: Token` scheme and API-version header, delegates authentication
to Actual's retained session authority, validates the same admitted JSON, and
returns the exact flat HTTP 201 acknowledgement. Neither transport constructs
entities itself.

## Verification

Focused request, command, gateway, projection, and calculation tests pass.
Disposable PostgreSQL integration proves repeated direct-import requests,
three canonical entities per request, independent account calculations,
additive budget calculations, exact semantic replay without duplicates, and
stock bootstrap readback.
