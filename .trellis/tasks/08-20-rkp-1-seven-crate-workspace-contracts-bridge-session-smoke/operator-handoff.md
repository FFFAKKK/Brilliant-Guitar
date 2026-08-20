# RKP-1 Operator Handoff

## Current status

`IMPLEMENTATION IN PROGRESS / STAGE 1 PENDING`.

The final targeted planning audit independently passed P0/P1/P2=`0/0/0` at exact candidate `89115daedc623c0d35386a4a433cc7fd95215223` in planning-audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user then explicitly authorized RKP-1 implementation. The operator created `codex/rkp-1-seven-crate-workspace-contracts-bridge-session-smoke` from that exact candidate and ran `task.py start`. `task_start_run=true`, `production_implementation_authorized=true`, independent planning review is `passed`, implementation review is `pending`, and TypeScript remains the default runtime.

## Satisfied implementation entry gate

The following entry facts are satisfied and recorded:

1. the separate read-only planning auditor returned `PASS`, P0/P1/P2=`0/0/0` for `89115da...`;
2. the user explicitly authorized implementation in the same delegated task;
3. activation began from a clean worktree at exact audited HEAD `89115da...`;
4. the implementation branch was created without rewriting `7174c5a...`, `89115da...`, or preserved sibling `b619f240...`;
5. parent `current_planning_child` and `current_implementation_child` both name only this RKP-1 child.

Execute `implement.md` Stages 1 through 5 as separate, independently revertible commits. Stop at the first failed stage gate.

## Fixed inputs

- Architecture V2: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` at content `e81c739b...`, accepted audit record `ea574ec...`.
- Authority sync: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync/` accepted at `d722789...`.
- Rust parent: `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/`.
- RKP-0: archived, accepted `9bc5390...`.
- Current compatibility: `brilliant-score-1`, `28/51/8/34/9`, full planning baseline `531/531`.
- Toolchain/dependencies/features: frozen in `design.md` and `research/workspace-contract-and-bridge-freeze.md`; no “latest” selection remains for the operator.
- Native boundary: Node-API v8 `cdylib`; only Windows `x86_64-pc-windows-msvc` debug; exact `.dll`/`.node`, literal copy, `process.dlopen`/`require`, two-export and clean-clone commands are frozen. Non-Windows is excluded.
- Failure/handle boundary: the closed 22-variant `StableFailureV1`, exact create/read wrappers/eight-stage precedence, fixed 128-bit type tag, `boundary.rs`-only unsafe composition, four-state status-dependent remove-wrap ownership, pre-reserved last-step table insertion, matching-generation finalizer, owner-environment/thread checks and pre-lock reentrant/non-blocking `try_lock` law are frozen; only two free-function exports remain.
- Changed paths: exact list only in `research/file-test-and-rollback-matrix.md`.

## Execution discipline

Implement five ordered, independently revertible commits: workspace/toolchain; contracts; minimal runtime/session; private Node bridge; evidence/state. Stop at the first broken gate. Do not compress stages, edit an absent allowlist path, create an extra crate, add a package script, infer a non-Windows target, widen to RKP-2, change default runtime or touch another worktree.

After the final implementation candidate, stop at `IMPLEMENTATION REVIEW REQUIRED`. Do not accept/archive, push, create RKP-2 or run official qualification without later authority.
