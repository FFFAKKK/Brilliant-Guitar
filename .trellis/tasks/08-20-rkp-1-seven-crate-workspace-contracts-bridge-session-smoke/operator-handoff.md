# RKP-1 Operator Handoff

## Current status

`IMPLEMENTATION REREVIEW REQUIRED`.

The full implementation audit returned P0/P1/P2=`0/4/0` for `efe3bbc9852aef2cf7949c3ae221218b1c2590dd` in task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The four bounded repairs already required by the accepted RKP-1 plan are now implemented on branch `codex/rkp-1-four-p1-bounded-implementation-repair`, which starts at that exact rejected candidate.

The child remains `in_progress`, `task_start_run=true`, `production_implementation_authorized=true`, `implementation_candidate_ready=true`, `implementation_repair_active=false`, and `implementation_review=pending`. TypeScript remains the product default. Acceptance, archive, push, official CVN-7 measurement, default cutover and RKP-2+ creation remain unauthorized.

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
11. four-P1 repair-state freeze: `513b32113d7a3a814c98002dfb809ff469b2ab48`;
12. deterministic codec precedence: `05ada5cb631508c1d27fb0f833ed155e24f0894f`;
13. allocation-before-cap: `009c086822eefa5f3b898fc5f4bd646ecaacdbc0`;
14. production remove-wrap ownership proof: `a8ceed5b27fd68ca53b4c5947039184f3d9e8637`;
15. checkout-portable rustfmt policy: `47f80198155a2bb896206dd575b008c7180d0d74`.

The historical-boundary commits and each four-P1 code commit are independently revertible. Reverting any four-P1 commit restores only its audited finding without changing the other repairs, Stages A-D or any CVN-7 evidence, budget, runner or qualification state.

## Repair result

- `test/core-kernel/cvn-7-qualification-boundary.test.ts` now proves both frozen objects are commits, proves base ancestry, and compares only `38afdc3fd508dc67f7aa446fd323837a5d550b70..b21540fa3636e6c8e827ff24c2099f4ff331285d` over `src`, `package-lock.json` and `tsconfig.json`.
- `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` keeps `89115da...` as the implementation diff base, reads the repaired matrix only from `b944876...`, proves literal unique existing `39+1=40`, and includes the CVN-7 test in the exact runtime projection.
- Seven accepted planning-only authority paths introduced between `6693641..b944876` are separated from the implementation projection by exact literal names; no unknown path is ignored.
- Clean clone testing exposed `core.autocrlf` sensitivity in source scans. The workspace-law text reader now normalizes CRLF to LF before semantic comparisons; production bytes and contracts are unchanged.
- Contracts now retain all duplicate members, collect the complete bounded structural candidate set and select `depth -> property -> missing/extra/duplicate/wrong-type/invalid-tag -> safe-number` with canonical static paths. Reversed-key Rust and real-addon inputs produce byte-identical winners; Foundation structural failures retain exact nested paths.
- Node request capture checks borrowed Buffer length before the sole full copy. Response encoding uses a capped counting writer that counts every produced byte, retains at most `67108864`, preserves in-cap canonical bytes and lets response overflow precede a later encode failure.
- Tag rollback production and tests now share one private `RemoveWrapOps` seam. Real Box/Arc/Weak/table/guard/finalizer tests cover `napi_ok` expected/null/mismatch and non-ok, prove status-before-out-pointer, exactly-once token/envelope drops, absent publication, no unknown-pointer dereference/free, no hang and generation-matched finalization.
- `rustfmt.toml` is exactly `newline_style = "Auto"`. Fresh detached clones with `core.autocrlf=true` (`w/crlf`) and `false` (`w/lf`) both pass `cargo +1.97.1 fmt --all -- --check` and remain clean.

## Gate summary

The pre-repair full result remains recorded as `541/542`, and the historical-boundary repair result remains `542/542`. Four-P1 gates pass: Rust `1.97.1` fmt/check/test (`38/38`) and clippy `-D warnings`; MSRV `1.88.0` locked all-targets check; Node bridge `8/8` under `--expose-gc`; workspace-law `5/5`; Windows MSVC DLL-to-`.node`, `process.dlopen`, `require` and exact two exports; and a fresh detached CRLF clone native create/read/two-export smoke with tracked status empty. The final clean full TypeScript rerun occurs after this evidence commit so the archived clean-lifecycle assertion observes committed state; its exact out-of-band result must be included in the review request.

## Independent review boundary

Review the exact implementation candidate range from `89115daedc623c0d35386a4a433cc7fd95215223` through the final evidence HEAD while treating `6693641..b944876` as the independently accepted docs-only planning-repair range. Recheck all four repaired mechanisms, the exact 40-path implementation projection and seven planning-only exclusions, protected zero delta, public `28/51/8/34/9`, seven-crate/unsafe/Node contracts, dual-autocrlf evidence, TypeScript default and all exclusions. Stop after a targeted implementation verdict; do not accept, archive, push, run official qualification or create RKP-2.
