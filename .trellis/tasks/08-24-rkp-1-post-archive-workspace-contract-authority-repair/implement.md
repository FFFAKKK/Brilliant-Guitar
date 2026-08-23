# Implementation Plan — RKP-1 Post-Archive Workspace Contract and Authority Repair

## Entry gate

- base is exactly `063b332dd48c05796fb3450a8004f42ff2148b20`;
- worktree is clean before activation;
- independent planning review passes;
- user separately authorizes implementation;
- RKP-2 remains planning-only.

## Stage 1 — Activate and freeze state

Run `task.py start` only after the entry gate. Set this repair as the sole active implementation child and record the exact planning commit. Commit state only.

**Rollback:** revert the activation commit.

## Stage 2 — Repair historical test projection

Modify only `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts`:

1. add exact audited implementation head and separate historical/current paths;
2. prepend per-command `core.longpaths=true` inside the Git helper;
3. replace HEAD/dirty aggregation with the closed historical interval;
4. inspect historical file existence at the audited commit;
5. replace mutable pre-archive lifecycle assertions with durable archived facts.

Run build and the focused six-test file.

**Rollback:** revert this test commit.

## Stage 3 — Synchronize authority

Append a closeout/repair record to archived evidence and correct only stale current-state fields. Update the parent to show the repair candidate ready for implementation review. Preserve historical results and hashes.

**Rollback:** revert the authority-sync commit.

## Stage 4 — Full verification

Run task/parent/archived Trellis validations, JSON/JSONL parse, Rust fmt/check/test/clippy, TypeScript typecheck/build, focused workspace test, the frozen Windows addon and dedicated `--expose-gc` suite, full TypeScript suite, `git diff --check`, literal allowlist and protected-path checks. After integration, repeat the focused test from the existing long RKP-2 planning worktree.

Expected baselines remain Rust `40/40`, workspace-law `6/6`, Node bridge `9/9`, and TypeScript `545 passed / 1 expected GC skip / 0 failed`.

## Stage 5 — Review and closeout

Stop at `IMPLEMENTATION REVIEW REQUIRED`. A separate read-only auditor reviews the exact candidate. Acceptance/archive requires `P0/P1/P2=0/0/0`. No push occurs. The planner then integrates the accepted repair into the RKP-2 planning baseline.
