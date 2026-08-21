# RKP-1 Implementation Review Candidate

## Required verdict

Current status: `BOUNDED IMPLEMENTATION REPAIR ACTIVE / CANDIDATE NOT READY`.

The full implementation audit returned `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/4/0`, for exact candidate `efe3bbc9852aef2cf7949c3ae221218b1c2590dd` in task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. No rereview is requested until all four independently revertible repairs and the final gates pass.

## Active four-P1 repair scope

1. deterministic structural failure collection and canonical precedence/path selection;
2. request length rejection before allocation and truly capped response encoding;
3. remove-wrap/finalizer tests exercising the production ownership state machine;
4. `rustfmt` `newline_style = "Auto"` with both `core.autocrlf=true` and `false` detached-clone evidence.

The 40 implementation paths and seven accepted planning-only paths remain exact. TypeScript stays default; no acceptance, archive, push, official qualification or RKP-2 is authorized.

## Candidate boundary

- Original accepted planning authority: `89115daedc623c0d35386a4a433cc7fd95215223`.
- Pre-repair implementation evidence: `669364128cd4402a478f247393908ff170112794`, full `541/542` with one CVN-7 open-bound failure.
- Accepted bounded-repair planning authority: `b944876aefc2b359b459bb8565afa38c0635765b`, targeted planning rereview `PASS` P0/P1/P2=`0/0/0`, audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`.
- Implementation repair branch: `codex/rkp-1-cvn7-historical-boundary-implementation-repair`.
- Repair commits: `654578bded13b0f6da8b8c55cf71145f176d38f8`, then `0c1a1da966687f2faa366dc3bcb4915b8a790fc7`.
- Lifecycle: child `in_progress`; start and production authorization true; planning rereview passed; pause false; candidate ready true; implementation review pending; parent next gate `rkp1-independent-implementation-review`.

## Mandatory repair review

1. Confirm `test/core-kernel/cvn-7-qualification-boundary.test.ts` contains both literal commits, proves both commit objects and ancestry, and uses exactly two explicit revisions for the historical `src`/`package-lock.json`/`tsconfig.json` diff. It must not use `HEAD`, the index, working tree or an omitted upper bound.
2. Confirm CVN-7 evidence, `EVIDENCE_INVALID`/measurement-incomplete status, runner, budgets and qualification state did not change.
3. Confirm the workspace-law keeps `89115da...` as its candidate diff base and uses `b944876...` only to read the repaired matrix Git blob.
4. Confirm the original matrix is 39 literal unique paths, the repaired matrix is 40 literal unique existing paths, and the sole set addition is `test/core-kernel/cvn-7-qualification-boundary.test.ts`.
5. Confirm the exact runtime projection adds only that CVN-7 test and that the seven independently accepted planning-only authority paths are separated by exact names rather than a prefix/glob.
6. Confirm CRLF normalization changes only workspace-law text comparison portability and does not weaken source/unsafe/dependency assertions.

## Full implementation audit focus

1. Reproduce TypeScript typecheck/build/full `542/542`, focused Node bridge `6/6`, workspace-law `5/5`, and the two repaired source/compiled test paths.
2. Reproduce Rust `1.97.1` fmt/check/test (`29/29`), clippy `-D warnings`, and MSRV `1.88.0` locked check.
3. Reproduce Windows `x86_64-pc-windows-msvc` debug DLL-to-`.node`, `process.dlopen`, `require`, exact two exports and clean detached-clone `11/11` with tracked status empty.
4. Recheck exactly seven crates, dependency/features/toolchain/MSRV locks, `boundary.rs` sole unsafe ownership, 22 failure variants, opaque handle/finalizer/owner-thread/reentrancy contracts and no second state owner.
5. Recheck TypeScript default, schema `brilliant-score-1`, public `28/51/8/34/9`, no public native export, and zero package/tsconfig/default-runtime drift.
6. Recheck Trellis child/parent, JSON/JSONL/path/hierarchy, `git diff --check`, exact implementation allowlist projection, protected zero delta and clean/staged-empty status.
7. Confirm all exclusions remain absent: indexed store, handlers/transactions/history, incremental validation, provider/WASM, instruments, Product Host/Tauri/public plugins, default cutover, RKP-2+ and official qualification.

## Evidence status

`research/implementation-evidence.md` is local implementation evidence, not an independent verdict. The pre-repair `541/542` and post-repair `542/542` are recorded separately. The first global npm-cache `EPERM` clean-clone attempt is retained as non-passing environment evidence; the task-specific isolated-cache clean-clone rerun is the passing evidence.
