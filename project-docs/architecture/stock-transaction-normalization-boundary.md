# Stock transaction normalization boundary

This boundary is project-owned compatibility code. It is not recovered YNAB
server source and it is not a universal transaction formula.

## Admitted evidence

The stock response captures currently prove these exact output rules:

- ordinary checking transactions return signed `amount` as `cash_amount` and
  zero credit components;
- checking split parents and children return signed `amount` as `cash_amount`
  and zero credit components;
- both legs of captured reciprocal transfers, including the captured
  checking-to-credit payment, return signed `amount` as `cash_amount` and zero
  credit components;
- stale request-side cash and credit components are replaced by the captured
  server output for those mutations.

The implementation lives in
`packages/sync-server/src/semantic/stock-transaction-normalization.ts`. The
ordinary, split, and transfer protocol parsers call distinct exported functions
so later evidence cannot silently turn one captured case into a general rule.

## Explicitly not generalized

- categorized cash inflows;
- categorized credit-card purchases;
- debt and tracking-account transactions;
- imports and matches;
- scheduled conversion;
- uncaptured account types or refund/payment combinations.

Those shapes continue to fail closed at the active mutation parsers. They may
be admitted only after their client request, server response, knowledge advance,
replay, and resulting entity state are represented by controlled evidence and
tests.

The payee-less ordinary transaction currently has a captured stock-client
outgoing request but not a dedicated full stock-server lifecycle package. Its
existing compatibility path remains provisional; this change neither widens nor
promotes that evidence status.
