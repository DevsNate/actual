# Evidence and implementation gap matrix

- Updated: 2026-08-20
- Evidence index: `analysis/evidence/BEHAVIOR_KNOWLEDGE_BASE.md`
- Deep Web capture: `web-capture/deep-client-inspection-2026-08-19`
- Primary Web client: preserved deployed stock YNAB Web runtime
- Mobile client: minimally patched stock YNAB iOS

This matrix connects admitted behavior to the two stock-client wire boundaries
and the shared canonical server. A recovered method or module proves an
implementation surface, not an uncaptured server rule.

## Readiness matrix

| Feature                 | Web client path                                            | Server behavior                                                                      | iOS path                                             | Canonical rule                                                    | Web runtime                                                                                         | iOS runtime                                        | Admitted?                                                  |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Signed-in bootstrap     | Stock API/bootstrap and session modules recovered          | Actual sessions retained; principal adapter implemented                              | Stock startup traced                                 | One principal authority                                           | Structure captured; relocatability unverified                                                       | Signed-in startup captured                         | Partial                                                    |
| Plan catalog/lifecycle  | Stock catalog sync, picker, switching and routes recovered | Canonical create/rename/delete, memberships, receipts and stock gateways implemented | Stock picker/open lifecycle captured                 | Atomic plan/membership lifecycle and ordered knowledge            | Local stock create, rename and route switching verified; delete verified through gateway/PostgreSQL | Runtime verified for PLAN-001                      | Yes                                                        |
| Budget bootstrap        | Stock budget/sync services recovered                       | Source/calculated projection and narrow delta ingestion implemented                  | Stock budget open captured                           | One plan snapshot and ordered knowledge                           | Schema-44 bootstrap captured; relocation unverified                                                 | Schema-42 bootstrap captured                       | Partial                                                    |
| Checking account create | Stock account route and direct-import path recovered       | Canonical account boundary plus independent stock/native adapters implemented        | Stock create/readback captured                       | Atomic account, transfer payee, Starting Balance and calculations | Local deployed Web HTTP 201, read delta, account list and register readback verified                | Runtime verified for captured shape                | Yes                                                        |
| Account rename          | Stock account edit path recovered                          | Canonical account/payee rename implemented                                           | Stock rename readback captured                       | One source revision                                               | Focused parser and disposable PostgreSQL lifecycle verified                                         | Runtime verified                                   | Yes                                                        |
| Account delete          | Stock lifecycle surface recovered                          | Canonical pristine Checking deletion implemented                                     | Stock terminal readback captured                     | Exact captured three-row tombstone plus calculations              | Focused parser and disposable PostgreSQL lifecycle verified                                         | Runtime verified                                   | Yes, pristine only                                         |
| Account close/reopen    | Stock lifecycle surface recovered                          | Canonical captured Checking close/reopen implemented                                 | Checking lifecycle captured                          | Atomic with retained history/typed manual adjustment              | Focused parser and disposable PostgreSQL lifecycle verified                                         | Captured shape verified                            | Yes for captured Checking shape                            |
| Payees                  | Stock payee/autofill modules recovered                     | Ordinary creation intentionally grouped with transaction slice                       | Captured readback exists                             | Payee definition within canonical transaction aggregate           | PAYEE-001 proves transaction-coupled creation; standalone creation not invented                     | Captured shapes verified                           | Rename/delete shapes known; create queued with transaction |
| Categories              | Stock category routes/services recovered                   | Canonical create/rename/move/hide/unhide/unused-delete implemented                   | Captured readback exists                             | Typed category definition plus separate monthly budgeting rows    | Focused schema-44 adapter, cursor, projection, replay and PostgreSQL tests                          | Captured shapes verified                           | Yes for untargeted unused CATEGORY-001 lifecycle           |
| Ordinary transaction    | Exact stock TransactionEditor save path recovered          | Not complete                                                                         | Same editor lineage proven                           | Atomic transaction command, calculations and replay               | Save/protocol captured; relocated runtime unverified                                                | Structural lineage proven; full fixture incomplete | Partial                                                    |
| Split transaction       | Stock editor/subtransaction surface recovered              | Not complete                                                                         | Captured create/edit/delete readback                 | Atomic parent/children command                                    | Not runtime-verified locally                                                                        | Runtime fixtures admitted                          | Yes for captured shapes; implementation frozen             |
| Ordinary transfer       | Stock transfer editor surface recovered                    | Not complete                                                                         | Captured reciprocal lifecycle                        | Evidence-bounded reciprocal command                               | Not runtime-verified locally                                                                        | Runtime fixtures admitted                          | Yes for captured shapes; implementation frozen             |
| Credit-card payment     | Stock payment/transfer surface recovered                   | Not complete                                                                         | Captured unlinked-card lifecycle                     | Payment specialization over canonical transfer                    | Not runtime-verified locally                                                                        | Runtime fixtures admitted                          | Yes for captured shapes; implementation frozen             |
| Targets                 | Stock budget-goal services/display recovered               | Not complete                                                                         | Target definitions/status captured                   | Server-owned target definition and calculations                   | Not runtime-verified locally                                                                        | Runtime fixtures admitted                          | Yes for captured shapes; implementation frozen             |
| Schedules               | Stock schedule/future editor paths recovered               | Not complete                                                                         | Parent/occurrence lifecycle captured                 | Separate deterministic parent/occurrence commands                 | Not runtime-verified locally                                                                        | Runtime fixtures admitted                          | Yes for captured shapes; implementation frozen             |
| Calculations            | Stock Web server-owned calculation boundary proven         | Partial projectors implemented                                                       | Mobile local capability plus reconciliation observed | Server is canonical                                               | Captured transaction calculation response                                                           | Subsets captured                                   | Partial                                                    |
| Reconciliation          | Modules recovered                                          | Not started                                                                          | Surface observed                                     | Unknown until captured                                            | No                                                                                                  | No complete runtime fixture                        | No                                                         |
| Bank import/matching    | Stock import/register modules present                      | Actual providers retained; semantic ingestion deferred                               | Native provider surface exists                       | Provider facts enter canonical matching/dedupe commands           | No                                                                                                  | No                                                 | No                                                         |

## Runtime facts already established

- The deployed Web client is Ember-based and packaged through Webpack.
- Eight first-party JavaScript assets, 1,207 module factories, 232 named Ember
  modules, and the live `csw.js` SharedWorker were preserved during the deep
  inspection.
- The ordinary save path is `transaction-editor -> shared editor ->
entity/change-set store -> schema-44 sync -> response merge`.
- Web calculations for the captured path are server-owned.
- The recovered defaults are a 60-second server poll and 10-millisecond local
  change push delay.
- Current captures are sufficient for structural analysis but not yet a
  complete independently runnable asset set.

## Active implementation order

1. Inventory and preserve the complete deployed runtime.
2. Prove shell/bootstrap relocation with minimal boundary patches.
3. Authenticate, show the stock plan picker, and open one plan.
4. Connect schema-44 catalog/budget bootstrap to existing canonical services.
5. Admit the captured untargeted category lifecycle into the canonical core.
6. Admit ordinary transaction plus its transaction-coupled ordinary payee.
7. Continue feature slices against both stock Web and stock iOS clients.

## Admission rule

Recovered client internals may guide where compatibility is attached, but
server-owned effects require a captured request, acknowledgment, canonical
readback, and stable replay. Client patches require before/after hashes and a
bounded infrastructure-only justification.
