# RKP-1 Seven-Crate Workspace Contracts Bridge Session Smoke

## Goal

Create an independently reviewable plan for the first Rust implementation child: exactly seven crates, stable Core/DTO boundaries, and one native `KernelSession` create/read Node-API smoke. RKP-1 proves the construction path only. TypeScript remains the product default and the accepted behavioral oracle.

## Authority and entry state

- Exact planning base and required ancestor: `463c8514a61a61a39c8a5d2736261ae9e82b0fba`.
- Current architecture authority: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md`, content commit `e81c739b...`, accepted audit record `ea574ec...`, PASS `P0/P1/P2=0/0/0`, checklist `34/34`.
- Accepted authority sync: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync/`, commit `d722789...`, independent PASS `0/0/0`.
- Parent: `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/`; the parent remains `planning` and owns no production implementation.
- Predecessor: archived RKP-0 at `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/`, accepted commit `9bc5390...`.
- Current observable oracle: `brilliant-score-1`, 28 commands, 51 application runtime exports, Module SDK 8 runtime/34 type exports, nine contribution ABI fields, and full `531/531`.
- Independent review history: initial `b619f240...` returned P0/P1/P2=`0/3/1`; first r1 candidate `922da5e...` returned `0/2/0`; second amended candidate `9741abfee76d009dbea985192e5dfb162e16902a` returned `0/1/0`. This amend repairs only the final authorized status-dependent `napi_remove_wrap` ownership-state finding and its direct tests. All previously passed contracts remain unchanged, targeted planning rereview remains pending, and no prior P2 is claimed closed.
- Implementation state at repair entry: candidate `669364128cd4402a478f247393908ff170112794` completed Stages A-D and the Stage E workspace-law gate, but the clean full suite is `541/542`. The sole failure is the CVN-7 historical zero-production-drift test using an open upper bound; this bounded planning repair pauses implementation without changing the failed result.
- Frozen CVN-7 historical production-drift interval: base `38afdc3fd508dc67f7aa446fd323837a5d550b70`, final CVN-7 input/head `b21540fa3636e6c8e827ff24c2099f4ff331285d`. Both commits must exist and the base must be an ancestor of the final head.

## Requirements

### RKP1-R001 — Bounded planning repair pauses the active implementation

The original planning candidate passed independent review and implementation was authorized. During this repair the child stays `status=in_progress`, `task_start_run=true`, `production_implementation_authorized=true`, `implementation_paused_for_bounded_planning_repair=true`, `implementation_candidate_ready=false`, and `independent_planning_rereview=pending`. The repair must end with `PLANNING REREVIEW REQUIRED`. It does not run `task.py start` again, modify the CVN-7 test or production code, resume Stage E, accept/archive, push, create RKP-2+, or reinterpret the prior planning PASS.

### RKP1-R002 — Workspace membership is exactly seven crates

The future workspace shall contain exactly:

1. `brilliant-core-types`
2. `brilliant-score-foundation`
3. `brilliant-extension-protocol`
4. `brilliant-kernel-contracts`
5. `brilliant-kernel-runtime`
6. `brilliant-kernel-session`
7. `brilliant-kernel-node`

No eighth crate, example crate, macro crate, test-support crate, provider crate, WASM crate or Tauri crate is permitted in RKP-1. The direct dependency graph and forbidden edges are normative in `design.md` and `research/workspace-contract-and-bridge-freeze.md`.

### RKP1-R003 — Deliver only foundations, contracts, and smoke behavior

RKP-1 may implement:

- the Cargo workspace/toolchain/lint/feature foundation;
- stable Core primitive types and bounded JSON values;
- structural `ScoreDocument` DTOs and deterministic strict byte codecs sufficient for the smoke fixture;
- versioned Extension Protocol and Kernel contract data types without executable provider behavior;
- a minimal immutable Runtime holder and `KernelSession::create` / `read_state` path;
- a private Node-API adapter with one opaque session handle and two synchronous create/read exports;
- a Windows-only `x86_64-pc-windows-msvc` debug native build/load smoke whose source `.dll`, copied `.node`, export probe and clean-clone procedure are exact;
- focused Rust, TypeScript boundary, workspace-law and regression tests.

RKP-1 does not claim full semantic load/encode parity, command execution, transaction behavior, performance qualification or product integration.

### RKP1-R004 — TypeScript remains default and compatibility inventories do not move

