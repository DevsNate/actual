# Custom commit inventory

This is the chronological audit of the 25 commits between stock Actual v26.8.1 commit `063df03763ca772b51f6264752b88ddec22cfb8a` and the fork `main` head present when the audit began.

Classification is provisional until the complete file/dependency audit is finished. `Reviewed` means the commit diff itself has been inspected during this audit; it does not mean the code is approved for promotion.

| # | Commit | Message | Audit state | Provisional responsibility | Notes |
|---:|---|---|---|---|---|
| 1 | `7c60694` | Establish semantic fork foundation | Reviewed | MIXED: CANONICAL-CANDIDATE + ACTUAL-ADAPTER | Introduces `semantic-core` auth/catalog contracts, the Actual session-to-semantic principal adapter, and governing fork architecture/change-ledger records. The semantic contracts are framework-independent; the session adapter is explicitly Actual-specific. |
| 2 | `6e50cfc` | Add semantic PostgreSQL foundation | Reviewed | CANONICAL-CANDIDATE | Introduces PostgreSQL plans/memberships, per-plan/device knowledge, ordered change sets, entity changes, tombstones, exact idempotency receipts, transactional migration machinery, and tests. Its own README deliberately excludes account/transaction/split/transfer/schedule/target/card policy and Express/React/YNAB gateway concerns. |
| 3 | `efecd769` | Mount semantic catalog API | Reviewed | ACTUAL-ADAPTER + TRANSITIONAL | Adds feature-gated semantic configuration and `/semantic/v1` mount to Actual's sync server, bundles migrations for the server build, adds the semantic catalog HTTP adapter and PostgreSQL runtime composition. This is the first explicit bridge from the portable semantic packages into inherited Actual server infrastructure. |
| 4 | `b5869c43` | Define semantic plan lifecycle | Reviewed | CANONICAL-CONCEPT / architecture record | Documentation-only semantic lifecycle boundary derived from admitted `PLAN-001`; separates catalog membership, budget materialization, client download state, client selection, catalog knowledge, and budget knowledge. Explicitly requires adapters to translate/project while domain service owns atomic semantics. |
| 5 | `3f41bc76` | Add catalog command ledger schema | Reviewed | CANONICAL-CANDIDATE | Adds a separate principal/device catalog command ledger, ordered catalog change sets/entity changes, and exact command receipts. Commit deliberately leaves it schema-only until atomic lifecycle/bootstrap support exists. |
| 6 | `4f7b3a1f` | Add canonical plan entity storage | Reviewed | CANONICAL-CANDIDATE | Adds date/currency metadata and schema-versioned, tombstone-capable, unknown-field-preserving canonical plan entity snapshots. Commit explicitly avoids inferring entity policy or bootstrap contents. |
| 7 | `45fd584` | Add semantic Docker development stack | Reviewed | TRANSITIONAL / DEV-TOOLING | Adds a fork-specific Compose stack and helper CLI around the retained Actual server plus PostgreSQL. Useful for current verification but tied to the compatibility-lab host/build and not automatically a final-product runtime design. |
| 8 | `0ce59af` | Add atomic catalog command storage | Reviewed | CANONICAL-CANDIDATE | Implements the previously schema-only catalog command writer with locks, knowledge checks, atomic change/receipt persistence, exact replay, conflict rejection, and schema-versioning. This is synchronization/persistence infrastructure rather than product UI behavior. |
| 9 | `626a780` | Add evidence-backed plan creation | Reviewed | MIXED: CANONICAL-CONCEPT + YNAB-COMPATIBILITY | Adds generic plan command/entity contracts and atomic plan creation, but also introduces `buildStockPlanBootstrap` containing the admitted PLAN-001 `be_*` entity set/defaults. The create semantic is durable; the bootstrap representation is explicitly stock-YNAB knowledge. |
| 10 | `8b6e85f` | Add atomic plan lifecycle commands | Reviewed | MIXED: CANONICAL-CANDIDATE + YNAB-COMPATIBILITY | Implements atomic rename/delete storage and replay across catalog/budget ledgers. Core lifecycle/idempotency semantics are portable, while details such as editing the `be_budget` payload and tombstone projection name `Unknown` are recovered compatibility semantics. |
| 11 | `1bad1bf` | Add canonical plan read boundary | Reviewed | MIXED: CANONICAL-CANDIDATE + ACTUAL-ADAPTER | Adds framework-level `PlanReader`/`PlanSnapshot` and PostgreSQL reader, then exposes it through the Actual semantic HTTP runtime. The reader/storage boundary is portable; route composition is host-specific. |
| 12 | `3cb1dde` | Add semantic plan client bridge | Reviewed | ACTUAL-ADAPTER | Adds Actual `loot-core` worker methods, retained-token HTTP transport, durable semantic device identity, and desktop-client wrapper functions. Its purpose is to let inherited Actual client architecture invoke the semantic API without exposing credentials to React. |
| 13 | `29643bf` | Add canonical plan client state | Reviewed | ACTUAL-ADAPTER / TRANSITIONAL | Adds the semantic plan Redux slice and wires it into the inherited desktop-client store. The state concepts may inform a final UI, but this implementation is explicitly bound to Actual's Redux/worker architecture. |
| 14 | `d03f283` | Share plan command application services | Reviewed | MIXED: CANONICAL-CANDIDATE + YNAB-COMPATIBILITY | Extracts plan creation and lifecycle command construction from HTTP handlers into reusable services so native web and stock routes can share orchestration. This is a strong application-service boundary, but plan creation still calls the stock PLAN-001 bootstrap builder and therefore is not representation-neutral yet. |
| 15 | `cb53504` | Add stock catalog compatibility gateway | Pending | — | — |
| 16 | `6dd70a7` | Add stock budget source projection | Pending | — | — |
| 17 | `2da22b9` | Add fresh budget calculation projection | Pending | — | — |
| 18 | `15deeb2` | Add stock budget bootstrap gateway | Pending | — | — |
| 19 | `a1867c1` | Ingest stock opened budget delta | Pending | — | — |
| 20 | `67b806c` | Add evidence-backed checking account creation | Pending | — | — |
| 21 | `04d4adc` | Add stock account creation adapter | Pending | — | — |
| 22 | `6b26a5c` | Add captured multi-account calculations | Pending | — | — |
| 23 | `59e60f2` | Add captured account rename delta | Pending | — | — |
| 24 | `d6d21b5` | Add stock derived knowledge and pristine account delete | Pending | — | — |
| 25 | `3e45c9b` | Clarify stock derivation knowledge revisions | Pending | — | — |

## Findings from commits 1–6

The opening sequence does not begin with a YNAB wire implementation. It first creates a framework-independent semantic contract package and a PostgreSQL persistence/knowledge foundation, then mounts those abstractions into Actual through a feature-gated runtime. Subsequent schema commits continue to preserve unknown payloads and deliberately defer unsupported domain policy.

That chronology matters for later promotion analysis: the storage/ledger concepts were intentionally designed as a boundary independent of Actual/React/Express/CRDT and most YNAB behavior, whereas the sync-server mount and principal resolver exist to integrate those concepts with the current fork host.

## Findings from commits 7–14

The second sequence first makes the semantic stack reproducible locally, then completes catalog command persistence before admitting the first substantial YNAB-derived domain payload: PLAN-001 bootstrap. Plan creation/lifecycle/read functionality is then exposed to the retained Actual client through worker/HTTP/Redux adapters.

Commit 14 is architecturally important because it removes semantic command construction from transport handlers and introduces shared application services. However, `createPlanCreationService` still invokes `buildStockPlanBootstrap`, so the application-service boundary is cleaner than the representation boundary. A future final product should preserve the shared-command principle without assuming the current `be_*` bootstrap model is the canonical internal domain model.
