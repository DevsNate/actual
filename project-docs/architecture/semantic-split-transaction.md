# Canonical split transaction boundary

SPLIT-001 and SPLIT-002 admit a narrow aggregate shared by stock Web and iOS:
one account-impacting transaction parent and two ordered category-impacting
child lines.

## Authority and projection

The canonical core stores transaction facts without stock protocol names.
PostgreSQL owns a `split_parent` row in `semantic_transactions` and ordered
rows in `semantic_split_lines`. The schema-44 adapter alone understands
`be_transaction_groups`, `be_transactions`, and `be_subtransactions`.

Account balances and transaction counts use the parent exactly once. Monthly
category activity uses the child amounts and categories. The stock Split
category is a grouping marker, not a spending destination.

## Admitted lifecycle

- SPLIT-001 create: existing parent payee, nullable child payees, two lines.
- SPLIT-002 create: three new independent payees and two lines in one atomic
  command.
- SPLIT-001 edit: only the parent payee changes, with stable child identities.
- SPLIT-001 edit: only one child category changes, with stable parent and other
  child fields.
- SPLIT-001 delete: parent and both children retain their fields and become
  tombstones together.
- Exact retries return the stored receipt without duplicating rows.

The captured create requests send zero cash amounts; canonical response rows
normalize each cash amount to its signed amount.

## Fail-closed limits

The adapter rejects unbalanced amounts, reordered or duplicate lines, unknown
accounts/categories/payees, partial groups, mixed tombstones, transfer fields,
and any edit outside the captured payee/category changes. Variable-length
splits, general field editing, transfers, credit-card payments, schedules,
imports, and matching remain separate evidence-gated domains.
