# Semantic plan lifecycle

This record translates admitted `PLAN-001` behavior into the canonical domain
boundary for the fork. It defines what must be atomic before a plan mutation is
exposed through either the React API or the YNAB compatibility gateway.

## Evidence authority

The governing fixture is `analysis/evidence/stock-captures/plan-001/`, indexed
by `analysis/evidence/BEHAVIOR_KNOWLEDGE_BASE.md`. The fixture is admitted for
create, rename, catalog delivery, open/switch, delete, active-plan deletion,
and empty-picker recovery.

Transport projections may differ, but both clients must observe the same
canonical result. The semantic service must not infer additional selection,
replacement-plan, or cache-deletion behavior.

## Separate state machines

Plan handling is not one boolean or one CRUD row. The implementation keeps
these concerns separate:

1. **Catalog membership** — whether a principal may discover and open a plan.
2. **Budget materialization** — whether canonical budget metadata and bootstrap
   entities exist.
3. **Client download state** — whether a client has locally projected a plan.
4. **Client selection** — which downloaded plan a client currently presents.
5. **Catalog knowledge** — ordered membership changes for a principal/device.
6. **Budget knowledge** — ordered entity changes for a plan/device.

A live membership does not imply that a client downloaded or selected the
plan. A tombstoned membership does not authorize deleting a client's local
cache.

## Create

One semantic create command must commit all server-authoritative creation facts
or none of them:

- logical plan identity;
- budget-version identity;
- owner membership identity and permissions;
- name, date format, and currency format;
- the evidence-backed default budget bootstrap; and
- the catalog and budget knowledge needed to deliver those facts.

The command returns stable plan and budget-version identities. A retry with the
same principal, device, idempotency key, and payload digest replays the exact
stored response. Reusing the key for another payload fails without mutation.
The stock `POST /api/budgets` envelope carries no catalog device-knowledge
range, so creation locks and preserves the device's existing catalog counter;
it does not assume zero and does not invent or advance client knowledge.

The admitted PLAN-001 bootstrap is implemented as a versioned semantic
template. It creates the captured six master categories, fifteen
subcategories, three system payees, one server setting, two onboarding events,
two monthly budgets, and twenty-eight monthly category rows. Client-owned
`budget_views`, the prior-month row, and `opened_budget` remain later client
changes rather than server bootstrap facts.

## Rename

Rename is one semantic command even though compatibility transports may expose
two projections. It atomically changes the catalog membership name and the
budget metadata name while preserving all stable identities, formats,
permissions, and unrelated fields. Catalog and budget knowledge advance only
after both projections commit.

The stock Web client sends the two projections independently: one complete
`ce_user_budgets` row through catalog sync and one complete `be_budget` row
through budget sync. The gateway recognizes the latter as convergence on the
already-committed semantic rename. It advances only that device's budget
knowledge and stores a replay receipt; it does not perform a second rename.
This also covers a client coalescing multiple local edits into one final
`be_budget` row with a device-knowledge range larger than one.

## Delete

Delete tombstones the membership while retaining its identities and
permissions. The stock-compatible catalog projection uses `Unknown` for the
tombstoned display name. Deleting an active plan does not select another plan,
erase a local cache, or create a replacement.

Selection and picker recovery are client workflows:

- an active client loses write access and must pick another plan;
- an inactive picker refreshes catalog explicitly;
- a newly discovered plan remains unmaterialized and unselected; and
- an empty catalog remains empty until a plan is explicitly created.

An exact delete retry remains replayable after the membership is tombstoned.
The gateway resolves the retained principal-scoped catalog identity before
calling the lifecycle service, whose stored receipt is authoritative. A
different request cannot use a tombstoned membership to perform a new write.

## Command boundary

The domain service owns authorization, validation, identity allocation,
atomic persistence, knowledge advancement, and exact receipt replay. HTTP and
compatibility adapters only authenticate, translate admitted envelopes, call
the service, and project its result.

Plan creation and lifecycle orchestration live in reusable sync-server
application services. The semantic React API is now one adapter over those
services; the YNAB gateway will be another. Neither adapter may independently
construct bootstrap entities, allocate canonical identities, or calculate
receipt digests.

The implementation sequence is:

1. add principal/device-scoped catalog knowledge and command receipts
   (**implemented**);
2. add canonical plan metadata and an unknown-field-preserving entity store
   (**implemented with the admitted PLAN-001 bootstrap**);
3. implement atomic create, rename, and delete domain commands
   (**implemented**);
4. expose the native React command API (**create, rename, and delete endpoints
   plus the authorized plan-read boundary implemented; UI wiring pending**);
5. project the same commands through admitted YNAB-shaped endpoints
   (**create, rename, delete, catalog delivery, budget convergence, and exact
   replay implemented**); and
6. add physical cross-client acceptance fixtures without weakening the
   canonical invariants.

## Conformance map

| Behavior              | Evidence                                                        | Implemented boundary                                                  | Verification                                       |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| Create                | PLAN-001 create plus recovered deployed `createBudget` consumer | `POST /api/budgets`; atomic bootstrap, membership, knowledge, receipt | service, gateway, and PostgreSQL integration tests |
| Catalog delivery      | PLAN-001 catalog lifecycle                                      | `syncCatalogData`; complete memberships and tombstones                | gateway tests                                      |
| Open and switch       | PLAN-001 switch/bootstrap                                       | authorized `syncBudgetData`; no server-selected active plan           | gateway tests                                      |
| Rename                | PLAN-001 paired catalog/budget rows                             | one atomic lifecycle rename plus device-only budget acknowledgement   | gateway, store, and PostgreSQL integration tests   |
| Delete                | PLAN-001 delete and active-plan denial                          | `deleteBudget`; retained tombstone and exact replay                   | gateway, store, and PostgreSQL integration tests   |
| Empty picker recovery | PLAN-001 picker recovery                                        | catalog remains queryable; no replacement or auto-create              | gateway tests; physical Web acceptance pending     |

The preserved deployed Web build reads the create response through `.id`, so
the compatibility response intentionally returns that field. An older
sanitized fixture also lists `budget_id` and `budget_version_id`; this is kept
as a build/capture discrepancy rather than guessed into the current contract.

The rename capture also shows a catalog acknowledgement whose reported
knowledge does not obviously advance with the renamed budget row. The
canonical ledger still records an ordered catalog mutation so another device
can receive it. We retain this discrepancy in the evidence ledger rather than
weakening cross-device delivery or inventing an undocumented rule.

## Client boundary

The React application does not call semantic HTTP endpoints or read session
tokens. `desktop-client/src/semantic-plans/api.ts` sends typed commands through
the existing Actual worker message bus. The loot-core semantic plan app owns
authentication headers, a durable device identity, and HTTP envelope parsing.
Canonical catalog and authorized plan snapshots live in their own Redux slice;
they are never merged into legacy `budgetfiles` state.

This boundary is intentionally separate from the legacy `create-budget`,
`delete-budget`, and local SQLite lifecycle. The canonical plan snapshot must
first gain an explicit client projection/materialization contract; silently
calling both lifecycles would create two authorities and mismatched plan IDs.
The next presentation layer may render catalog membership immediately, but it
must not claim that a canonical plan is a downloaded Actual SQLite file.
