# RKP-1 Accepted Implementation Review

## Final verdict

Current status: `RKP-1 IMPLEMENTATION TECHNICALLY ACCEPTABLE FOR OWNER CLOSEOUT`.

Independent auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7` returned final P0/P1/P2=`0/0/0` for exact audited implementation commit `94387b339b5e4d9ce6b7f97597a1b56edd051f01`. That commit remains the technical candidate boundary; this document and later archive/journal commits are lifecycle-only and do not claim renewed technical audit coverage.

## Completed Codec linear-bound repair

- Branch: `codex/rkp-1-codec-linear-bound-repair`, exact base `8fe02932fa7b5eb81b6f0cd56d1776ba9287c709`.
- State freeze commit: `310baf4471b967230fc7aa1178cc00a711b3f527`; independently revertible Codec/test commit: `e8d496d75a25553132a135e23d99c80b167b6a49`.
- Implementation review and rereview are `passed`; candidate readiness remains true as accepted historical evidence.
- Owner paths remain inside the existing 40-path matrix: Contracts Codec, existing direct tests and existing evidence/state files only.
- The prior cap, remove-wrap, checkout, 22-failure, exact-two-export and TypeScript-default contracts did not move.
- Reproduce the Rust 20k unique/duplicate instrumentation, four-slot high-water, post-property-limit zero-retention and later-depth-wins cases. Reproduce real-addon 5k/10k/20k medians with adjacent ratio `<3.25`, endpoint ratio `<8.5`, and 30-second timeout.

## Active four-P1 repair scope

1. deterministic structural failure collection and canonical precedence/path selection;
2. request length rejection before allocation and truly capped response encoding;
3. remove-wrap/finalizer tests exercising the production ownership state machine;
4. `rustfmt` `newline_style = "Auto"` with both `core.autocrlf=true` and `false` detached-clone evidence.

The 40 implementation paths and seven accepted planning-only paths remain exact. TypeScript stays default. Owner acceptance and archive are authorized for this closeout; push, official qualification, default cutover and RKP-2 creation/activation are not authorized.

## Candidate boundary

- Original accepted planning authority: `89115daedc623c0d35386a4a433cc7fd95215223`.
- Pre-repair implementation evidence: `669364128cd4402a478f247393908ff170112794`, full `541/542` with one CVN-7 open-bound failure.
- Accepted bounded-repair planning authority: `b944876aefc2b359b459bb8565afa38c0635765b`, targeted planning rereview `PASS` P0/P1/P2=`0/0/0`, audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`.
- Rejected full implementation candidate: `efe3bbc9852aef2cf7949c3ae221218b1c2590dd`.
- Four-P1 repair branch: `codex/rkp-1-four-p1-bounded-implementation-repair`.
- Repair-state commit: `513b32113d7a3a814c98002dfb809ff469b2ab48`.
- Independently revertible code commits: `05ada5cb631508c1d27fb0f833ed155e24f0894f`, `009c086822eefa5f3b898fc5f4bd646ecaacdbc0`, `a8ceed5b27fd68ca53b4c5947039184f3d9e8637`, `47f80198155a2bb896206dd575b008c7180d0d74`.
- Lifecycle before the native archive command: child `in_progress`; start and production authorization retain their true historical values; implementation review/rereview passed; repair inactive; candidate ready true; archive authorized; parent next gate `rkp2-planning-creation`, with no RKP-2 task created or started.

## Mandatory historical-boundary repair review

