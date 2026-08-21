# Stock Web runtime workstream

This workstream makes the preserved deployed YNAB Web client relocatable
against the canonical project server. It does not reimplement the client.

## Provenance labels

- `STOCK_CAPTURE`: immutable browser/runtime observation.
- `STOCK_RUNTIME_ASSET`: raw deployed vendor asset; local-only.
- `CLIENT_PATCH`: minimal infrastructure-boundary patch with before/after hash.
- `OUR_SERVER`: project-owned compatibility or canonical server code.
- `DERIVED_EVIDENCE`: reproducible manifests, graphs, and structural reports.
- `TEST_FIXTURE`: sanitized protocol or runtime fixture admitted to tests.

## Layout

```text
web-stock-runtime/
├── README.md
├── vendor/   # Git-ignored raw runtime assets
├── work/     # Git-ignored patched/served experiment
└── derived/  # Safe manifests, load graphs, patch records, and verification
```

No stock runtime asset may be committed. The first experiment stops at shell,
session/bootstrap, plan picker, and opening one plan.

## Unpatched mirror smoke test

Serve one immutable local vendor snapshot without changing client bytes:

```sh
MIRROR_ROOT="$PWD/web-stock-runtime/vendor/<capture-id>" \
  caddy run --config web-stock-runtime/Caddyfile.mirror
```

Open `http://127.0.0.1:4173/users/budgets` in the dedicated LOCAL browser
profile. The first unresolved runtime or API dependency is evidence for the
next compatibility boundary; it is not permission to patch domain behavior.

## Project-server experiment

The sync server can serve the immutable mirror while retaining Actual password
authentication:

```sh
ACTUAL_STOCK_WEB_ENABLED=true \
ACTUAL_STOCK_WEB_ROOT="$PWD/web-stock-runtime/vendor/<capture-id>" \
ACTUAL_SEMANTIC_ENABLED=true \
ACTUAL_SEMANTIC_DATABASE_URL='postgresql://...' \
  <start the sync server>
```

The server issues an HttpOnly Actual-session cookie from `/stock-web/login`,
renders fresh session/CSRF meta values, clears the captured Castle JWT, and
replaces only the captured server origin. Vendor asset bytes remain unchanged
and Git-ignored.

The semantic development stack enables this preserved client by default. Run
`bin/semantic-stack up` and open `http://localhost:5006/stock-web/login`.
`bin/semantic-stack up-actual-ui` is the explicit diagnostic escape hatch for
serving the inherited Actual client instead; it is not the product Web path.

Run the disposable end-to-end browser gate against a stock-enabled server:

```sh
node web-stock-runtime/smoke-server-runtime.mjs
```

Run the same client against a fresh principal with no plans:

```sh
STOCK_WEB_SMOKE_EMPTY=true node web-stock-runtime/smoke-server-runtime.mjs
```

Exercise plan creation through the unmodified stock dialog and require the
new plan to open and bootstrap successfully:

```sh
STOCK_WEB_SMOKE_CREATE_PLAN=true node web-stock-runtime/smoke-server-runtime.mjs
```

Exercise unlinked Checking creation through the unmodified stock dialog and
require exact canonical account, transfer-payee, and Starting Balance readback:

```sh
STOCK_WEB_SMOKE_CREATE_ACCOUNT=true node web-stock-runtime/smoke-server-runtime.mjs
```

To run a gate against an already bootstrapped local stack instead of a
disposable server, supply its URL and test password; bootstrap is then skipped:

```sh
STOCK_WEB_SMOKE_URL=http://127.0.0.1:5006 \
STOCK_WEB_SMOKE_PASSWORD=123 \
STOCK_WEB_SMOKE_CREATE_ACCOUNT=true \
  node web-stock-runtime/smoke-server-runtime.mjs
```

The gate creates only synthetic disposable state, blocks external browser
traffic, opens the preserved picker and one canonical plan, and requires the
captured initial-user, catalog, family, budget, and current-user contracts to
complete without a first-party request, response, page, or console failure.
Empty mode requires the picker and **Create New Plan** action, forbids budget
sync, and verifies that startup does not fabricate or select a plan.
Create-plan mode starts from that same empty picker, submits the captured
`POST /api/budgets` envelope, requires the stock `{ id }` acknowledgement,
and then verifies navigation plus budget bootstrap without browser errors.
Create-account mode opens the canonical synthetic budget, submits the stock
direct-import account request, verifies the account register route, and reads
the resulting entity group back through the canonical budget boundary.

Exercise a payee-less ordinary outflow through the stock register and require
its delayed sync cycle plus canonical transaction readback:

```sh
STOCK_WEB_SMOKE_CREATE_TRANSACTION=true \
  node web-stock-runtime/smoke-server-runtime.mjs
```

Transaction mode includes account creation and waits up to 65 seconds for the
stock client's normal sync cadence. Override that window only when diagnosing
timing with `STOCK_WEB_SMOKE_SYNC_WAIT_MS`.