The existing TypeScript Core remains the default product runtime and all existing public exports remain unchanged. The new bridge is private, test-addressable and absent from `src/core-kernel/index.ts`. RKP-1 must not add a runtime selector, change Product ApplicationAssembly, reinterpret the Module SDK, or change `28/51/8/34/9` or `brilliant-score-1`.

### RKP1-R005 — DTO, FFI, panic and failure boundaries are data-only

- TypeScript owns descriptor-first hostile-object capture and detached/frozen returned values.
- `brilliant-kernel-contracts` owns top-level version dispatch, exact-shape request/result codecs and canonical byte encoding.
- Foundation and protocol crates own their nested DTO validation; Runtime and Session never parse wire bytes.
- `brilliant-kernel-node` accepts/returns byte buffers plus an opaque handle; it owns transport caps, handle synchronization, panic containment and stable bridge-failure mapping only.
- The six non-Node crates forbid unsafe code. Node lowers that lint only for `crates/brilliant-kernel-node/src/boundary.rs`, whose safe wrappers own the minimal explicit unsafe blocks for pinned napi `3.12.0`; every block has a checked `SAFETY` invariant and `unsafe_op_in_unsafe_fn` is denied. The exact composition is preflight/reserve -> `napi_wrap` with the unique finalizer -> fixed 128-bit type tag -> last-step infallible table insertion. Rollback follows `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released` and branches on `napi_remove_wrap` status before touching its out pointer; `wrap_and_tag`, macro classes, handwritten JS wrappers, `napi_add_finalizer` and extra exports are forbidden.
- `StableFailureV1` is a closed, versioned, data-only tagged union with exact code/key allowlists and an eight-stage first-failure precedence. Every create/read result uses the frozen wrapper shapes in `design.md`; no raw Rust/serde/N-API/provider message, backtrace, thread/environment identity, pointer, local path or panic payload crosses the boundary.
- Every handle records private owner-thread and Node environment identity at creation, validates type/staleness/environment/thread/reentrancy before locking, and uses non-blocking `try_lock`; unknown, stale, wrong-environment, wrong-thread, reentrant, busy and poisoned states have distinct stable failure codes.
- Rust request bytes are decoded independently after TypeScript capture; missing, extra, duplicate, malformed, trailing and over-cap inputs are rejected.

### RKP1-R006 — Implementation must be split into independently revertible stages

Future implementation shall use at least these ordered commits/gates:

1. workspace/toolchain;
2. leaf/foundation/protocol/contracts;
3. minimal runtime/session create-read smoke;
4. private Node bridge and TypeScript capture adapter;
5. boundary/regression evidence and final task-state projection.

Each stage must compile/test its owned boundary and remain independently revertible. A single all-in-one implementation commit is prohibited.

### RKP1-R007 — Resource, compatibility and rollback gates are explicit

The bridge enforces a 64 MiB request and response ceiling, depth `64`, captured property/node count `1,048,576`, safe-integer numeric contracts, and deterministic canonical encoding. The Node crate is exactly a `cdylib`; lock generation, Windows debug build, `.dll` source, `.node` destination, literal copy, load/export probes and clean-clone smoke are fixed in `design.md`/`implement.md`. RKP-1 native qualification is explicitly limited to Windows `x86_64-pc-windows-msvc`; Linux, macOS, Windows GNU and ARM native artifact/load qualification are excluded and require a later reviewed plan. RKP-1 measures request/response bytes for the smoke path but does not run official performance qualification. Any failure before RKP-8 leaves TypeScript default; RKP-1 rollback removes only its isolated Rust/bridge additions and restores the accepted planning base behavior.

### RKP1-R008 — Future implementation is closed to an exact allowlist

Only the exact paths in `research/file-test-and-rollback-matrix.md` may change during later implementation. The accepted 39 paths remain unchanged; this repair proposes exactly one additional existing test path, `test/core-kernel/cvn-7-qualification-boundary.test.ts`, solely for the frozen historical-interval assertion. The resulting allowlist is exactly 40 literal paths. New sibling files, directory wildcards, changes to unrelated Trellis authority, archived tasks, Product Host, any other existing test, or RKP-2+ paths require another returned planning repair and review.

### RKP1-R009 — Planning and implementation evidence are separate

