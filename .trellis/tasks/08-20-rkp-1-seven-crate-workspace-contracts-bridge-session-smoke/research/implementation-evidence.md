# RKP-1 Implementation Evidence

Status: `STAGES A-D COMPLETE / STAGE E BOUNDED REPAIR COMPLETE / IMPLEMENTATION REVIEW REQUIRED`.

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

## Bounded planning repair projection

The docs-only repair starts at exact clean candidate `669364128cd4402a478f247393908ff170112794` on branch `codex/rkp-1-cvn7-historical-boundary-planning-repair`. It freezes CVN-7 production-drift proof to base `38afdc3fd508dc67f7aa446fd323837a5d550b70` and final CVN-7 input/head `b21540fa3636e6c8e827ff24c2099f4ff331285d`. Local read-only probes establish that both commits exist, the base is an ancestor of the final head, and their closed-range diff over `src`, `package-lock.json`, and `tsconfig.json` is empty.

The proposed future implementation adds only `test/core-kernel/cvn-7-qualification-boundary.test.ts` to the original 39-path allowlist. It will make both revisions explicit, add commit-existence/ancestry assertions, and forbid `HEAD`, omitted upper revision, index or working-tree upper bounds. The already-allowed RKP-1 workspace-law test must preserve `89115da...` as the complete implementation-diff base, use the accepted repaired-planning commit only as the 40-path matrix source, and prove exact 39+1 membership. Both target tests and all production files remain unchanged in this planning commit.

The `541/542` result above remains the authoritative pre-repair evidence. It is not overwritten by the later repaired result.

## Bounded implementation repair

Targeted planning rereview passed P0/P1/P2=`0/0/0` for exact planning-repair HEAD `b944876aefc2b359b459bb8565afa38c0635765b` in audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user explicitly authorized implementation repair. Branch `codex/rkp-1-cvn7-historical-boundary-implementation-repair` was created from that exact clean HEAD.

The repair formed two narrow commits:

| Commit | Paths | Result / rollback |
|---|---|---|
| `654578bded13b0f6da8b8c55cf71145f176d38f8` | the CVN-7 boundary test and RKP-1 workspace-law test | freezes the closed historical interval and exact 39+1 allowlist; reverting restores the open-bound blocker |
| `0c1a1da966687f2faa366dc3bcb4915b8a790fc7` | RKP-1 workspace-law test only | normalizes CRLF text reads found by clean-clone testing; reverting restores checkout-sensitive source scans |

`test/core-kernel/cvn-7-qualification-boundary.test.ts` preserves base `38afdc3fd508dc67f7aa446fd323837a5d550b70`, adds final historical head `b21540fa3636e6c8e827ff24c2099f4ff331285d`, verifies both commit objects and ancestry, and passes both explicit revisions to the zero-production-drift diff. No `HEAD`, omitted upper bound, index or working-tree comparison remains in that assertion.

`test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` retains `89115daedc623c0d35386a4a433cc7fd95215223` as the candidate-diff base, pins `b944876...` only for reading the repaired matrix blob, proves the original 39 and repaired 40 literal paths are unique/existing, proves the sole set addition is the CVN-7 test, and includes that test in the exact runtime projection. Seven exact planning-only authority paths introduced by the independently accepted `6693641..b944876` docs range are separated from the implementation projection by literal name; no directory wildcard or unknown path is ignored.

## Post-repair gate ledger

- focused repaired CVN-7 plus workspace-law compiled tests: `32/32`;
- Node bridge plus workspace-law: `11/11` (`6/6` + `5/5`);
- `npm.cmd run typecheck` and `npm.cmd run build`: pass;
- complete `npm.cmd test`: exactly `542/542`, separately from pre-repair `541/542`;
- Rust toolchain: `rustc 1.97.1 (8bab26f4f 2026-07-14)`, Cargo `1.97.1`;
- `cargo +1.97.1 fmt --all -- --check`, workspace locked check and test: pass; Rust unit total `29/29`;
- `cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings`: pass;
- MSRV `rustc 1.88.0 (6b00bc388 2025-06-23)` workspace/all-targets/locked check: pass;
- Windows MSVC debug source DLL exists, literal copy to `.node` succeeds, and `process.dlopen` plus `require` each expose exactly `createKernelSessionV1,readKernelSessionV1`;
- fresh detached clone at `0c1a1da966687f2faa366dc3bcb4915b8a790fc7` passes native build/load, isolated-cache `npm ci`, typecheck, build and `11/11`; tracked status is empty.

The first clean-clone `npm ci` attempts against the shared Windows npm cache failed `EPERM` while statting one cache object. They are retained as non-passing environment evidence. A task-specific cache outside the clone removed the contention; the clean-clone repository and tracked files were not modified. The first isolated-cache run then found CRLF-sensitive workspace-law comparisons, producing `9/11`; the authorized workspace-law-only follow-up fixed that portability defect, and a new clean clone at `0c1a1da...` passed `11/11` with tracked status empty.

No `src/**`, `crates/**`, Cargo/package/tsconfig or other test path changed in this bounded repair. CVN-7 evidence, qualification state, budgets and runner are unchanged; TypeScript remains default; public `28/51/8/34/9` and `brilliant-score-1` remain exact. The candidate stays `in_progress` with implementation review pending. This ledger is not acceptance, archive, push, official qualification or RKP-2 authority.
