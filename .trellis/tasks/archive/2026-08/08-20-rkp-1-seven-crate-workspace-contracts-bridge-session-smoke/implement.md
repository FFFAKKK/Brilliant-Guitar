# Implementation Plan — RKP-1 Seven-Crate Workspace Contracts Bridge Session Smoke

## Original stop gate before implementation (historical)

This original gate was satisfied by independent planning PASS at `89115daedc623c0d35386a4a433cc7fd95215223` and later user implementation authorization. It is retained to preserve the lifecycle record; the active gate is the bounded-repair pause below.

At implementation start, record the accepted planning commit, verify it descends from `463c851...`, verify the worktree is clean, then and only then run `python .\.trellis\scripts\task.py start 08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke`.

## Current bounded planning-repair pause

The original planning gate passed and Stages A-D were implemented. Stage E stopped at candidate `669364128cd4402a478f247393908ff170112794` with a clean full result of `541/542`: the sole failure is the CVN-7 zero-production-drift assertion's omitted upper revision. This planning repair does not rerun `task.py start`, modify code/tests, or resume Stage E. Keep `status=in_progress`, both prior authorizations true, `implementation_paused_for_bounded_planning_repair=true`, `implementation_candidate_ready=false`, and `independent_planning_rereview=pending` until an independent planning rereview passes and the user explicitly resumes implementation.

The only newly authorized implementation path is the existing file `test/core-kernel/cvn-7-qualification-boundary.test.ts`. Add one literal final-head constant `b21540fa3636e6c8e827ff24c2099f4ff331285d`; keep the literal base `38afdc3fd508dc67f7aa446fd323837a5d550b70`; verify both commit objects exist and base ancestry; and pass both revisions to the historical `git diff --name-only` assertion. The already-authorized `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` must receive the direct regression update: retain original planning head `89115daedc623c0d35386a4a433cc7fd95215223` as the complete implementation-diff base, add the accepted repaired-planning commit as a separate matrix-source pin, require exactly 40 allowlist paths, prove the set addition is only the CVN-7 test, and add that test to the expected runtime change set. Do not shrink diff coverage to the repaired-planning commit, use `HEAD` as the CVN-7 interval upper bound, omit the upper revision, modify any CVN-7 evidence/budget/qualification behavior, or touch RKP-1 production/public contracts.

## Stage 1 — Workspace and toolchain

Create only root `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `rustfmt.toml`, seven crate manifests, seven minimal `src/lib.rs` files, the safe empty Node `src/boundary.rs` stub and the Node `build.rs` from the exact allowlist.

Freeze seven members/default-members, Edition 2024, Resolver 3, toolchain/MSRV, direct pins, lints, panic and features exactly as designed. The Node manifest must contain exactly `[lib] crate-type=["cdylib"]`, default feature `node-api-v8`, and no other crate type or Node-API feature. The six non-Node roots use `#![forbid(unsafe_code)]`; the Node root uses `#![deny(unsafe_code)]`, `#![deny(unsafe_op_in_unsafe_fn)]` and exactly `#[allow(unsafe_code)] mod boundary;`, while `boundary.rs` denies unsafe operations in unsafe functions. Do not add behavior or TypeScript files.

Gate:

```powershell
rustc +1.97.1 --version
cargo +1.97.1 --version
cargo +1.97.1 generate-lockfile --manifest-path Cargo.toml
cargo +1.97.1 metadata --manifest-path Cargo.toml --locked --no-deps --format-version 1
cargo +1.97.1 check --manifest-path Cargo.toml --workspace --all-targets --all-features --locked
cargo +1.97.1 check --manifest-path Cargo.toml --workspace --all-targets --no-default-features --locked
cargo +1.97.1 clippy --manifest-path Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
cargo +1.97.1 fmt --all -- --check
cargo +1.88.0 check --manifest-path Cargo.toml --workspace --all-targets --locked
```

Commit boundary: `build(rust): establish locked seven-crate workspace`. Rollback: revert only this commit.

## Stage 2 — Leaf, foundation, protocol and contracts

Implement Core Types primitives/bounded JSON, structural Foundation DTOs, data-only Extension Protocol contracts, top-level Kernel create/read DTOs and strict canonical byte codecs. Add unit tests inside owned source files; do not create Runtime/Session behavior or Node exports.

Gate:

```powershell
cargo +1.97.1 test --manifest-path Cargo.toml -p brilliant-core-types -p brilliant-score-foundation -p brilliant-extension-protocol -p brilliant-kernel-contracts --locked
cargo +1.97.1 test --manifest-path Cargo.toml --workspace --doc --locked
cargo +1.97.1 clippy --manifest-path Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
cargo +1.97.1 fmt --all -- --check
```

