# Canonical ordinary transaction and payee boundary

PAYEE-001 and ORDINARY-001 admit two related schema-44 lifecycles: a new ordinary payee created
atomically with its first ordinary transaction, deletion of that transaction,
rename of the retained payee, and deletion of the payee once unused.
ORDINARY-001 adds a categorized create whose payee autofill category matches
the transaction category, an exact amount-and-memo edit, deletion, stable
replay, and terminal stock-iOS readback.

## Boundary

`stock-ordinary-transaction.ts` accepts only the complete captured Web rows and
converts them into typed transaction or payee commands. The adapter owns stock
field names, grouped `be_transaction_groups` input, and response projection.
The canonical types contain ordinary transaction and payee facts only.

PostgreSQL stores the admitted payee and transaction in typed tables. Their
canonical rows, compatibility projections, calculation response, knowledge
advancement, and exact replay receipt commit in one database transaction.

The captured create request reports `cash_amount: 0`. The stock response and
readback normalize it to the transaction amount. That normalization is an
explicit evidence-backed server effect, not a generic amount rule.

## Knowledge and replay

- payee plus transaction creation advances device knowledge by two and server
  knowledge by two;
- categorized payee plus transaction creation advances device knowledge by
  three and server knowledge by two;
- the captured amount-and-memo edit advances both device and server knowledge
  by two;
- the preserved stock Web runtime emits an amount-only edit with a device
  knowledge advance of one. The compatibility response reuses the captured
  ordinary-edit normalization and server advance of two; this narrower shape
  remains provisional until its stock-server acknowledgement is captured;
- transaction deletion advances device knowledge by one and server knowledge
  by two;
- payee rename and unused-payee deletion each advance both by one; and
- an identical retry replays the stored response without applying the command
  again.

## Fail-closed limits

- Creation requires exactly one new ordinary payee and one unsplit,
  unscheduled, non-transfer transaction using a known live account. A category
  must be live and must match the new payee's captured autofill category.
- Editing is limited to ORDINARY-001's exact amount-and-memo change and the
  preserved stock Web runtime's amount-only variant. The request-side cash
  amount must equal the prior normalized amount; the response normalizes it to
  the new amount. Amount-only support is explicitly provisional at the
  stock-server boundary.
- Transaction deletion requires the complete current transaction row plus its
  tombstone bit.
- Payee rename may change only the name.
- Payee deletion requires the complete current row and no live transaction
  reference.
- Standalone payee creation, payee merge, referenced-payee deletion, splits,
  transfers, credit-card payments, schedules, imports, matching, and general
  other transaction edits are separate domains and remain unsupported.

These limits keep PAYEE-001/ORDINARY-001 from becoming an inferred general transaction
engine. Later slices should extend the canonical aggregate and remove the
corresponding rejection only when their evidence is complete.
