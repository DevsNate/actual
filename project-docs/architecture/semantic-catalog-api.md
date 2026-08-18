# Semantic catalog API

The semantic HTTP plan slice provides an authenticated catalog read and atomic
plan creation. It proves that retained Actual authentication can safely scope
canonical PostgreSQL data before any stock file/CRDT authority is removed.

## Configuration

The route is disabled by default. Both variables are required to activate it:

```text
ACTUAL_SEMANTIC_ENABLED=true
ACTUAL_SEMANTIC_DATABASE_URL=postgresql://...
```

An enabled server without a database URL fails during startup. Migrations run
before the route is mounted, and migration failure also prevents startup.

## Contract

```http
GET /semantic/v1/catalog
X-Actual-Token: <retained Actual session token>
```

The server validates the token and its Unix-seconds expiry against Actual's
enabled user record, converts it to a semantic principal, and queries only that
principal's memberships. The response carries catalog server knowledge,
opaque plan and budget-version identities, permissions, and tombstone state.

No caller may select a different principal. Authentication failures return
`401`; storage failures return a generic `500` without database details or a
partial catalog.

```http
POST /semantic/v1/plans
X-Actual-Token: <retained Actual session token>
X-Semantic-Device-Id: <stable caller device identity>
Idempotency-Key: <stable request identity>
Content-Type: application/json

{
  "name": "Plan Create Trace",
  "currency_format": { "iso_code": "USD", "...": "..." },
  "date_format": { "format": "MM/DD/YYYY" }
}
```

Creation stores the authenticated owner's membership and the evidence-backed
PLAN-001 bootstrap atomically. An identical retry returns the original plan
and budget-version identities; conflicting reuse returns `409`.

## Deliberate boundary

This slice does not rename, delete, or select plans. It does not change `/sync`,
the stock file catalog, encrypted budget files, or CRDT behavior. The routes
are an internal web semantic API, not yet a claim about stock YNAB endpoints.

The atomic command boundary and the distinction between membership,
materialization, and selection are defined in
[`semantic-plan-lifecycle.md`](semantic-plan-lifecycle.md).
