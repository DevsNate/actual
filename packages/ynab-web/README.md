# YNAB-compatible Ember client

This package is the clean Ember presentation client for the canonical semantic
domain. It intentionally does not import React, CRDT, PostgreSQL repositories,
captured YNAB bundles, or the stock-iOS wire protocol.

The first vertical slice is the authenticated plan catalog. Actual owns the
login and session authority; `SessionService` calls that retained boundary and
holds the resulting token in memory only. `SemanticApiService` calls the
framework-independent semantic Web API.

Run commands from the repository root:

```sh
yarn start:ynab-web
yarn build:ynab-web
yarn workspace @actual-app/ynab-web test
```

The development server proxies `/account` and `/semantic` to
`http://localhost:5006`. Set `YNAB_WEB_API_ORIGIN` to use another local Actual
server.
