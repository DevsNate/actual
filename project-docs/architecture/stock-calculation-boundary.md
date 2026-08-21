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
captured current/next-month rows. Target status, categorized refunds, credit
spending, carryover, and other monthly-category behavior remain outside this
projector until their own admission phases.

`stock-monthly-budget-calculation-projection.ts` owns the captured two-row
monthly-budget projection for Starting Balance income plus admitted cash
outflows. It validates safe integer arithmetic and exact current/next source
identities. Assignments, rollover, income variants, overspending rollover, and
general future-month propagation remain unsupported.

The current projectors admit only:

1. the exact pristine/default bootstrap state captured in BUDGET-001; and
2. the limited checking-account states covered by the focused account,
   ordinary-transaction, split, transfer, and account-lifecycle tests.

Other combinations fail closed. Targets and credit-card payments must not be
added as narrow parser exceptions around the current limited projector.

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
