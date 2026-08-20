# Deployed stock Web runtime strategy

- Status: accepted; runtime feasibility investigation active
- Date: 2026-08-20
- Client schema: Web 44
- Mobile schema: iOS 42

## Decision

Preserve and relocate the actual deployed YNAB Web client as the primary Web
application. Adapt the smallest possible bootstrap, configuration,
authentication, catalog, budget-sync, SharedWorker, and auxiliary endpoint
boundaries so it runs against the canonical project server.

The stock Web client and minimally modified stock iOS client normalize through
separate schema-specific gateways into the same semantic commands and
PostgreSQL authority:

```text
deployed stock Web -> schema 44 -> Web compatibility --+
                                                       |
                                            semantic-core + PostgreSQL
                                                       |
stock YNAB iOS ----> schema 42 -> iOS compatibility --+
```

## Client-patch priority

1. runtime configuration and API origin;
2. authentication/session bootstrap;
3. catalog bootstrap;
4. budget bootstrap;
5. schema-44 sync transport;
6. SharedWorker transport/configuration; and
7. required auxiliary endpoints or harmless stubs.

Do not patch the transaction editor, validation, entity/change-set machinery,
routes, templates, components, CSS, keyboard interactions, or calculations
unless a concrete incompatibility cannot be solved at a boundary above.

Every stock-client patch requires provenance, before/after hashes, a bounded
reason, evidence that it is infrastructure-only, and runtime verification.

## Runtime assets

Raw vendor HTML, bundles, source maps, styles, fonts, images, manifests, and
worker scripts remain local-only and Git-ignored. Derived manifests, load
graphs, hashes, patch records, and redacted protocol fixtures may be versioned.

## First experiment

The first runnable experiment is deliberately narrow:

```text
load preserved shell
-> satisfy runtime bootstrap
-> establish retained Actual-backed session compatibility
-> show stock plan picker
-> open one stock plan
-> read/write only through canonical plan/catalog services
```

Feature implementation beyond bootstrap and plan lifecycle remains frozen until
this runtime path is proven or rejected with reproducible evidence.
