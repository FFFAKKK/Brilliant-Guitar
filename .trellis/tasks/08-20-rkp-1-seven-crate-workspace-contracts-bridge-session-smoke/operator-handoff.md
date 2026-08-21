# RKP-1 Operator Handoff

## Current status

`IMPLEMENTATION CANDIDATE / IMPLEMENTATION REVIEW REQUIRED`.

The bounded-repair planning candidate `b944876aefc2b359b459bb8565afa38c0635765b` received independent targeted planning rereview `PASS`, P0/P1/P2=`0/0/0`, in audit task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user then authorized the bounded implementation repair on branch `codex/rkp-1-cvn7-historical-boundary-implementation-repair`.

The child remains `in_progress`, `task_start_run=true`, `production_implementation_authorized=true`, `implementation_paused_for_bounded_planning_repair=false`, `implementation_candidate_ready=true`, `independent_planning_rereview=passed`, and `implementation_review=pending`. TypeScript remains the product default. Acceptance, archive, push, official CVN-7 measurement, default cutover and RKP-2+ creation remain unauthorized.

## Commit chain and rollback points

1. original planning authority: `89115daedc623c0d35386a4a433cc7fd95215223`;
2. activation: `84918e1e293b26554fbff9f161c6222510f378b9`;
3. workspace/toolchain: `6b64616690ddf9e11e71cf4caeb1b4be5df74b8d`;
4. contracts: `632ebcda54adba07c106984c16999cb84bc9bc2c`;
5. runtime/session: `f5ca93c77e800465b65b947172fca1c9f8ee650f`;
6. private Node bridge: `8ae5b7158ea45cfc4c47902ff8a17ce5c949678c`;
7. Stage E pre-repair gate record: `669364128cd4402a478f247393908ff170112794`;
8. accepted bounded-repair planning: `b944876aefc2b359b459bb8565afa38c0635765b`;
9. historical boundary repair: `654578bded13b0f6da8b8c55cf71145f176d38f8`;
10. clean-clone CRLF portability regression: `0c1a1da966687f2faa366dc3bcb4915b8a790fc7`.

The two repair commits are independently revertible. Reverting them restores the documented pre-repair `541/542` blocker without changing Stages A-D or any CVN-7 evidence, budget, runner or qualification state.

## Repair result

- `test/core-kernel/cvn-7-qualification-boundary.test.ts` now proves both frozen objects are commits, proves base ancestry, and compares only `38afdc3fd508dc67f7aa446fd323837a5d550b70..b21540fa3636e6c8e827ff24c2099f4ff331285d` over `src`, `package-lock.json` and `tsconfig.json`.
- `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` keeps `89115da...` as the implementation diff base, reads the repaired matrix only from `b944876...`, proves literal unique existing `39+1=40`, and includes the CVN-7 test in the exact runtime projection.
- Seven accepted planning-only authority paths introduced between `6693641..b944876` are separated from the implementation projection by exact literal names; no unknown path is ignored.
- Clean clone testing exposed `core.autocrlf` sensitivity in source scans. The workspace-law text reader now normalizes CRLF to LF before semantic comparisons; production bytes and contracts are unchanged.

## Gate summary

The pre-repair full result remains recorded as `541/542`. The repaired result is separately `542/542`. Rust `1.97.1` fmt/check/test (`29/29`) and clippy `-D warnings`, MSRV `1.88.0` locked check, Node bridge `6/6`, workspace-law `5/5`, Windows MSVC DLL-to-`.node`, `process.dlopen`, `require`, exact two exports, and a fresh detached clean-clone native/typecheck/build/`11/11` run all pass. The first clean-clone npm attempt hit the recorded Windows global-cache `EPERM`; the task-specific isolated cache rerun passed and left tracked status empty.

## Independent review boundary

Review the exact implementation candidate range from `89115daedc623c0d35386a4a433cc7fd95215223` while treating `6693641..b944876` as the independently accepted docs-only planning-repair range. Verify the two repaired tests, 40-path implementation projection, protected zero delta, public `28/51/8/34/9`, seven-crate/unsafe/Node contracts, TypeScript default and all exclusions. Stop after an implementation verdict; do not accept, archive, push, run official qualification or create RKP-2.
