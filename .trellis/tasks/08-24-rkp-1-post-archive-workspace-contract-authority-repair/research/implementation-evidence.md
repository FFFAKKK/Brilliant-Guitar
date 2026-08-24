# RKP-1 Post-Archive Workspace-Contract Repair — Implementation Evidence

Date: 2026-08-24

## Candidate identity

- accepted planning head: `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f`
- activation: `716a9113f8961953ccf848191b4edabc15ab4a62`
- test repair: `ce4e32d59ec72626e1ab8358632d46be35fe647e`
- authority sync: `c9fd2652bf0af88402f5e5953f5786f471e85fb6`
- audited RKP-1 implementation endpoint: `94387b339b5e4d9ce6b7f97597a1b56edd051f01`
- historical implementation interval: `89115daedc623c0d35386a4a433cc7fd95215223..94387b339b5e4d9ce6b7f97597a1b56edd051f01`
- implementation review: `pending`

The final evidence/status commit is intentionally not self-recorded as an immutable hash inside its own tree. The reviewed Git head supplies that identity. The repair remains `in_progress`; acceptance, archive, push, RKP-2 implementation, default-runtime cutover and official qualification are not authorized by this evidence.

## Implemented contract

The single production-owned test now applies `git -c core.longpaths=true` to each Git subprocess, reads the forty-path matrix from its historical planning object, compares the immutable implementation interval rather than `HEAD` or working state, checks allowlisted file existence at the audited commit object, and reads current lifecycle facts from the archived child plus active parent. It preserves the TypeScript default and does not assert that future RKP tasks remain absent.

## Technical gates

All commands ran in `.worktrees/rkp-1-post-archive-contract-repair` unless stated otherwise.

| Gate | Result |
| --- | --- |
| `cargo +1.97.1 fmt --all -- --check` | PASS |
| `cargo +1.97.1 check --workspace --all-targets --all-features --locked` | PASS |
| `cargo +1.97.1 test --workspace --all-targets --all-features --locked` | PASS, 40/40 |
| `cargo +1.97.1 clippy --workspace --all-targets --all-features --locked -- -D warnings` | PASS |
| `cargo +1.88.0 check --workspace --all-targets --locked` | PASS |
| Windows `x86_64-pc-windows-msvc` addon build and deterministic DLL-to-`.node` copy | PASS |
| `process.dlopen` and `require` | PASS, exact exports `createKernelSessionV1,readKernelSessionV1` |
| dedicated Node bridge with `--expose-gc` | PASS, 9/9 |
| repaired workspace-law test in repair worktree | PASS, 6/6 |
| `npm.cmd run typecheck` and `npm.cmd run build` | PASS |
| full `npm.cmd test` | PASS, 546 total / 545 pass / 1 expected GC skip / 0 fail |

The first non-login PowerShell probe did not find `cargo` and is not counted as a gate. Every recorded Rust result used the verified executable `C:\Users\ATOM\.cargo\bin\cargo.exe`; `cargo +1.97.1 --version` reported `cargo 1.97.1 (c980f4866 2026-06-30)`.

## Long-worktree portability

From `.worktrees/rkp-2-indexed-live-score-store-load-encode-parity`, the absolute compiled repaired test was executed with that worktree as `process.cwd()`. It passed 6/6 without modifying the RKP-2 worktree. The test therefore exercised the long checkout path and current archived/parent authority while importing the exact repaired candidate code. RKP-2 production stayed paused.

## Governance and protected deltas

- Repair child, active Rust parent, and archived RKP-1 child Trellis validation passed: 7/6, 18/19, and 11/12 JSONL entries respectively.
- JSON and JSONL parsing, related-path existence/uniqueness, and the parent's single repair-child reference passed.
- `git diff --check` passed.
- The implementation range from `f7fecdcf...` is restricted to the ten literal paths in `design.md`.
- Repair planning authority files (`prd.md`, `design.md`, `implement.md`, both JSONL manifests, baseline evidence, planning self-audit and bounded-repair record) have zero implementation-time delta.
- `src/**`, `crates/**`, `Cargo*`, `package*.json`, `tsconfig*.json`, `rustfmt.toml`, `.trellis/spec/**`, CVN-7 workload/evidence and all RKP-2 implementation paths have zero delta.
- The long RKP-2 planning worktree remained unmodified by the portability rerun.

## Independent audit focus

1. Each Git subprocess carries the per-command long-path configuration without persistent repository/global mutation.
2. The implementation projection is the immutable `89115da...94387b` interval and contains no checkout-derived upper bound.
3. Historical matrix/file checks use commit objects while lifecycle assertions use the current archived child and active parent.
4. The durable lifecycle assertion excludes completion-date literals and future-stage absence assertions.
5. The implementation diff is exactly bounded by the ten accepted paths and leaves product/Rust/Cargo/CVN-7/RKP-2 surfaces untouched.
6. The task remains `in_progress`, candidate-ready true, implementation review pending, with TypeScript still the default runtime.