Required cases: exact success round-trip; every `StableFailureV1` variant exact bytes and exact key allowlist; missing/extra/duplicate/trailing fields; wrong API/protocol/schema versions; invalid UTF-8/JSON; safe-integer, depth, property and 64 MiB boundaries; all adjacent-stage multi-fault precedence pairs; canonical two-generation bytes; lexical bounded JSON keys; no raw decoder/native message; decoded outputs detached and immutable in the private TypeScript boundary.

Commit boundary: `feat(rust): freeze core and kernel DTO contracts`. Rollback: revert this commit; Stage 1 remains a compilable empty workspace.

## Stage 3 — Minimal Runtime and Session smoke

Implement the immutable Runtime holder, revision `0`, and `KernelSession::create` / `read_state`. Do not implement indices, mutation, handlers, history, events, validation, gateway or plugin execution.

Gate:

```powershell
cargo +1.97.1 test --manifest-path Cargo.toml -p brilliant-kernel-runtime -p brilliant-kernel-session --locked
cargo +1.97.1 test --manifest-path Cargo.toml --workspace --all-targets --locked
cargo +1.97.1 clippy --manifest-path Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
```

Required cases: canonical create/read; detached input ownership; exact full snapshot equality; `undoDepth=0`, `redoDepth=0`, `dirty=false`, version `0`; rejected create yields no session; no Runtime mutable API or dependency edge outside the graph.

Commit boundary: `feat(rust): add minimal kernel session create-read smoke`. Rollback: revert this commit; contract crates remain accepted independently.

## Stage 4 — Private Node bridge

Implement `brilliant-kernel-node` buffer exports, N-API v8 type-tagged opaque synchronized handle, private owner environment/thread/lifecycle metadata, pre-lock validation, thread-local reentrancy guard, non-blocking `try_lock`, scoped panic hook/guard and private TypeScript capture/parse/freeze adapter. The adapter is not re-exported and no default factory changes. It must not cache semantic state or add a third export/test hook.

All handwritten unsafe is owned only by `crates/brilliant-kernel-node/src/boundary.rs`; `lib.rs` calls its safe wrappers. Freeze the tag to `TypeTag { lower: 0x4252_494c_4c49_414e, upper: 0x545f_524b_5031_5f31 }`. Creation first completes the unpublished result, proves its allocation/generation key fresh and performs `HashMap::try_reserve(1)` as the complete table-capacity preflight while the guard is `PreWrapOwned`; it retains that table guard/reserved slot across the non-callback wrap/tag calls. The only production sequence is `napi_wrap` with the unique finalizer -> `tag_object` -> final infallible exact entry insertion -> return. Read must call `validate_type_tag` before `napi_unwrap`, token dereference or table lookup. `wrap_and_tag`, `napi_add_finalizer`, `#[napi]` class/struct/constructor/method forms, handwritten JS wrappers and any additional runtime export are prohibited. Every explicit unsafe block has an adjacent `// SAFETY:` invariant; `#![deny(unsafe_op_in_unsafe_fn)]` remains active.

Implement the guard as the closed state enum `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released`. A failed `napi_wrap` leaves the guard sole owner and it drops the expected token once. A successful `napi_wrap` immediately transfers sole token release to the registered finalizer; the guard retains only a non-owning expected address. On tag failure, initialize the remove out pointer to null, call `napi_remove_wrap`, then inspect `napi_status` first. `napi_ok` cancels finalization and transfers expected-token ownership to `RemovedGuardOwns`: equal returned/expected addresses release expected once; mismatch/null never dereferences or frees the returned unknown pointer, still releases expected once, and returns `bridge.internal`. Non-`napi_ok` leaves `WrappedFinalizerOwns`: do not read/touch the out pointer or release expected; drop only the uninserted pending table `Arc`, publish nothing and let the finalizer release token/envelope. The finalizer removes only a still-present entry whose allocation identity and generation both match, never a new generation/different handle, then performs the sole token drop. No rollback adds a `StableFailureV1` code or changes eight-stage precedence.

Gate:

