# Repository reference audit

This directory contains reference-only records produced by a from-baseline audit of the custom fork work in `DevsNate/actual`.

These files are **not** governing behavior specifications and do not replace:

- `project-docs/architecture/selective-fork-decision.md`;
- `project-docs/architecture/stock-actual-change-ledger.md`; or
- admitted YNAB evidence and compatibility fixtures.

Their purpose is to make the current fork understandable before any later extraction into a separate research repository or final product repository.

## Audit rules

- Audit boundary: stock Actual v26.8.1 commit `063df03763ca772b51f6264752b88ddec22cfb8a` through the current fork head being reviewed.
- Re-verify claims from repository state instead of treating earlier conversational conclusions as authoritative.
- Classify custom work by responsibility and portability, not by filename alone.
- Distinguish canonical concepts from code that merely implements those concepts in YNAB-shaped or Actual-specific representations.
- Record uncertainty explicitly; a reference classification is not a promotion decision.
- Do not infer uncommitted local/Codex state from GitHub.

## Planned reference set

1. `baseline-and-scope.md` — exact baseline, audit boundary, and status vocabulary.
2. `custom-commit-inventory.md` — chronological inventory of the 25 custom commits.
3. `custom-file-inventory.md` — fork-only/modified file surface grouped by subsystem.
4. `responsibility-map.md` — canonical concept, canonical candidate, YNAB compatibility, Actual adapter, transitional, inherited, and retire boundaries.
5. `promotion-policy.md` — evidence and engineering gates for promotion into a future final repository.
6. `repository-boundaries.md` — authority split among research, compatibility-lab, and final-product repositories.

The audit is intentionally incremental. A file may be refined as later commit/file inspection changes an earlier classification.
