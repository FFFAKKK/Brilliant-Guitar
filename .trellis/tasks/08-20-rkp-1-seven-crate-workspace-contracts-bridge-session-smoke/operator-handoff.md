# RKP-1 Operator Handoff

## Current status

`TARGETED PLANNING REREVIEW REQUIRED`.

This task is planning-only. Initial candidate `b619f240...` returned P0/P1/P2=`0/3/1`, first r1 candidate `922da5e...` returned `0/2/0`, and second amended candidate `9741abf...` returned `0/1/0`. This amend closes only the remaining status-dependent `napi_remove_wrap` ownership-state P1 and direct tests; all other passed contracts remain unchanged, no prior P2 is claimed closed, and targeted rereview is pending. `task_start_run=false`, `production_implementation_authorized=false`, independent planning review is `pending`, and TypeScript remains the default runtime. Do not run `task.py start`, install/download Rust dependencies, create Cargo/Rust files, modify production/test/build files, or begin any implementation from this handoff.

## Exact future entry gate

Implementation may begin only after all of the following are visible in this task:

1. a separate read-only planning auditor performs a targeted rereview of the exact status-sync plus amended RKP-1 docs-only chain;
2. the auditor returns `PASS`, `P0/P1/P2=0/0/0`;
3. the user sends a later message authorizing implementation in this same task;
4. the worktree is clean on `codex/rkp-1-seven-crate-workspace-contracts-bridge-smoke-planning-r1`; status-sync `7174c5ac50655ae0cb8807e21c7045a0c1b6d15e` is a direct child of `463c851...`; the accepted amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`; and preserved original candidate `b619f240...` remains the untouched sibling of `7174c5a...`;
5. parent `current_planning_child` names only this task and `current_implementation_child` is still null.

Only then may the operator run `task.py start` and execute `implement.md` Stage 1.

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
