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

Until canonical bootstrap entities and catalog-command receipts exist, plan
creation remains unavailable through the HTTP API. `PostgresSemanticStore`'s
current low-level `createPlan` helper is foundation/seeding infrastructure, not
an admitted product command.

## Rename

Rename is one semantic command even though compatibility transports may expose
two projections. It atomically changes the catalog membership name and the
budget metadata name while preserving all stable identities, formats,
permissions, and unrelated fields. Catalog and budget knowledge advance only
after both projections commit.

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

## Command boundary

The domain service owns authorization, validation, identity allocation,
atomic persistence, knowledge advancement, and exact receipt replay. HTTP and
compatibility adapters only authenticate, translate admitted envelopes, call
the service, and project its result.

The implementation sequence is:

1. add principal/device-scoped catalog knowledge and command receipts
   (**schema implemented; atomic command writer pending**);
2. add canonical plan metadata and evidence-backed bootstrap entities;
3. implement atomic create, rename, and delete domain commands;
4. expose the native React command API;
5. project the same commands through admitted YNAB-shaped endpoints; and
6. add physical cross-client acceptance fixtures without weakening the
   canonical invariants.
