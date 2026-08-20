# Semantic account creation

This record translates the admitted `ACCOUNT-002` unlinked Checking-account
capture and `ACCOUNT-003` rename capture into canonical application commands.
It does not generalize account types, linked accounts, account close/reopen, or
arbitrary transaction writes.

## Canonical account boundary

Checking-account creation now crosses one typed domain boundary. The
stock-direct-import and retained semantic HTTP adapters parse their own wire
formats, translate them into the canonical unlinked-account intent, and project
their own responses. `account-creation-service.ts` owns orchestration only;
`account-budget-entity-adapter.ts` is the sole mapping from the canonical account,
transfer-payee, and Starting Balance group into persisted YNAB compatibility
projections. Those `be_*` projections are delivery state, not the canonical
account model.

Migration 0006 persists the admitted aggregate in typed
`semantic_accounts`, `semantic_payees`, and `semantic_transactions` tables.
`commitUnlinkedAccountCreation` writes those canonical rows together with the
compatibility projections, ordered knowledge, and exact receipt in one
PostgreSQL transaction. Exact replay returns the stored receipt without
duplicating either representation.

The stock adapter also resolves the external `budget_version_id` carried by the
deployed Web route to the canonical internal `budget_id`. Neither identity leaks
into the other's role. Atomic knowledge, receipts, and replay remain owned by
PostgreSQL.

Rename and pristine deletion are still admitted captured behaviors, but their
schema-44 handlers have not yet been moved behind this canonical account
application boundary. That is the next account subphase. Close/reopen,
additional account types, and linked accounts remain outside this slice. No
compatibility exception will bypass the boundary.

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

Canonical identities are deterministic from budget plus idempotency key. The
receipt owns exact replay. Reusing a key with another payload fails, and an
later requests use distinct command keys and identities. A browser-root
bootstrap with three controlled accounts proves one independent group per
request and admits repeated unlinked Checking creation.

Because creation changes both source rows and server-derived calculations, its
canonical command advances server knowledge by two. This follows the same
captured rule as split/category/target mutations; it is distinct from the
source-only account rename, which advances once.

## Rename command

Stock rename uses schema-44 `syncBudgetData` rather than the dedicated creation
route. One delta contains exactly one complete account row and its complete
bound transfer-payee row. Only `account_name` and the payee's exact
`Transfer : {account name}` value differ. Both identities, the account order,
balance-bearing transactions, and every unrelated field remain stable. The
acknowledgement advances device knowledge by two and server knowledge once but
does not echo either source row.

The parser therefore admits only that exact two-row shape against current
canonical state. Missing, extra, partial, tombstoned, mismatched, or concurrently
edited rows fail closed. The shared PostgreSQL command commits both names
atomically and exact replay remains receipt-owned.

## Pristine deletion command

`ACCOUNT-004` is a distinct `Delete Account` operation, not close/reopen. It is
admitted only when a Checking account contains exactly its captured Starting
Balance. The client sends complete tombstones for the account, bound transfer
payee, and Starting Balance transaction group. A dedicated parser validates all
three current rows and their system payee/category relationships before
committing them atomically.

The response advances source plus derived knowledge (`+2`), tombstones the
removed account's calculation identities, and returns only changed budget and
Immediate Income calculations. Remaining account balances continue to project
normally. Any extra transaction, split, transfer, partial row, field divergence,
or different lifecycle shape fails closed.

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

`POST /semantic/v1/budgets/:budgetId/accounts` is the retained Actual-session
semantic adapter over the shared command. The stock-shaped adapter is mounted
at `POST /api/direct_import/budgets/:budgetVersionId/accounts`; it accepts the
captured `Authorization: Token token=<session>` wrapper and API-version header,
delegates authentication to Actual's retained session authority, and returns
the exact flat HTTP 201 acknowledgement. Neither transport constructs budget
projections itself.

After the acknowledgement, an older valid stock cursor receives an
entity-knowledge-indexed read delta instead of a conflict. A cursor ahead of
the server still fails closed; an equal cursor receives the empty delta. This
keeps delivery ordering separate from account command execution.

## Verification

Focused request, canonical-domain, adapter, gateway, projection, and
calculation tests pass. A controlled deployed-Web run created
`CANONICAL CHECKING 01`, accepted the HTTP 201 response, consumed the immediate
read delta, and displayed the account and its sole `$12.34` Starting Balance
without a reload or duplicate request.
Disposable PostgreSQL integration proves repeated direct-import requests,
three canonical entities per request, independent account calculations,
additive budget calculations, exact semantic replay without duplicates, and
stock bootstrap readback. It also proves complete-row account/payee rename,
knowledge acknowledgement, renamed bootstrap readback, strict pristine delete,
terminal calculation rows, and the remaining-account Ready-to-Assign total.