Phase A validates only the docs-only candidate against Trellis/JSON/JSONL/hierarchy/diff/typecheck/build/full `531/531` and zero protected delta. Future implementation adds Cargo/MSRV/feature/workspace law, Rust unit tests, native smoke, hostile boundary tests and full TypeScript regression. Neither local self-audit is an independent review or lifecycle acceptance.

This bounded repair validates only docs and task state relative to `669364128cd4402a478f247393908ff170112794`: Trellis, JSON/JSONL, related-path/unique hierarchy, literal planning-repair allowlist, `git diff --check`, and zero `src/**`, `test/**`, Cargo/package/tsconfig production delta. The pre-repair `541/542` remains evidence, not a pass. After independent planning rereview and later implementation authorization, the two-test repair with one allowlist addition must be followed by focused CVN-7/RKP-1 tests, full `542/542`, typecheck/build, and the frozen Rust/Node/Windows gates before implementation review.

### RKP1-R010 — CVN-7 production-drift proof is a closed historical interval

The future historical assertion repair must prove only the immutable CVN-7 range `38afdc3fd508dc67f7aa446fd323837a5d550b70..b21540fa3636e6c8e827ff24c2099f4ff331285d`. It must:

- verify both frozen objects exist as commits and the base is an ancestor of the final head;
- pass both commits explicitly to `git diff --name-only` before `-- src package-lock.json tsconfig.json` and require empty output;
- never use `HEAD`, an omitted upper revision, the index, or working-tree state as the upper bound;
- leave RKP-1's reviewed `src/core-kernel/native/rust-kernel-smoke.ts` entirely outside CVN-7's historical interval and authority;
- preserve CVN-7's `EVIDENCE_INVALID`/measurement-incomplete conclusion, qualification status, budgets and evidence, and preserve every RKP-1 public/default-runtime/DTO/failure contract.

The existing RKP-1 workspace-law test is already one of the original 39 paths. Future implementation must preserve `89115daedc623c0d35386a4a433cc7fd95215223` as the complete implementation-diff base and add a second pin for the independently accepted repaired-planning commit solely to read the repaired matrix. It must require allowlist size `40`, prove the original 39-path set plus exactly the one CVN-7 test addition, keep diff coverage over all A-E implementation paths, and include the CVN-7 test in the exact changed-runtime set. This is a direct regression update, not a second allowlist addition.

## Bounded planning-repair acceptance criteria

- [ ] `RKP1-BPR001`: exact repair entry `669364128cd4402a478f247393908ff170112794`, isolated branch and docs-only diff are recorded.
- [ ] `RKP1-BPR002`: base `38afdc3fd508dc67f7aa446fd323837a5d550b70` and final head `b21540fa3636e6c8e827ff24c2099f4ff331285d` exist and ancestry is exact.
- [ ] `RKP1-BPR003`: future implementation adds only `test/core-kernel/cvn-7-qualification-boundary.test.ts` to the original 39-path allowlist and freezes the closed-range command/no-`HEAD` law.
- [ ] `RKP1-BPR004`: child stays in progress and authorized but paused; implementation candidate is not ready and independent planning rereview remains pending.
- [ ] `RKP1-BPR005`: no production/test file changes in this planning commit; the pre-repair full result remains `541/542` with the exact sole failure.
- [ ] `RKP1-BPR006`: Trellis child/parent, JSON/JSONL, path/unique hierarchy, Markdown, allowlist, `git diff --check`, clean and staged-empty gates pass.

## Out of scope

- indexed `LiveScoreStore`, runtime handles/indices and full load/encode parity (RKP-2);
- real transaction overlay, ChangeSet, or any of the 28 command handlers (RKP-3);
- history, undo/redo, snapshots/events/replay/checkpoints (RKP-4);
- incremental validation, executable provider logic, WASM or real Extension Protocol preparation/execution (RKP-5);
- known inventory, private catalog/composition parity, gateway/migration or real/synthetic Instrument Plugin consumers (RKP-6);
- differential/performance qualification (RKP-7), default cutover (RKP-8), Qualification V2/oracle cleanup (RKP-9);
- Guitar/Piano/Bass, Product Host, Product Extension Host, Product ApplicationAssembly, Tauri, public plugins, persistence, layout, renderer, playback, export or `.bgp` physical format;
- archive, push, official measurement, Rust installation/download, or production implementation during Phase A.

## Original planning-candidate acceptance criteria (historical)

These criteria describe the independently passed original planning candidate and are retained as history. The active bounded-repair criteria are the `RKP1-BPR` items above; they do not reset the started task to planning or revoke prior authorization.

