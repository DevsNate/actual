# Repository reference audit

This directory contains reference-only records produced by a from-baseline audit of the custom fork work in `DevsNate/actual`.

These files are **not** governing behavior specifications and do not replace:

- `project-docs/architecture/selective-fork-decision.md`;
- `project-docs/architecture/stock-actual-change-ledger.md`; or
- admitted YNAB evidence and compatibility fixtures.

Their purpose is to make the current fork understandable before any later extraction into a separate research repository or final product repository.

## Audit rules

- Audit boundary: stock Actual v26.8.1 commit `063df03763ca772b51f6264752b88ddec22cfb8a` through the fork `main` head present when this audit began.
- Re-verify claims from repository state instead of treating earlier conversational conclusions as authoritative.
- Classify custom work by responsibility and portability, not by filename alone.
- Distinguish canonical concepts from code that merely implements those concepts in YNAB-shaped or Actual-specific representations.
- Record uncertainty explicitly; a reference classification is not a promotion decision.
- Do not infer uncommitted local/Codex state from GitHub.

## Reference set

Read these roughly in order:

1. `baseline-and-scope.md` — exact baseline, audit boundary, and classification vocabulary.
2. `product-objective.md` — explicit end-state requirement: lightly modified stock iOS compatibility plus 100% observable visual/functional parity with the supported stock YNAB web version/capture horizon.
3. `custom-commit-inventory.md` — chronological audit of all 25 custom commits.
4. `custom-file-inventory.md` — complete baseline-to-`main` custom file surface grouped by subsystem and future disposition.
5. `responsibility-map.md` — current runtime/layer ownership and the main representation-boundary problem.
6. `promotion-policy.md` — evidence, dependency, persistence, replay, and provenance gates for promotion into a future final repository.
7. `repository-boundaries.md` — authority split among the research corpus, `DevsNate/actual` compatibility laboratory, and future final product.
8. `final-product-seed.md` — practical first/second promotion tranches, what stays behind, and what requires redesign before promotion.

## Product target clarification

The final product target is not merely a YNAB-compatible server or a YNAB-inspired web application.

For the supported stock version/capture horizon, the intended observable end state is:

- a lightly modified stock YNAB iOS application communicating with the reconstructed server without a heavy client-side rewrite; and
- a literal 1:1 recreation of the stock YNAB web application visually and functionally.

`product-objective.md` defines the parity dimensions and the distinction between external fidelity and internal implementation freedom. This clarification is recorded here as a reference requirement; it should be promoted into the governing architecture records when this reference work is deliberately reviewed/merged.

## Audit status

The initial from-zero audit is complete at two levels:

- all 25 custom commits from the verified stock baseline were individually reviewed; and
- the complete baseline-to-`main` changed-file surface was classified by responsibility and likely future disposition.

The resulting architecture conclusion is that `DevsNate/actual` should be treated as the compatibility/reconstruction host, not automatically as the clean final product. The strongest portable spine is the synchronization/knowledge/idempotency/change-set/PostgreSQL foundation. The largest extraction issue is representation ownership: shared semantic services and generic entity storage still allow YNAB `be_*` representation to cross into what otherwise looks like canonical application/state code.

These references intentionally remain revisable. New admitted YNAB evidence may change domain dependencies, calculation ownership, or which existing implementation is safe to promote, without invalidating the verified commit/file provenance recorded here.

## Write boundary

This reference audit does not authorize product implementation, YNAB/browser mutations, deletion of inherited Actual systems, promotion into a final repository, or merging this branch. Those actions remain separate decisions.
