# Stock catalog gateway

## Evidence boundary

A sanitized Chrome DevTools Protocol capture was taken from the signed-in stock
web client on 2026-08-17. The capture recorded request paths, methods, header
names, operation names, and JSON field shapes only. It did not persist header
values, cookies, tokens, response values, or browser-profile data.

The live client confirmed this request boundary:

```text
POST /api/v1/catalog
Content-Type: application/x-www-form-urlencoded

operation_name=syncCatalogData
request_data=<JSON string>
```

The catalog request JSON contains:

- `user_id`
- `schema_version`
- `schema_version_of_knowledge`
- `starting_device_knowledge`
- `ending_device_knowledge`
- `device_knowledge_of_server`
- `changed_entities`

The authenticated request context includes these application header names:

- `x-session-token`
- `x-ynab-api-version`
- `x-ynab-client-request-id`
- `x-ynab-device-id`
- `x-ynab-device-app-version`
- `x-ynab-device-os`
- `x-requested-with`

The web client also sent a Castle request token. That fraud-prevention service
is not part of the budgeting protocol and is not reproduced by the fork.

The observed successful catalog response contains `error`,
`schema_version_of_response`, `server_knowledge_of_device`,
`current_server_knowledge`, and `changed_entities`. A complete
`ce_user_budgets` record contains:

- `id`
- `budget_id`
- `budget_version_id`
- `user_id`
- `budget_name`
- `permissions`
- `source`
- `is_tombstone`
- `last_modified_at`

The same reload independently confirmed the request/response field shapes for
`getInitialUserData`, `syncFamilyData`, and `syncBudgetData`. A later isolated
fresh-plan capture admitted the exact budget bootstrap/backfill table surface,
zero/null calculated defaults, and deterministic calculation identities.

## Implemented slice

`stock-catalog-gateway.ts` implements the read-only `syncCatalogData` plan
membership projection at `/api/v1/catalog`:

- retained Actual sessions authenticate `x-session-token`;
- the authenticated principal must match `request_data.user_id`;
- API version `2026-01-01`, catalog schema 16, device ID, and client request ID
  are validated;
- canonical PostgreSQL memberships are projected into complete
  `ce_user_budgets` records, including tombstones;
- a client already at current server knowledge receives an empty membership
  delta;
- the client request ID is echoed in the response; and
- unknown operations, catalog writes, malformed knowledge ranges, and
  knowledge from the future fail closed.

The same endpoint now dispatches `syncBudgetData` without duplicating
authentication or request-context validation. Catalog and budget operations,
source projection, and calculated projection remain separate modules. The
budget slice:

- authorizes the opaque budget-version identity through the canonical
  principal-scoped plan reader;
- accepts only schema 44 bootstrap and backfill requests from knowledge zero;
- returns all source tables from the canonical 58-entity snapshot;
- returns the exact BUDGET-001 pristine-plan calculated defaults and month
  boundaries;
- atomically ingests only the captured prior-month plus `opened_budget`
  onboarding delta through the canonical knowledge and receipt ledger;
- replays the exact stored response without duplicating entities and
  acknowledges an empty current delta without another write; and
- rejects every other write, non-pristine formula, malformed knowledge, and
  unauthorized budget version.

For an older catalog knowledge value, this first implementation sends a
coalesced complete snapshot of the fork-owned membership records rather than
reconstructing every intermediate wire delta. Complete entity replacement is
idempotent and preserves stable identities. Incremental catalog writes and
their exact stock error envelopes remain a separate admitted slice.

## Not implemented here

- initial user bootstrap and session issuance;
- family projection;
- budget delta projection or write ingestion beyond the exact admitted
  `opened_budget` onboarding delta;
- nonzero account, transaction, transfer, target, and schedule calculations;
- catalog rename/delete ingestion;
- stock error-envelope compatibility; or
- Castle, analytics, experiments, telemetry, billing, or help services.

These exclusions prevent a narrow evidence-backed gateway from turning into a
second monolithic server implementation.
