# YNAB-compatible Ember client

This package is the clean Ember presentation client for the canonical semantic
domain. It intentionally does not import React, CRDT, PostgreSQL repositories,
captured YNAB bundles, or the stock-iOS wire protocol.

The first vertical slice is the authenticated plan catalog. Actual owns the
session; `SessionService` holds an adopted token in memory only, and
`SemanticApiService` calls the framework-independent semantic Web API.

Run commands from the repository root:

```sh
yarn start:ynab-web
yarn build:ynab-web
yarn workspace @actual-app/ynab-web test
```
