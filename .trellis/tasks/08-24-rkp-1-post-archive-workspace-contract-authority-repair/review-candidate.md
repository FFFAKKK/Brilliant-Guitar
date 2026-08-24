# Review Candidate — RKP-1 Post-Archive Repair

## Verdict requested

`IMPLEMENTATION REVIEW REQUIRED`

Final targeted planning rereview R2 passed P0/P1/P2=`0/0/0` at `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f`. Activation `716a9113f8961953ccf848191b4edabc15ab4a62`, isolated workspace-contract test repair `ce4e32d59ec72626e1ab8358632d46be35fe647e`, authority synchronization `c9fd2652bf0af88402f5e5953f5786f471e85fb6`, every Stage 4 gate and the long RKP-2 planning-worktree focused rerun are complete. Candidate readiness is true while implementation review remains pending. Acceptance, archive, push, RKP-2 implementation and official qualification remain outside this implementation candidate.

## Verified candidate evidence

- Rust workspace 40/40; fmt, check, Clippy `-D warnings`, and MSRV 1.88 locked check pass.
- Windows MSVC addon build, deterministic DLL-to-`.node`, `process.dlopen`, `require`, and exact two exports pass.
- Node bridge 9/9 with `--expose-gc`; workspace-law 6/6 in the repair worktree and 6/6 from the long-path RKP-2 planning worktree.
- TypeScript typecheck/build pass; full suite 546 total, 545 pass, one expected GC skip, zero fail.
- The implementation range stays inside the ten literal accepted paths; protected implementation-time paths and all production/Rust/Cargo/package/tsconfig/spec/CVN-7 surfaces have zero delta.

## Review focus

1. Exact failure mechanism and native archive result.
2. Closed historical interval ending at audited `94387b...`.
3. Historical commit paths versus current archived paths.
4. Per-command rather than persistent `core.longpaths=true`.
5. Durable lifecycle facts without future-stage absence assertions.
6. One existing test plus narrow lifecycle authority allowlist.
7. Production, Rust, Cargo, public API, CVN-7 and RKP-2 boundary preservation.
8. Explicit rollback, full gates and independent implementation review.
9. Completion date is excluded; repair-task lifecycle paths are literal; readiness is set only in Commit 4 after full verification.
10. Reverting implementation Commits 4 through 1 returns to the accepted planning HEAD recorded at activation; abandoning the full repair is a separate owner action that may return to base.