```powershell
cargo +1.97.1 test --manifest-path Cargo.toml -p brilliant-kernel-node --all-features --locked
cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked
$nativeSource = 'target\x86_64-pc-windows-msvc\debug\brilliant_kernel_node.dll'
$nodeTarget = 'target\rkp-1-node\brilliant_kernel_node.node'
if (-not (Test-Path -LiteralPath $nativeSource -PathType Leaf)) { throw 'missing RKP-1 native DLL' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $nodeTarget) | Out-Null
Copy-Item -LiteralPath $nativeSource -Destination $nodeTarget
if (-not (Test-Path -LiteralPath $nodeTarget -PathType Leaf)) { throw 'missing RKP-1 .node copy' }
if ([IO.Path]::GetExtension($nodeTarget) -cne '.node') { throw 'invalid RKP-1 addon suffix' }
node -e "const path=require('node:path');const holder={exports:{}};process.dlopen(holder,path.resolve('target/rkp-1-node/brilliant_kernel_node.node'));const k=Object.keys(holder.exports).sort();if(k.length!==2||k.join(',')!=='createKernelSessionV1,readKernelSessionV1')throw new Error('unexpected native exports')"
node -e "const b=require('./target/rkp-1-node/brilliant_kernel_node.node');const k=Object.keys(b).sort();if(k.length!==2||k.join(',')!=='createKernelSessionV1,readKernelSessionV1')throw new Error('unexpected native exports')"
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js
```

Required cases: native create/read round-trip; exact success/rejection wrappers; absent handle on rejection; over-cap/invalid UTF-8/exact-shape/precedence failures; hostile getter/Proxy/sparse/cycle capture without property reads; detached/frozen output; opaque non-enumerable fixed-tag handle; preflight/reserve failure before wrap; `napi_wrap` failure with one guard release; tag failure before last-step insertion; injected `napi_remove_wrap` non-`napi_ok`; injected `napi_ok` plus mismatched/null returned pointer; wrong kind/tag causes no table lookup or mutation; validate-before-unwrap/dereference; GC invokes the unique finalizer path once; matching-generation-only table removal, token drop and envelope release each occur exactly once with no double-free/leak; unknown/stale/wrong-environment/wrong-thread; same-handle reentrant call returns immediately without hang; `WouldBlock` busy and poison mapping; rejected calls preserve exact event/session/observable zero delta. For non-`napi_ok`, out-pointer read/compare/dereference/free counters are all zero and finalizer/guard-token-release are `1/0`; for `napi_ok` mismatch, address-compare is one, unknown-pointer dereference/free are `0/0`, and finalizer/guard-token-release are `0/1`. Both require token/envelope drops `1/1`, table absent, no hang/leak and no tag/status/thread/environment/generation/pointer leakage; exactly two free-function raw native exports remain.

Repeat the same procedure from a clean clone without adding a package script or modifying `package*.json`/`package-lock.json`:

```powershell
$rkp1Candidate = git rev-parse HEAD
$rkp1SmokeRoot = Join-Path ([IO.Path]::GetTempPath()) ('bg-rkp1-native-' + [guid]::NewGuid().ToString('N'))
git clone --no-local . $rkp1SmokeRoot
git -C $rkp1SmokeRoot checkout --detach $rkp1Candidate
Push-Location $rkp1SmokeRoot
try {
  cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked
  $nativeSource = 'target\x86_64-pc-windows-msvc\debug\brilliant_kernel_node.dll'
  $nodeTarget = 'target\rkp-1-node\brilliant_kernel_node.node'
  if (-not (Test-Path -LiteralPath $nativeSource -PathType Leaf)) { throw 'missing clean-clone RKP-1 native DLL' }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $nodeTarget) | Out-Null
  Copy-Item -LiteralPath $nativeSource -Destination $nodeTarget
  if (-not (Test-Path -LiteralPath $nodeTarget -PathType Leaf)) { throw 'missing clean-clone RKP-1 .node copy' }
  if ([IO.Path]::GetExtension($nodeTarget) -cne '.node') { throw 'invalid clean-clone RKP-1 addon suffix' }
  node -e "const path=require('node:path');const holder={exports:{}};process.dlopen(holder,path.resolve('target/rkp-1-node/brilliant_kernel_node.node'));const k=Object.keys(holder.exports).sort();if(k.length!==2||k.join(',')!=='createKernelSessionV1,readKernelSessionV1')throw new Error('unexpected native exports')"
  node -e "const b=require('./target/rkp-1-node/brilliant_kernel_node.node');const k=Object.keys(b).sort();if(k.length!==2||k.join(',')!=='createKernelSessionV1,readKernelSessionV1')throw new Error('unexpected native exports')"
  npm.cmd ci --ignore-scripts
  npm.cmd run typecheck
  npm.cmd run build
  node --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js
  if (git status --porcelain) { throw 'clean-clone smoke left tracked delta' }
}
finally {
  Pop-Location
}
```

This is the complete RKP-1 platform decision: Windows `x86_64-pc-windows-msvc` debug only. Do not infer or implement Linux/macOS, Windows GNU, ARM or release-artifact loading in this stage.

Commit boundary: `feat(rust): prove private Node session bridge smoke`. Rollback: revert this commit; Rust session remains testable without Node.

## Stage 5 — Boundary and regression evidence