- [ ] `RKP1-PAC001`: task metadata and all required artifacts exist; status/authorization/review fields are exactly planning/false/false/pending.
- [ ] `RKP1-PAC002`: both accepted authority chains and exact commit pins are present and the base/ancestor is `463c851...`.
- [ ] `RKP1-PAC003`: exactly seven crates and one acyclic direct dependency graph are frozen with no optional eighth owner.
- [ ] `RKP1-PAC004`: toolchain `1.97.1`, MSRV `1.88.0`, Edition 2024, Resolver 3, Cargo lock/direct pin/feature/panic policies, Node-API v8, `cdylib`, Windows artifact/load commands and exact external direct versions are frozen.
- [ ] `RKP1-PAC005`: DTO codec ownership, exactly two free-function private native exports, closed `StableFailureV1`, exact create/read wrappers/eight-stage precedence, fixed 128-bit type tag, sole-file unsafe policy, exact wrap/tag/remove/finalizer ownership, owner-thread/environment opaque handle, non-blocking reentrancy/busy/poison handling, caps, panic suppression and no-leak rules are exact.
- [ ] `RKP1-PAC006`: TypeScript default, `brilliant-score-1`, `28/51/8/34/9` and RKP-0 oracle ownership are preserved.
- [ ] `RKP1-PAC007`: future implementation is split into five small stages with exact file allowlist, test matrix, rollback points and no RKP-2+ work.
- [ ] `RKP1-PAC008`: parent has exactly one current planning child, no current implementation child, and RKP-1 start remains false.
- [ ] `RKP1-PAC009`: Trellis, JSON/JSONL, path existence, unique hierarchy, Markdown fences and `git diff --check` pass.
- [ ] `RKP1-PAC010`: `npm.cmd run typecheck`, `npm.cmd run build`, and clean-candidate full `531/531` pass.
- [ ] `RKP1-PAC011`: relative to `463c851...`, `src/**`, `test/**`, `package*.json`, `tsconfig*.json`, `Cargo*`, `rust-toolchain.toml`, and `crates/**` have zero delta.
- [ ] `RKP1-PAC012`: status-sync `7174c5ac50655ae0cb8807e21c7045a0c1b6d15e` is a direct child of `463c851...`; the amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`; preserved `b619f240...` remains the untouched sibling of `7174c5a...`. The two-commit r1 branch is clean and returned as `TARGETED PLANNING REREVIEW REQUIRED`; no start/archive/push/implementation occurs.

## Future implementation exit criteria

- [ ] `RKP1-IAC001`: exact seven-member workspace builds locked on toolchain `1.97.1` and checks on MSRV `1.88.0`.
- [ ] `RKP1-IAC002`: crate direct dependencies/features match the frozen graph and all forbidden-edge checks pass.
- [ ] `RKP1-IAC003`: strict DTO round-trip, extra/missing/duplicate/trailing/over-cap/depth/property/safe-integer rejection, exact failure bytes/keys/eight-stage precedence and deterministic success bytes pass.
- [ ] `RKP1-IAC004`: the exact Windows MSVC debug `.dll` exists, is copied by literal path to the exact `.node`, both `process.dlopen` and `require` load it, exactly two exports exist, and the same native smoke passes from a clean clone without package-file changes.
- [ ] `RKP1-IAC005`: native create/read returns an opaque owner-bound handle, document ID, version `0`, clean history/dirty state and a detached immutable full snapshot; unsafe scan, fixed-tag rollback, remove-wrap non-`napi_ok`, `napi_ok`+mismatched-pointer/no-unknown-pointer-touch, four-state transition, matching-generation finalizer-once, token/envelope-drop-once, strict-two-export, wrong-thread, wrong-environment, reentrant-no-hang, busy, poison, unknown/stale and event/observable-zero-delta tests pass without status/identity leakage.
- [ ] `RKP1-IAC006`: panic injection maps to exact `StableFailureV1` bytes while suppressing message/path/backtrace leakage; no panic unwinds into Node.
- [ ] `RKP1-IAC007`: TypeScript public/default surfaces and exact `28/51/8/34/9` manifest remain unchanged; full regression passes.
- [ ] `RKP1-IAC008`: implementation diff is an exact allowlist subset, staged commits are independently revertible, TypeScript remains default and independent implementation review is still required before acceptance/archive.
