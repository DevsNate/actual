# Canonical ordinary transfer boundary

Ordinary transfers are one canonical aggregate containing two transaction
legs. Each leg has a stable identity, account, bound transfer payee, cleared
state, and signed amount. Reciprocal account and transaction identities are
explicit relationships, not inferred display names.

## Admitted evidence

TR-004 admits creation and complete-pair amount or memo edits. TR-003 admits
complete-pair deletion. The captured pair has two distinct known accounts,
opposite nonzero amounts, one date and memo, reciprocal identifiers, no
category, and account-bound payees pointing to the opposite accounts. The
server normalizes each cash amount to its signed amount.

Deletion retains both identities as tombstones while clearing payee and
reciprocal fields. Replay cannot recreate either leg.

## Boundaries

The stock adapter validates the schema-44 envelope and converts it to a
canonical command. PostgreSQL commits both legs and the delivery receipt in one
transaction. Calculations apply each leg to its account but exclude the
zero-sum on-budget pair from category and uncategorized spending.

One-sided, partial, unbalanced, categorized, mismatched-date, mismatched-memo,
unknown-account, wrong-payee, malformed, scheduled, and split mutations fail
closed. The server does not invent missing reciprocal identities.

Credit-card payments remain a separate specialization.

## Local stock-Web payment acceptance

The unchanged deployed stock Web runtime was exercised against the local
schema-44 boundary with a disposable Checking account and CreditCard account.
It created a payment as the captured reciprocal pair plus the credit account's
`last_payment_payee_id`, edited only the amount while retaining the prior
`cash_amount` values in the request, and deleted both legs as terminal
tombstones. Each admitted mutation returned HTTP 200. The stock register and
sidebar balances updated immediately, and PostgreSQL retained both transaction
identities as tombstones with cleared payee and reciprocal relationships after
deletion.

One exploratory request changed amount and memo together. The preserved stock
client generated that request, but CCP-001 does not contain the corresponding
stock-server acknowledgement and readback, so the local boundary correctly
left that combined mutation unsupported. No broader edit rule was inferred
from the client request alone.
