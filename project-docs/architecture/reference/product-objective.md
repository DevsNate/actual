# Product objective: full YNAB observable parity

This reference records the product objective clarified during the repository audit.

## Objective

The target product is a self-hosted system that reproduces the stock YNAB experience with **100% observable parity** for the supported stock version/capture horizon.

That objective has two client-facing requirements:

1. a lightly modified stock YNAB iOS application must be able to communicate with the reconstructed server without a heavy device-side rewrite; and
2. the web application must be a literal 1:1 recreation of stock YNAB, both visually and functionally.

The implementation is not required to reproduce YNAB's private internal architecture. Parity is judged at observable boundaries: what the user sees, what actions are available, what those actions do, what state and calculations result, and what compatible clients exchange with the server.

## Web parity is not approximate

The web target is not merely:

- YNAB-inspired;
- feature-compatible;
- visually similar;
- behaviorally close;
- a redesign using YNAB concepts; or
- an Actual UI with YNAB-like behavior.

The target is the stock YNAB web application reproduced 1:1 at the observable level.

## Parity dimensions

### Visual parity

For every supported captured state, reproduce the stock web application's observable presentation, including:

- layout and geometry;
- spacing and sizing;
- typography and hierarchy;
- colors, borders, shadows, radii, and surfaces;
- icons and controls;
- table/list density and alignment;
- navigation structure;
- menus, popovers, dialogs, drawers, and overlays;
- empty, loading, error, disabled, selected, focused, hover, and pressed states;
- responsive behavior within the supported viewport/device matrix; and
- transitions/animation when they are materially observable.

A visually plausible substitute is not considered parity when a reproducible stock difference remains.

### Interaction parity

Reproduce how the stock web application behaves under user input, including:

- click/tap targets;
- keyboard navigation and shortcuts;
- focus behavior;
- inline editing;
- selection and multi-selection;
- menus and context actions;
- drag/reorder behavior where present;
- modal confirmation flows;
- navigation/history behavior;
- validation timing and presentation;
- optimistic/pending states; and
- cancellation, retry, and destructive-action behavior.

### Functional/domain parity

A web action must produce the same observable semantic result as stock YNAB for the admitted behavior, including:

- created/updated/deleted entities;
- defaults and normalization;
- relationships among plans, accounts, transactions, payees, categories, targets, schedules, transfers, splits, and later supported domains;
- tombstone/lifecycle behavior;
- sorting and ordering;
- validation and unsupported/error behavior; and
- downstream state changes.

### Calculation parity

Reproduce stock calculations and derived state for admitted scenarios, including balances, budget/category state, targets, overspending, account/monthly calculations, roll-forward behavior, and other derived values as evidence expands.

Calculated output is part of the product contract, not a cosmetic projection.

### Synchronization parity

Web and iOS must operate over one canonical authority and converge on the same semantic state.

A web mutation must result in state that the compatible stock iOS client can consume correctly. An iOS mutation accepted through the YNAB compatibility gateway must be reflected correctly in the recreated web application.

Knowledge advancement, replay/idempotency, derivation revisions, tombstones, and other admitted synchronization behavior must remain consistent with stock behavior at the relevant client boundary.

### Protocol/client parity

The server must provide the YNAB-shaped contracts needed by the lightly modified stock iOS client while using the same canonical commands/state that serve the web product.

The goal is to minimize iOS changes to what is necessary to point/authenticate the stock application at the reconstructed service, rather than replacing the app's domain/network model with an Actual-specific client implementation.

## One authority, multiple adapters

The intended architecture is:

```text
                   canonical PostgreSQL authority
                              |
                     semantic/domain commands
                       /                  \
                      /                    \
              native web API        YNAB compatibility
                    |                      gateway
                    |                        |
          1:1 recreated web UI       lightly modified
                                     stock YNAB iOS app
```

The web implementation and YNAB compatibility gateway are different adapters over one budgeting authority. They must not become independent budgeting systems that are synchronized after the fact.

## Internal implementation freedom

100% observable parity does **not** require reproducing YNAB's private server implementation, database schema, frontend source structure, or internal service topology.

The final architecture may intentionally use:

- PostgreSQL as canonical state;
- semantic command/application services;
- a React implementation built from the retained Actual foundation or later extracted components;
- an evidence-backed YNAB protocol adapter; and
- different internal algorithms when they are proven to produce the same observable results.

The constraint is external fidelity, not internal imitation.

## Evidence model for parity

A behavior is not considered fully recreated merely because one endpoint works or one screenshot looks correct.

Where applicable, parity evidence should cover three connected views of the same behavior:

```text
stock YNAB observation
       |
       +--> UI/interaction evidence ------> recreated web parity
       |
       +--> semantic/calculation evidence -> canonical domain parity
       |
       +--> protocol/sync evidence --------> iOS compatibility parity
```

This makes the research corpus useful for both the server and the 1:1 web recreation.

## Version/capture horizon

Because stock YNAB can change over time, "100%" must always be evaluated against a defined observed stock version/capture horizon rather than an unspecified moving target.

The research repository should record the stock web/iOS version, date, feature state, viewport/device conditions, and evidence identifiers used to establish each parity claim. New upstream behavior can then be added deliberately rather than silently changing the meaning of completed parity.

## Acceptance principle

For any behavior inside the supported evidence horizon:

> If a reproducible user-visible, interaction, semantic, calculation, synchronization, or compatible-client difference exists between stock YNAB and the reconstructed product, that behavior is not yet at 100% parity.

This requirement applies to the final product goal even when the current compatibility laboratory intentionally supports only a narrow evidence-backed subset during reconstruction.
