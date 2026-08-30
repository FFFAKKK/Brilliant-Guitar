# Implementation Plan — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Authority and stop rule

This document is a planning candidate only. `task.py start` is prohibited in this task until an independent planning review passes and the user separately authorizes implementation. A pass of E1R2's independent implementation audit is only a request point for a separate E2 authorization; it does not start E2.

## P0 — planning candidate (this commit)

- **Files:** the twelve task artifacts plus the Stage 6, RKP-2, and Rust-parent `task.json` projections only.
- **Action:** freeze the raw-versus-canonical correction, the two-file future technical allowlist, six lifecycle paths, and the A0/E1R2 stop points.
- **Gate:** exact fifteen-path diff from `d14d73117e03822a52fd19c55f3024cb2b73ef45`; source technical paths byte-zero; original Stage 6/RKP-1A/closeout immutable hashes match.
- **Rollback:** revert this planning-only commit only; no implementation was authorized or performed.

## A0 — activation (future, separately authorized)

- **Files:** `future_lifecycle_allowlist` only.
- **Action:** record planning PASS, activate this child only, and leave E1R2/E2/E3 false before E1R2 work starts.
- **Gate:** parent ownership remains singular: the Stage 6 seam child is the only active implementation owner and this child is the current planning/authority child.
- **Rollback:** revert A0 only, returning to the accepted planning state.

## E1R2-A — RED characterization (future, no repository write)

- **Action:** demonstrate on the existing noncanonical small raw order that the current assertion `encoded == input_score_bytes` fails although strict decode, Store export, and semantic DTO equality hold.
- **Gate:** this is an expected in-memory/test-command RED only. It creates no dirty worktree, runs no stress worker, and does not change any contract or fixture.
- **Stop:** a failure other than this raw-byte assertion, or any indication of a product codec/DTO defect, stops the work for a new bounded plan.

## E1R2-B — atomic two-file correction (future)

- **Files:** exactly `crates/brilliant-kernel-runtime/src/indices.rs` and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.
- **Action:** replace the raw-byte assertion with the flow in `design.md`; add canonical and noncanonical small tests; mechanically pin one export, two strict decodes, two Rust canonical encodes, metric ownership, semantic/canonical field roles, and literal ownership.
- **Gate:** focused Rust seam tests and workspace-law are green; Foundation/Contracts/RKP-1A source consumers are byte-zero; no worker/process/sentinel schema drift.
- **Rollback:** one atomic technical commit restores the current assertion and all pre-E1R2 seam behavior.

## E1R2-C — full gates and candidate freeze (future)

- **Files:** `future_lifecycle_allowlist` only after E1R2-B technical head is green.
- **Action:** record exact commands/results and produce an implementation candidate for independent audit. No additional technical edits are permitted.
- **Gate:** Rust format/check/test/clippy/MSRV, TypeScript typecheck/build, dynamic full runner, native bridge, Trellis/JSON/JSONL/fence/diff/literal-path/protected-zero checks, and immutable hash checks all pass. Existing stress worker execution and qualification remain out of scope.
- **Rollback:** revert the lifecycle commit only; retain the independently reviewable technical head.

## E1R2-D — independent implementation audit (future, read-only)

- **Action:** audit E1R2-B/C range, including the semantic/canonical role split, call counts, no-metric duplication, literal two-path ownership, and no E2 start.
- **Stop:** only a PASS permits asking the user for a separate E2 authorization. It neither accepts nor archives this child and it does not start E2.

## Future ranges

`accepted planning head..E1R2 candidate` must contain only the two technical paths plus the six declared lifecycle paths. Any source, fixture, Cargo, public API, worker/process, or archived-authority drift is fail-closed.
