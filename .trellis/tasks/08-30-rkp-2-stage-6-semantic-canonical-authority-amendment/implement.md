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

## E1R2-A — accepted no-write defect characterization (future, no repository write)

- **Action:** mechanically confirm that the current/accepted E1 seam still contains `assert_eq!(encoded, input_score_bytes)` in `collect_scale_evidence`; then read the accepted archived RKP-1A authority/evidence to confirm raw SHA `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`, Rust canonical SHA `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`, equal length `15_013_904`, different bytes, DTO semantic equality, and the frozen first-difference/path/order facts.
- **Action:** confirm accepted B `08374273b05bc992e749a17a959b64af0f293f0b`, C5 authority `d14d73117e03822a52fd19c55f3024cb2b73ef45`, their ancestry/archive authority, and byte-zero values for both future technical paths relative to the accepted planning base.
- **Gate:** every source assertion and accepted-authority fact above must exist and agree. This phase constructs no nonexistent noncanonical small request, runs no Rust test, stress worker, or process harness, and writes neither repository nor fixture state. It is evidence for the defect premise, not a claim that the future regression already ran.
- **Stop:** a missing/mismatched source assertion, archive authority, SHA role, ancestry, or technical zero-delta stops the work for a new bounded planning repair.

## E1R2-B — atomic two-file correction (future)

- **Files:** exactly `crates/brilliant-kernel-runtime/src/indices.rs` and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.
- **Action:** replace the raw-byte assertion with the flow in `design.md`; this atomic two-file commit is the first place that adds and runs the noncanonical small regression, alongside the canonical small test. Mechanically pin one export, two strict decodes, two Rust canonical encodes, metric ownership, semantic/canonical field roles, and literal ownership.
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
