# RKP-1 Post-Archive Workspace Contract and Authority Repair

## Goal

Restore the accepted RKP-1 baseline after its native Trellis archive moved the task authority, without changing Rust/TypeScript production behavior or beginning RKP-2. The repair must make the historical RKP-1 workspace-contract test valid from long Windows worktree paths and make current authority state say `accepted_archived` everywhere that represents current state.

## Confirmed baseline

- Planning/repair base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Audited RKP-1 implementation: `94387b339b5e4d9ce6b7f97597a1b56edd051f01`, independent PASS `P0/P1/P2=0/0/0`.
- Archive commit: `08792d52eb33ab3b9901eae818e8a53adc742bdc`.
- Journal commit: `8443960841fbf64bf7041bd2b87f2b2e0ba7131f`.
- Final parent projection commit: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Archived child: `.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/`, `status=completed`.
- TypeScript remains the product default. Default cutover, official qualification, push and RKP-2 implementation are outside this repair.

## Reproduced defects

### PA-R001 — Historical allowlist lookup is not long-worktree safe

`test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` calls `git show COMMIT:ACTIVE_TASK_PATH` without per-command `core.longpaths=true`. From the RKP-2 planning worktree, the test fails with `Filename too long` before reading the historical matrix.

### PA-R002 — Lifecycle assertion reads a path that native archive removed

The same test reads `.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/task.json` from the current checkout and asserts `in_progress`. Native archive moved the task and set it to `completed`, so the assertion fails with `ENOENT`.

### PA-R003 — A historical implementation test is coupled to future HEAD and dirty state

The allowlist test computes `PLANNING_HEAD..HEAD` and adds current unstaged, staged and untracked paths. After archive and later stages, this mixes lifecycle or RKP-2 work into the already audited RKP-1 implementation interval. RKP-1 history must instead be frozen to `PLANNING_HEAD..AUDITED_IMPLEMENTATION_HEAD`.

### PA-R004 — Current authority still contains pre-archive projections

The archived RKP-1 task notes and selected meta fields still say archive is pending. The active parent notes also describe archive pending and RKP-2 absence. Current-state fields must reflect completed archive while preserving historical evidence paragraphs as history.

## Requirements

### RKP1-PA-R001 — Freeze the historical implementation interval

The workspace-contract test shall define exact audited implementation commit `94387b339b5e4d9ce6b7f97597a1b56edd051f01`. Its changed-path proof shall inspect only the closed interval from planning commit `89115daedc623c0d35386a4a433cc7fd95215223` to that audited implementation commit. It shall not add current HEAD, working-tree, index or untracked paths to the RKP-1 historical projection.

### RKP1-PA-R002 — Separate historical and current task paths

Historical `git show` reads shall keep the task path that existed at the referenced planning commit. Current lifecycle reads shall use the archived task path. The test must not manufacture a duplicate active task directory or copy archived authority back into `.trellis/tasks/`.

### RKP1-PA-R003 — Make test-owned Git calls long-path local

The test helper shall invoke Git with per-command `-c core.longpaths=true`. It shall not modify global, system, repository or user Git configuration. The exact historical matrix lookup must pass from the long RKP-2 planning worktree that reproduced the failure.

### RKP1-PA-R004 — Assert immutable RKP-1 facts, not future-stage absence

The lifecycle test shall assert only durable RKP-1 facts:

- archived child exists and is `completed`;
- implementation review/rereview passed;
- audited implementation commit is exact;
- parent retains the archived child reference exactly once;
- parent projects RKP-1 as `accepted_archived`;
- TypeScript remains the default and default cutover is false.

It shall not require RKP-1 to remain `in_progress`, require the active child path to exist, or require RKP-2 through RKP-9 to remain absent.

### RKP1-PA-R005 — Preserve exact audited allowlist meaning

The test shall continue to prove the accepted forty-path implementation allowlist and seven accepted planning-only paths at the historical commits. File existence shall be checked in the audited commit, not assumed from a later checkout. The repair itself adds no path to the historical RKP-1 implementation allowlist.

### RKP1-PA-R006 — Synchronize authority narrowly

The archived child may receive a closeout appendix and current-state field corrections. The active parent may record this bounded repair and its gate. Historical audit results, hashes, failure records and evidence remain unchanged.

### RKP1-PA-R007 — Preserve product and stage boundaries

The repair shall have zero delta under `src/**`, `crates/**`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `rustfmt.toml`, `package*.json`, `tsconfig*.json`, `.trellis/spec/**`, CVN-7 evidence and every test except the one literal workspace-contract test. RKP-2 remains planning-only and resumes only after this repair is independently accepted and archived.

## Acceptance criteria

- [ ] `RKP1-PA-AC001`: the two reproduced focused failures become six focused passes from the repair worktree and from the existing long RKP-2 planning worktree after integration.
- [ ] `RKP1-PA-AC002`: the historical changed-path set is derived only from `89115da...94387b` and remains the accepted forty implementation paths after subtracting seven planning-only paths.
- [ ] `RKP1-PA-AC003`: all Git calls owned by the test use per-command `core.longpaths=true`; persistent Git configuration remains unchanged.
- [ ] `RKP1-PA-AC004`: archived RKP-1 status and parent RKP-1 projection are `completed`/`accepted_archived`, with one parent child reference.
- [ ] `RKP1-PA-AC005`: TypeScript default, `28/51/8/34/9`, `brilliant-score-1`, seven-crate graph and audited implementation commit remain exact.
- [ ] `RKP1-PA-AC006`: Rust workspace `40/40`, workspace-law `6/6`, dedicated Node bridge `9/9`, TypeScript typecheck/build and full discovery `546` with `545 passed / 1 expected GC skip / 0 failed` remain green.
- [ ] `RKP1-PA-AC007`: Trellis, JSON/JSONL, unique parent-child reference, `git diff --check`, protected-path zero delta and clean-worktree checks pass.
- [ ] `RKP1-PA-AC008`: independent planning review passes before activation; independent implementation review passes before acceptance/archive.

## Out of scope

- LiveScoreStore, RuntimeHandle, indices, load/encode parity or any RKP-2 implementation;
- Rust source, native exports, codecs, failure variants or dependency changes;
- TypeScript product runtime or public-export changes;
- CVN-7 workload, evidence, qualification or performance-budget changes;
- default-runtime cutover, push, release or official measurement.