1. Confirm `test/core-kernel/cvn-7-qualification-boundary.test.ts` contains both literal commits, proves both commit objects and ancestry, and uses exactly two explicit revisions for the historical `src`/`package-lock.json`/`tsconfig.json` diff. It must not use `HEAD`, the index, working tree or an omitted upper bound.
2. Confirm CVN-7 evidence, `EVIDENCE_INVALID`/measurement-incomplete status, runner, budgets and qualification state did not change.
3. Confirm the workspace-law keeps `89115da...` as its candidate diff base and uses `b944876...` only to read the repaired matrix Git blob.
4. Confirm the original matrix is 39 literal unique paths, the repaired matrix is 40 literal unique existing paths, and the sole set addition is `test/core-kernel/cvn-7-qualification-boundary.test.ts`.
5. Confirm the exact runtime projection adds only that CVN-7 test and that the seven independently accepted planning-only authority paths are separated by exact names rather than a prefix/glob.
6. Confirm CRLF normalization changes only workspace-law text comparison portability and does not weaken source/unsafe/dependency assertions.

## Mandatory four-P1 rereview

1. Reproduce reversed-key, duplicate+number, depth+number, property+shape, shape+number and adjacent-stage exact-byte cases. Confirm the complete bounded walk and canonical path ranking do not depend on source member order, and Foundation failure paths are nested and static.
2. Confirm Node Buffer length is checked before `to_vec` or equivalent full copy and the cap+1 copy counter remains zero. Confirm response serialization counts complete output while retained bytes never exceed `67108864`, preserves in-cap bytes and reports exact cap+1 actual bytes.
3. Confirm `rollback_failed_tag_with_ops` is the production path called by the real N-API wrapper and the Rust-only ops seam adds no Node export. Reproduce expected/null/mismatch/non-ok with real Box/Arc/Weak/table/drop probes and verify exactly-one owner/finalizer release and matching-generation table removal.
4. Run the JS `--expose-gc` FinalizationRegistry journey and confirm the addon still exposes exactly two free functions. Recheck the workspace-law production call-site count and sole unsafe owner.
5. Confirm `rustfmt.toml` locks `Auto`, workspace-law still normalizes scans to LF without weakening unsafe checks, and fresh `core.autocrlf=true` and `false` detached clones both pass fmt while exhibiting CRLF and LF working-tree bytes respectively.

## Full implementation audit focus

1. Reproduce TypeScript typecheck/build/full discovered count reported out of band, focused Node bridge `8/8` under `--expose-gc`, workspace-law `5/5`, and the two repaired source/compiled test paths.
2. Reproduce Rust `1.97.1` fmt/check/test (`38/38`), clippy `-D warnings`, and MSRV `1.88.0` locked all-targets check.
3. Reproduce Windows `x86_64-pc-windows-msvc` debug DLL-to-`.node`, `process.dlopen`, `require`, exact two exports and clean detached-clone create/read with tracked status empty.
4. Recheck exactly seven crates, dependency/features/toolchain/MSRV locks, `boundary.rs` sole unsafe ownership, 22 failure variants, opaque handle/finalizer/owner-thread/reentrancy contracts and no second state owner.
5. Recheck TypeScript default, schema `brilliant-score-1`, public `28/51/8/34/9`, no public native export, and zero package/tsconfig/default-runtime drift.
6. Recheck Trellis child/parent, JSON/JSONL/path/hierarchy, `git diff --check`, exact implementation allowlist projection, protected zero delta and clean/staged-empty status.
7. Confirm all exclusions remain absent: indexed store, handlers/transactions/history, incremental validation, provider/WASM, instruments, Product Host/Tauri/public plugins, default cutover, RKP-2+ and official qualification.

## Evidence status

The independent verdict applies exactly to `94387b339b5e4d9ce6b7f97597a1b56edd051f01`: Rust `40/40`; Contracts/Foundation `16/16`; Windows dual-loader smoke; dedicated `--expose-gc` `9/9`; workspace-law `6/6`; TypeScript `545` passed, one expected ordinary-run GC skip and zero failed; clean `core.autocrlf=true/false` clones; exact 40 implementation plus seven accepted planning-only paths; clean worktree and empty staging.

Phase 3.3 decision: this closeout adds no `.trellis/spec/**` rule. RKP-1-specific rules remain authoritative in the archived task and are inputs to future RKP-2 planning. Any later promotion into active specifications requires a separate docs-only authority/spec-sync task and must not be folded into this closeout.
