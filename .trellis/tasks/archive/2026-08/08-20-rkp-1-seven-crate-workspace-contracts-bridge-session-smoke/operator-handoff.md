# RKP-1 Operator Handoff

## Current status

`RKP-1 ACCEPTED / ARCHIVED`.

Independent auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7` returned final P0/P1/P2=`0/0/0` for exact audited implementation commit `94387b339b5e4d9ce6b7f97597a1b56edd051f01`. Later accepted-review, archive and journal commits are lifecycle-only and must not be presented as re-audited production candidates.

The child is `completed` at the archive path; `task_start_run=true` and `production_implementation_authorized=true` retain their historical values, implementation review/rereview passed and blocker null. TypeScript remains the product default, and the 40 implementation paths plus seven accepted planning-only paths remain exact. Push, official CVN-7 measurement, default cutover and RKP-2 implementation remain unauthorized.

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
16. Codec linear-bound repair-state freeze: `310baf4471b967230fc7aa1178cc00a711b3f527`;
17. Codec linear lookup/retention repair: `e8d496d75a25553132a135e23d99c80b167b6a49`.

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
- The strict object tree now has one `BTreeMap` owner, O(log n) worst-case lookup, first-value duplicate retention and immediate duplicate-value discard after complete syntax/resource scanning. Depth/property/shape/number use four bounded canonical winner slots. Once a resource fault is known, scan-only mode retains no further key/value/placeholder while still counting values and detecting a later higher-priority depth fault.
- Real-addon medians for 5k/10k/20k unique keys are `14.612/30.639/51.443 ms` with adjacent ratios `2.097/1.679`; duplicate keys are `4.261/9.016/17.035 ms` with ratios `2.116/1.890`. The frozen gates are adjacent ratio `<3.25`, endpoint ratio `<8.5`, and a bounded 30-second no-hang timeout.

## Gate summary

The pre-repair full result remains recorded as `541/542`, and the historical-boundary repair result remains `542/542`. Current gates pass: Rust `1.97.1` fmt/check/test (`40/40`) and clippy `-D warnings`; MSRV `1.88.0` locked all-targets check; Node bridge `9/9` under `--expose-gc`; workspace-law `6/6`; Windows MSVC DLL-to-`.node`, `process.dlopen`, `require` and exact two exports; TypeScript typecheck/build; and full TypeScript discovery `546` with `545` passed, zero failed and one ordinary-run GC skip covered by the focused gate. Final dual-autocrlf and clean lifecycle probes run at the committed evidence HEAD and are reported out of band.

## Owner closeout boundary

Archive this child only through the native Trellis command. Preserve `94387b339b5e4d9ce6b7f97597a1b56edd051f01` as the audited implementation commit, retain the child once in the parent's `children` array, and clear active/current child projections. The archive target is `.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/`; the next gate is only `rkp2-planning-creation`, not RKP-2 implementation authorization.

Phase 3.3 adds no active `.trellis/spec/**` change. RKP-1-specific rules remain in the archived task for future RKP-2 planning; any promotion to active specs requires a separate docs-only authority/spec-sync.

The separately gated post-archive workspace-contract repair is active at planning HEAD `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f`. Activation commit `716a9113f8961953ccf848191b4edabc15ab4a62` and isolated test commit `ce4e32d59ec72626e1ab8358632d46be35fe647e` freeze the historical interval and read current lifecycle facts from this archive. Full gates and independent implementation review remain pending; RKP-2 production stays paused.
