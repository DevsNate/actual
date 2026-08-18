# Baseline and audit scope

## Verified baseline

The audit starts from stock Actual v26.8.1 commit:

`063df03763ca772b51f6264752b88ddec22cfb8a`

At the start of this audit, GitHub comparison of that commit to `main` reports:

- status: `ahead`;
- ahead: 25 commits;
- behind: 0 commits;
- merge base: the same baseline commit.

This means the custom fork surface can be reviewed as the exact 25-commit delta from that stock point without reconciling an independent upstream branch divergence inside this audit.

## Audit branch

Reference files are being written on:

`repo-reference-audit`

The branch began from `main`. Product implementation is not being changed as part of this reference audit.

## What is in scope

- every commit in the 25-commit fork delta;
- every file added, modified, or renamed by that delta;
- dependencies between custom semantic code and inherited Actual code;
- which ideas appear portable to a future final product;
- which code exists specifically for YNAB compatibility;
- which code exists specifically to bridge the new semantic system into Actual;
- which inherited Actual systems are intended to remain, migrate, or retire according to the governing architecture records.

## What is not in scope

- uncommitted local/Codex working-tree state;
- new YNAB/browser capture work;
- changing or extending product behavior;
- treating reference classifications as admitted YNAB evidence;
- deciding final product implementation details that require evidence not yet collected.

## Reference classification vocabulary

The audit will use the following provisional labels.

### CANONICAL-CONCEPT

A domain, synchronization, persistence, or calculation idea that is likely to remain useful in a final product independent of Actual and independent of YNAB wire naming.

### CANONICAL-CANDIDATE

Existing code that is structurally portable enough to consider extracting, but still requires a dependency and representation audit before promotion.

### YNAB-COMPATIBILITY

Code whose responsibility is to parse, validate, reproduce, or project observed stock YNAB protocol/entity behavior.

### ACTUAL-ADAPTER

Code whose responsibility is to connect the semantic system to inherited Actual authentication, server, worker, state, or UI boundaries.

### TRANSITIONAL

Code or composition that exists because the inherited Actual and semantic architectures currently coexist.

### INHERITED

Stock Actual code retained by the fork and not introduced by the 25 custom commits, except for small integration changes needed to expose a custom boundary.

### RETIRE

A stock authority/path that governing architecture records intend to remove from the live budgeting path. This is not a statement that the code should be deleted immediately.

## Promotion principle

A canonical concept is not automatically canonical code. For example, an account-creation semantic may be durable while a current implementation that constructs YNAB `be_*` records directly remains compatibility-shaped and therefore unsuitable for direct promotion without extraction.
