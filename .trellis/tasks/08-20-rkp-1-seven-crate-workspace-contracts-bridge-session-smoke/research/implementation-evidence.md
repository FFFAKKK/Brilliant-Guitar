# RKP-1 Implementation Evidence

Status: `STAGES A-D COMPLETE / STAGE E REGRESSION GATE BLOCKED / BOUNDED PLANNING REPAIR REQUIRED`.

The final targeted planning audit passed P0/P1/P2=`0/0/0` for exact planning HEAD `89115daedc623c0d35386a4a433cc7fd95215223` in audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user then authorized implementation. Activation began from a clean worktree at that exact HEAD, created branch `codex/rkp-1-seven-crate-workspace-contracts-bridge-session-smoke`, and ran the Trellis start command. The child remains `in_progress`; implementation review is `pending`; TypeScript remains default; acceptance, archive, push, RKP-2+ creation, default cutover and official qualification remain unauthorized.

## Stage ledger and rollback points

| Boundary | Commit | Result | Independent rollback |
|---|---|---|---|
| Activation | `84918e1e293b26554fbff9f161c6222510f378b9` | planning PASS/user authorization/task start and sole parent child recorded | revert activation docs only |
| A workspace/toolchain | `6b64616690ddf9e11e71cf4caeb1b4be5df74b8d` | exact seven crates, Rust `1.97.1`, MSRV `1.88.0`, Edition 2024, Resolver 3, direct pins/features, lock and `cdylib` | removes the Rust workspace only |
| B contracts | `632ebcda54adba07c106984c16999cb84bc9bc2c` | Core Types/Foundation/Protocol/Contracts, strict codec and closed 22-variant `StableFailureV1` | leaves a compiling empty workspace |
| C runtime/session | `f5ca93c77e800465b65b947172fca1c9f8ee650f` | immutable revision-0 holder and native session create/read only | leaves all data contracts intact |
| D private Node bridge | `8ae5b7158ea45cfc4c47902ff8a17ce5c949678c` | two exports, fixed tag, opaque owner-bound handle, status-dependent four-state release, private TS adapter and Windows load smoke | leaves native Rust session tests intact |
| E boundary/regression | review HEAD (this commit, subject `test(rust): expose RKP-1 regression-gate conflict`) | workspace-law passes, but the complete TypeScript suite exposes an out-of-allowlist legacy CVN-7 assertion conflict; stage stopped | removes only the workspace-law test and blocked-state evidence |

## Implemented boundary

- Workspace membership is exactly the seven reviewed crates and direct project edges match the reviewed acyclic graph.
- Core Types owns bounded scalar/JSON/path primitives; Foundation owns structural `brilliant-score-1` DTOs; Protocol owns data-only descriptors; Contracts owns strict create/read codecs and all 22 stable failures.
- Runtime and Session expose only immutable create/read state with document version `0`, history `0/0` and `dirty=false`.
- The private Node addon exposes only `createKernelSessionV1` and `readKernelSessionV1`. It is a Windows MSVC debug `cdylib`; `src/core-kernel/native/rust-kernel-smoke.ts` is not re-exported and no default factory changed.
- `boundary.rs` is the sole handwritten unsafe owner. Production contains one call site each for `napi_wrap`, `tag_object`, `validate_type_tag`, `napi_unwrap`, `napi_remove_wrap` and `Box::from_raw`; every unsafe operation has an adjacent `SAFETY` invariant.
- Handle construction preflights fresh key/capacity before wrap, then performs wrap -> tag -> last infallible insertion. Release ownership is closed over `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released`; status is checked before the remove-wrap out pointer.
- The finalizer removes only the matching allocation+generation entry and releases the token/envelope once. Reads validate kind/tag/live generation/environment/thread/reentrancy before non-blocking session `try_lock`.

## Stage D native evidence

At exact Stage D commit `8ae5b7158ea45cfc4c47902ff8a17ce5c949678c`:

- source artifact: `target/x86_64-pc-windows-msvc/debug/brilliant_kernel_node.dll`;
- load artifact: `target/rkp-1-node/brilliant_kernel_node.node`;
- literal copy, `.node` suffix, `process.dlopen` and `require` all passed;
- both loaders observed exactly `createKernelSessionV1,readKernelSessionV1`;
- raw and private-adapter create/read smoke passed `6/6`;
- a `git clone --no-local` clean clone at `C:/Users/ATOM/AppData/Local/Temp/bg-rkp1-native-3a6df23f00e44bfc8bb69b0d9617bfea` passed native build/load, `npm ci --ignore-scripts`, typecheck, build and bridge `6/6`; tracked status and diff were empty afterward.

The first sandboxed clean-clone `npm ci` attempt hit Windows npm-cache `EPERM`; it is not counted. The same clone was rerun with strict exit checks and succeeded. Linux, macOS, Windows GNU, ARM and release artifacts remain unimplemented and unqualified.

## Stage E gate ledger and blocker

The following Stage E checks pass:

- Trellis child/parent validation, JSON/JSONL parse, related paths and unique parent/child reference;
- `cargo +1.97.1 metadata/check/test/clippy/fmt` plus `cargo +1.88.0 check`;
- fixed Windows artifact/copy/two-loader/two-export probes;
- `npm.cmd run typecheck` and `npm.cmd run build`;
- focused RKP-1 tests `11/11` (`6` Node bridge plus `5` workspace-law);
- audited 39-path allowlist subset, no protected package/tsconfig/public-index drift, no RKP-2 through RKP-9;
- exact RKP-0 inventories `28/51/8/34/9`, `brilliant-score-1`, TypeScript default and no public bridge export;
- Rust `29/29`, clippy with warnings denied, format, pinned `1.97.1` checks and MSRV `1.88.0` check;
- Windows MSVC debug build, literal `.dll -> .node` copy, `process.dlopen`, `require` and exact two-export probe.

The first complete `npm.cmd test` run reported `tests 542`, `pass 540`, `fail 2`. One failure was the expected clean-worktree lifecycle assertion while these Stage E files were uncommitted. The decisive remaining failure is `CVN7 qualification remains a zero-production-drift test-only boundary`: it runs `git diff --name-only 38afdc3... -- src package-lock.json tsconfig.json` and rejects the required reviewed path `src/core-kernel/native/rust-kernel-smoke.ts`.

After committing the Stage E gate record so the tracked tree was clean, the complete suite was rerun and reported exactly `tests 542`, `pass 541`, `fail 1`; the archived RKP-0 lifecycle test passed and the sole failure remained the same CVN-7 zero-production-drift assertion with actual path `src/core-kernel/native/rust-kernel-smoke.ts` versus expected empty output.

This is not repairable inside the accepted 39-path implementation allowlist. `test/core-kernel/cvn-7-qualification-boundary.test.ts` is an existing test explicitly frozen at zero delta by `research/file-test-and-rollback-matrix.md`, while `design.md` and `implement.md` explicitly require the private TypeScript adapter. Removing the adapter would violate the audited RKP-1 contract; changing the CVN-7 assertion would modify an unreviewed path. Stage E therefore stops here and requests a bounded planning repair that reconciles this legacy qualification-only invariant with authorized later production phases. No out-of-allowlist file was changed.

Stages A-D remain reproducible and independently revertible. This gate record is not an implementation review candidate, independent PASS, acceptance or archive authority.
