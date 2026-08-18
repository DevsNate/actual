# Product objective: full YNAB observable parity

- Status: accepted
- Date: 2026-08-18
- Applies to: server, web, and stock-client compatibility architecture

## Objective

The product goal is a self-hosted system that reproduces the stock YNAB experience with **100% observable parity** for a defined supported stock version/capture horizon.

The product has two client-facing requirements:

1. a lightly modified stock YNAB iOS application must communicate with the reconstructed server without a heavy device-side rewrite; and
2. the web application must be a literal 1:1 recreation of the stock YNAB web application, visually and functionally.

The implementation does not need to reproduce YNAB's private internal architecture. Parity is judged at observable boundaries: what the user sees, what interactions are available, what those interactions do, what state and calculations result, and what compatible clients exchange with the server.

## 1:1 web parity

The web target is not YNAB-inspired, approximately similar, feature-equivalent, or an Actual UI with YNAB-like behavior. It is the stock YNAB web application reproduced at the observable level.

For every supported captured state and behavior, parity includes where applicable:

- layout, geometry, spacing, sizing, typography, colors, surfaces, borders, shadows, radii, icons, controls, density, alignment, responsive behavior, overlays, and materially observable transitions;
- empty, loading, error, disabled, selected, focused, hover, pressed, optimistic, pending, cancellation, retry, and destructive states;
- click/tap targets, keyboard navigation and shortcuts, focus behavior, inline editing, selection and multi-selection, menus, context actions, drag/reorder behavior, confirmation flows, navigation/history, and validation timing/presentation;
- created, updated, deleted, and tombstoned entities; defaults and normalization; ordering; relationships; validation; error behavior; and downstream state changes;
- balances, budget/category state, targets, overspending, account/monthly state, roll-forward behavior, and all other derived/calculated values in the supported evidence horizon; and
- synchronization consequences visible to the web client and compatible stock iOS client.

A reproducible observable difference inside the supported evidence horizon means the behavior is not yet at 100% parity.

## One authority, two client adapters

The intended client architecture is:

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

There is exactly one canonical budgeting authority. The web implementation and YNAB compatibility gateway are adapters over the same domain commands and state. They must not become independent budgeting systems synchronized after the fact.

## iOS compatibility objective

The server must reproduce the YNAB-shaped contracts required by the stock iOS client so device-side changes can remain limited to what is necessary to redirect/authenticate the application against the reconstructed service and other unavoidable environment changes.

The goal is not to replace the stock application's domain/network model with an Actual-specific client implementation.

## Internal implementation freedom

Full observable parity does not require reproducing YNAB's private server implementation, database schema, frontend source layout, or internal service topology.

The project may intentionally use PostgreSQL, semantic command/application services, retained or extracted Actual React foundations, different internal algorithms, and an evidence-backed YNAB compatibility adapter when those choices reproduce the same observable behavior.

The constraint is external fidelity, not internal imitation.

## Evidence model

Where applicable, one observed stock behavior should support three connected parity proofs:

```text
stock YNAB observation
       |
       +--> UI/interaction evidence --------> recreated web parity
       |
       +--> semantic/calculation evidence ---> canonical domain parity
       |
       +--> protocol/sync evidence ----------> iOS compatibility parity
```

The research corpus must therefore preserve UI and interaction evidence as first-class material alongside protocol, entity, calculation, and synchronization evidence.

## Version and capture horizon

Because stock YNAB changes over time, 100% parity is measured against a defined observed stock version/capture horizon.

Research records should identify, where relevant:

- observation date;
- stock web/application version or other reproducible release marker when available;
- stock iOS version/build when applicable;
- feature/account/budget preconditions;
- viewport/device conditions for UI evidence; and
- behavior/evidence identifiers.

New upstream behavior can then be incorporated deliberately instead of silently changing what a completed parity claim means.

## Acceptance rule

For behavior inside the supported evidence horizon:

> If a reproducible user-visible, interaction, semantic, calculation, synchronization, or compatible-client difference exists between stock YNAB and the reconstructed product, that behavior is not yet at 100% parity.

The compatibility laboratory may intentionally support only a narrow admitted subset during reconstruction. That does not reduce the final product objective.