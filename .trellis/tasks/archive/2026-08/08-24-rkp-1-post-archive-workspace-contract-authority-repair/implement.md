# Implementation Plan — RKP-1 Post-Archive Workspace Contract and Authority Repair

## Entry gate

- base is exactly `063b332dd48c05796fb3450a8004f42ff2148b20`;
- worktree is clean before activation;
- independent planning review passes;
- user separately authorizes implementation;
- RKP-2 remains planning-only.

## Stage 1 — Activate and freeze state

Run `task.py start` only after the entry gate. Set this repair as the sole active implementation child and record the exact planning commit. `implementation_candidate_ready=false`.

**Commit 1 owned paths:** repair `task.json`, repair `operator-handoff.md`, active parent `task.json`.

**Rollback:** revert Commit 1; task returns to reviewed planning state.

## Stage 2 — Repair historical test projection

Modify only `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts`:

1. add exact audited implementation head and separate historical/current paths;
2. prepend per-command `core.longpaths=true` inside the Git helper;
3. replace HEAD/dirty aggregation with the closed historical interval;
4. inspect historical file existence at the audited commit;
5. replace mutable pre-archive lifecycle assertions with durable archived facts.

Run build and the focused six-test file.

**Commit 2 owned path:** only `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts`.

**Rollback:** revert Commit 2; activation remains explicit and no authority file claims a repaired test.

## Stage 3 — Synchronize authority

Append a closeout/repair record to archived evidence and correct only stale current-state fields. Update repair/parent progress, but keep `implementation_candidate_ready=false` and implementation review pending. Preserve historical results and hashes.

**Commit 3 owned paths:** the five archived/parent authority paths listed in `design.md`, plus repair `task.json`, `operator-handoff.md` and `review-candidate.md`.

**Rollback:** revert Commit 3; the functional repair remains isolated in Commit 2 and no authority claims full verification.

## Stage 4 — Full verification

Run task/parent/archived Trellis validations, JSON/JSONL parse, Rust fmt/check/test/clippy, TypeScript typecheck/build, focused workspace test, the frozen Windows addon and dedicated `--expose-gc` suite, full TypeScript suite, `git diff --check`, literal allowlist and protected-path checks. After integration, repeat the focused test from the existing long RKP-2 planning worktree.

Expected baselines remain Rust `40/40`, workspace-law `6/6`, Node bridge `9/9`, and TypeScript `545 passed / 1 expected GC skip / 0 failed`.

Only after every Stage 4 gate passes, create `research/implementation-evidence.md`, update repair/parent status, and set `implementation_candidate_ready=true`.

**Commit 4 owned paths:** repair `task.json`, `operator-handoff.md`, `review-candidate.md`, new `research/implementation-evidence.md`, and active parent `task.json`.

**Rollback:** revert Commit 4; candidate readiness returns false while the already verified implementation commits remain available for diagnosis.

## Stage 5 — Review and closeout

After Commit 4, stop at `IMPLEMENTATION REVIEW REQUIRED`. A separate read-only auditor reviews the exact four-commit candidate. Acceptance/archive requires `P0/P1/P2=0/0/0` and is a later owner action. No push occurs. The planner then integrates the accepted repair into the RKP-2 planning baseline.
