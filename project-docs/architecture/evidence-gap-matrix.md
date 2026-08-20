# Evidence and implementation gap matrix

- Updated: 2026-08-20
- Evidence index: `analysis/evidence/BEHAVIOR_KNOWLEDGE_BASE.md`
- Deep Web capture: `web-capture/deep-client-inspection-2026-08-19`

This matrix connects admitted stock behavior, recovered Web structure, and the
next implementation boundary. It does not replace the detailed evidence
ledger. A feature marked ready is ready only for its captured shapes.

## Readiness matrix

| Feature                 | Stock behavior                                                                      | Web client structure                                                     | Server implementation                                                      | Next boundary                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Signed-in bootstrap     | Partial: signed-in bootstrap admitted; interactive login and expiry edges remain    | API/bootstrap modules recovered                                          | Actual sessions retained; principal adapter implemented                    | Connect Ember to retained session and current-user projection             |
| Plan catalog/lifecycle  | Admitted                                                                            | Routes, services, catalog sync and plan switching recovered              | Canonical plans, memberships, receipts and first stock gateway implemented | First complete Ember vertical slice                                       |
| Budget bootstrap        | Admitted for pristine bootstrap/backfill and first opened-budget delta              | Budget and sync services recovered                                       | Source/calculated projection and narrow delta ingestion implemented        | Expose framework-independent Web bootstrap API                            |
| Checking account create | Admitted for repeated unlinked creation                                             | Account routes/services and dedicated direct-import invocation recovered | Dedicated account adapter implemented                                      | Ember account-create workflow and list projection                         |
| Account rename          | Admitted                                                                            | Account editing path structurally recovered                              | Complete account/payee rename delta implemented                            | Web command plus account-list update                                      |
| Account delete          | Admitted for pristine account                                                       | Account lifecycle surface recovered                                      | Evidence-backed derivation work in progress                                | Preserve current calculation work; add command after focused tests        |
| Account close/reopen    | Admitted for captured Checking lifecycle                                            | Client surface recovered                                                 | Not complete                                                               | Implement adjustment, retained history, and reopen command atomically     |
| Payees                  | Admitted for transaction-coupled create and unused rename/delete                    | Payee service and autofill modules recovered                             | Not complete                                                               | Canonical payee commands and autofill read model                          |
| Categories              | Admitted for create/rename/move/hide/delete captured shapes                         | Category routes/services recovered                                       | Not complete                                                               | Category command and monthly-row vertical slice                           |
| Ordinary transaction    | Client save path deeply recovered; full admitted ordinary protocol row still needed | Exact TransactionEditor-to-sync path recovered                           | Not complete                                                               | Seal request/ack/replay fixture, then implement basic transaction command |
| Split transaction       | Admitted for captured create/edit/delete and independent child payees               | Shared editor and subtransaction surface recovered                       | Not complete                                                               | Atomic parent/children command and calculation projection                 |
| Ordinary transfer       | Admitted for captured create/edit/delete via TR-003/TR-004                          | Transfer editor surface recovered                                        | Not complete                                                               | Exact reciprocal command with no uncaptured generalization                |
| Credit-card payment     | Admitted for captured unlinked-card lifecycle                                       | Transfer/payment surface recovered                                       | Not complete                                                               | Payment specialization over reciprocal transfer command                   |
| Targets                 | Admitted for definition, status, edge and delete matrix                             | Budget-goal services and calculation display recovered                   | Not complete                                                               | Target definition command plus canonical status calculations              |
| Schedules               | Admitted for captured parent/occurrence lifecycle                                   | Future/scheduled editor methods and schedule modules recovered           | Not complete                                                               | Parent and occurrence commands with deterministic identities              |
| Calculations            | Pristine, account, category and target subsets admitted                             | Web server-owned calculation boundary proven                             | Partial projectors implemented                                             | Add one evidence-backed dependency slice at a time                        |
| Reconciliation          | Unknown as a complete server contract                                               | Reconcile modules are present                                            | Not started                                                                | Capture before implementation                                             |
| Bank import/matching    | Provider infrastructure exists; stock YNAB behavior not admitted                    | Import/register modules are present                                      | Actual providers retained but semantic ingestion deferred                  | Capture matching/deduplication, then adapt provider facts                 |
| Slik ownership          | Coexistence proven; ordinary Save remains TransactionEditor-owned                   | Repositories/use cases mapped                                            | No server decision required                                                | Revisit only when an active feature enters a Slik-owned path              |

## Web reconstruction facts already sufficient

- Ember is the observed Web framework.
- Webpack module factories, named Ember modules, dependencies, exports, and
  transaction reverse-dependents are recovered.
- The ordinary transaction path is `transaction-editor -> shared editor ->
entity/change-set store -> API transport -> response merge`.
- Web calculations for the captured shared-store path are server-owned.
- The 60-second server poll and 10-millisecond local-change push delay are
  recovered defaults.
- Slik coexists with the shared editor and receives merged state; it does not
  own the captured ordinary Save path.

No further broad Web dump is required. Future Web captures must answer one
named gap in the table.

## Implementation order

1. Ember shell, retained Actual session, plan picker, and plan opening.
2. Checking accounts and Starting Balance.
3. Payees, categories, and ordinary transactions.
4. Splits, transfers, and credit-card payments.
5. Budget calculations and targets.
6. Schedules and future transactions.
7. Account close/reopen and reconciliation edges.
8. Bank ingestion, matching, import/export, and migration.

## Admission rule

Recovered method names and class surfaces prove where behavior can execute;
they do not alone authorize destructive or cardinality rules. Server-owned
effects require a captured request, acknowledgement, canonical readback, and
stable replay before implementation.
