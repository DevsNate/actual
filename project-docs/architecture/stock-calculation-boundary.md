# Stock calculation boundary

## Decision

The preserved stock Web runtime remains the product Web client. The stock iOS
calculation engine remains unchanged and is used only as an independent iOS
oracle.

The compatibility server owns the schema-44 synchronization contract:

- canonical mutable entities;
- normalization and validation proven by controlled captures;
- calculated entity projections returned by stock sync;
- acknowledgements and knowledge advances;
- replay receipts and persistent state; and
- generated entities proven by stock response/readback evidence.

Web behavior is not derived from iOS behavior.

## Recovered Web execution boundary

Recovered Web store module `61063` implements
`performCalculationsLocallyOrOnServer` by calling `syncBudgetDataWithServer`.
Its full and pending calculation methods are no-op success stubs, and
`hasPendingCalculations` returns false.

Recovered modules `80211` and `1028` contain category/target and monthly-budget
formulas. Their recovered direct importers use static projection and display
helpers; none constructs either exported calculation class. Serializer module
`93724` maps dedicated account, monthly-account, monthly-budget, and
monthly-category calculation entities between schema-44 fields and Web
entities.

Therefore the formula libraries are useful explanatory and conformance
evidence. Their presence is not evidence that the deployed Web mutation path
authoritatively calculates and persists those rows locally.

## Active source boundary

`stock-calculation-entities.ts` defines the four calculated wire families from
the BUDGET-001 capture and recovered serializer. It intentionally contains no
formulas.

`stock-account-calculation-projection.ts` is the project-owned compatibility
projection for the captured checking-account and two-month account rows. It is
kept separate from category and Ready-to-Assign calculations, validates safe
integer balances and captured month identities, and does not admit debt,
tracking, closed-account, or generalized multi-month behavior.

`stock-monthly-category-calculation-projection.ts` owns only the captured cash
category states already used by the checking-account boundary: uncategorized
cash, categorized split lines, and Starting Balance Immediate Income across the
captured current/next-month rows.

`stock-target-definition.ts` and
`stock-target-calculation-projection.ts` form a separate target boundary. They
admit the TARGET-001 monthly, yearly, Saturday-weekly and every-two-month
definition sequence, its observed device/server knowledge advances, in-place
clear semantics, and the exact target/underfunded/left/completion fields retained
by the controlled capture. Bootstrap target templates with no creation date and
zero amount remain inactive; this prevents template metadata from becoming a
synthetic live target. Uncaptured cadences fail closed.

Funded/spent/overspent status, categorized refunds, credit spending, carryover,
and other monthly-category behavior remain outside that definition projector
until their mutation domains are admitted. TARGET-001 did not retain the
unfunded definition state's percentage field, so the compatibility server does
not invent it.

The recovered assignment call chain and ASSIGNMENT-001 envelope are recorded
separately in `semantic-category-assignment.md`. The admitted state is an
updated monthly-category row plus an immutable money movement, including the
captured acknowledgement and exact-request replay behavior.

`stock-monthly-budget-calculation-projection.ts` owns the captured two-row
monthly-budget projection for Starting Balance income, admitted cash outflows,
and the single captured positive assignment. It validates safe integer
arithmetic and exact current/next source identities. General movement,
overspending rollover, income variants, and future-month assignment remain
unsupported.

The current projectors admit only:

1. the exact pristine/default bootstrap state captured in BUDGET-001; and
2. the limited checking-account states covered by the focused account,
   ordinary-transaction, split, transfer, and account-lifecycle tests;
3. the captured TARGET-001 definition lifecycle and definition calculations;
   and
4. the captured ASSIGNMENT-001 positive manual assignment and exact replay.

Other combinations fail closed. Target status and credit-card payments must not
be added as narrow parser exceptions around the current limited projector.

## Admission sequence

Future calculation work proceeds in this order:

1. transaction normalization and cash/credit attribution;
2. account and monthly-account projections;
3. monthly-category projections;
4. monthly-budget and Ready-to-Assign projections;
5. target projections; and
6. credit-card payment-category projections.

Each stage is extended only from a controlled chain containing the client
request, server response, knowledge advance, resulting entities, unchanged
replay, and client readback. Uncovered combinations remain explicit failures.

## Evidence

The generated evidence outside this repository is under
`../web-domain-dependency-map/`, notably:

- `WEB_CALCULATION_PIPELINE_TRACE.md`;
- `WEB_TARGET_CALCULATION_TRACE.md`;
- `STOCK_CALCULATION_EVIDENCE_MATRIX.md`; and
- `CALCULATION_BOUNDARY_AUDIT.md`.

The controlled stock packages are under `../evidence/stock-captures/`.