Add/complete workspace-law and compatibility tests, re-read the RKP-0 manifest, record stage hashes/results in task handoff/review files and update only the Rust parent current gate. Do not change any authority body or create RKP-2.

Gate:

```powershell
python .\.trellis\scripts\task.py validate 08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
cargo +1.97.1 metadata --manifest-path Cargo.toml --locked --no-deps --format-version 1
cargo +1.97.1 test --manifest-path Cargo.toml --workspace --all-targets --all-features --locked
cargo +1.97.1 clippy --manifest-path Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
cargo +1.97.1 fmt --all -- --check
cargo +1.88.0 check --manifest-path Cargo.toml --workspace --all-targets --locked
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
git diff --check 463c8514a61a61a39c8a5d2736261ae9e82b0fba..HEAD
```

Also mechanically validate exact changed-path allowlist, exact seven members/direct edges/features/pins/`cdylib`, the fixed Windows artifact and two loader probes, all `StableFailureV1` codes/keys/precedence, owner-thread/reentrant/try-lock tests, no public TS export drift, `28/51/8/34/9`, schema `brilliant-score-1`, and absence of RKP-2 through RKP-9 tasks. The workspace-law test parses/scans all changed Rust sources and proves: the six exact non-Node roots contain their required `forbid(unsafe_code)` attributes; Node root contains its two denies and only `#[allow(unsafe_code)] mod boundary;`; explicit unsafe blocks/functions/impls/traits/extern blocks occur only in `boundary.rs`; each block has an adjacent `SAFETY` comment; production call expressions have exactly one site each for `napi_wrap`, `tag_object`, `validate_type_tag`, `napi_unwrap`, `napi_remove_wrap` and `Box::from_raw`, with any raw-pointer dereference confined to the same file; there is no `#[napi]` class/struct/constructor/method surface; and the built addon exposes exactly the two frozen free functions.

Commit boundary: `test(rust): lock RKP-1 bridge and compatibility gates`. Rollback: revert this evidence/state commit independently; Stage 4 code remains testable.

### Stage 5a — Historical CVN-7 assertion repair after planning rereview

This substage is blocked until the docs-only repair receives independent planning PASS and the user resumes implementation. Then modify exactly two existing test paths: the newly added `test/core-kernel/cvn-7-qualification-boundary.test.ts` and the already-authorized `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts`:

1. retain the exact base `38afdc3fd508dc67f7aa446fd323837a5d550b70`;
2. add exact final CVN-7 input/head `b21540fa3636e6c8e827ff24c2099f4ff331285d`;
3. assert `git cat-file -e <commit>^{commit}` succeeds for both values;
4. assert `git merge-base --is-ancestor <base> <final-head>` succeeds;
5. call `git diff --name-only <base> <final-head> -- src package-lock.json tsconfig.json` and require empty output;
6. leave every other CVN-7 assertion and all production files byte-unchanged;
7. keep `89115daedc623c0d35386a4a433cc7fd95215223` as the implementation-diff base, add the independently accepted repaired-planning commit only as the repaired-matrix source, assert allowlist size `40`, prove the set difference from the original 39 is exactly the CVN-7 test, and include that test in the exact runtime-path projection.

Focused and resumed final gate:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/cvn-7-qualification-boundary.test.js
node --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js dist/test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.js
npm.cmd test
cargo +1.97.1 test --manifest-path Cargo.toml --workspace --all-targets --all-features --locked
cargo +1.97.1 clippy --manifest-path Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
cargo +1.97.1 fmt --all -- --check
cargo +1.88.0 check --manifest-path Cargo.toml --workspace --all-targets --locked
```

The full TypeScript expectation after implementation is exactly `542/542`. Repeat the frozen Windows `.dll -> .node` build/copy/`process.dlopen`/`require`/two-export and clean-clone gates from Stage 4, then rerun Trellis/JSON/JSONL/40-path/protected-delta/clean checks. Commit boundary: `test(cvn-7): freeze historical production-drift interval`. Rollback: revert this two-test repair commit; the pre-repair `541/542` blocker returns without changing Stages A-D or CVN-7 evidence.

## Future implementation review gate

After the planning repair passes rereview, Stage 5a and the resumed full gates pass, stop with `IMPLEMENTATION REVIEW REQUIRED`. An independent read-only auditor must review the exact implementation range and return `P0/P1/P2=0/0/0`. A technical PASS is not permission to switch default runtime, create RKP-2, accept/archive, push or run official qualification.

## Exact scope control

The only permissible implementation files are the 40 paths enumerated one-by-one in `research/file-test-and-rollback-matrix.md`: the original 39 plus only `test/core-kernel/cvn-7-qualification-boundary.test.ts`. If another path is needed, stop and return the planning task for another bounded repair and independent rereview. Do not widen by directory, glob or convenience refactor.
