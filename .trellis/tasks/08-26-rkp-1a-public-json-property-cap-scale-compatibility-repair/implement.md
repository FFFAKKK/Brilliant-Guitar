# Implementation Plan — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## 0. Phase gate

This file is planning authority only. Do not run `task.py start` until an independent planning audit returns P0/P1/P2=`0/0/0` and the user separately authorizes implementation.

Before every phase:

1. verify exact accepted planning HEAD, branch, clean worktree and staged-empty state;
2. verify the four technical and seven lifecycle paths are the complete allowlists;
3. verify archived RKP-1 and the frozen stress fixture are byte-zero;
4. use session-only `TEMP`, `TMP` and `CARGO_TARGET_DIR` under `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap`, with `CARGO_INCREMENTAL=0`;
5. stage only the current phase and run `git diff --check`.

## P0 — activation, docs only

Owners: seven lifecycle paths only.

- Record planning audit PASS and user implementation authorization.
- Run native Trellis start for this child only.
- Keep RKP-2 Stage 6 paused, E1/E1R green and E2 not started.
- Set candidate-ready false and implementation review pending.

Commit: `chore(rkp-1a): activate public property cap repair`.

Gate: Trellis child/parents, JSON/JSONL, authority/current/archive and protected-delta checks. Rollback: revert P0 only.

## P1 — Core Types single authority

Owner: `crates/brilliant-core-types/src/json.rs`.

- Change the sole `JSON_PROPERTY_LIMIT` to exactly `1_572_864`.
- Add direct `BoundedJsonValue` tests for `oldCap`, `oldCap + 1`, `newCap - 1`, `newCap`, and `newCap + 1`.
- Prove the new failure actual is `1_572_865`, safe and non-wrapping.
- Preserve depth 64, key-not-counted semantics and data-only serialization.

Commit: `fix(rkp-1a): widen the single bounded json value cap`.

Gate: Core Types focused tests, fmt/check/clippy/MSRV and source scan proving exactly one numeric constant owner. Rollback: revert P1.

## P2 — Contracts strict decoder and resource laws

Owner: `crates/brilliant-kernel-contracts/src/codec.rs`.

- Keep importing Core Types `JSON_PROPERTY_LIMIT`; add compile/runtime equality assertions without a duplicated numeric owner.
- Update direct boundary and exact-byte tests to the successor cap.
- Freeze depth → property → shape → number adjacent and compound precedence.
- Prove scan-only zero post-limit retention, bounded four-slot fault storage, duplicate discard, unique/duplicate linear visits and no counter wrap.
- Prove invalid UTF-8, invalid/trailing JSON, exact-shape/extra-field and safe-number behavior is unchanged.
- Prove request `64 MiB + 1` is rejected before parsing or full copy and response cap remains unchanged.

Commit: `fix(rkp-1a): align strict decoder resource contract`.

Gate: Contracts focused tests plus Core Types tests, exact wire snapshots, fmt/check/clippy/MSRV. Rollback: revert P2 while retaining P1.

## P3 — consumers and frozen real-decoder proof

Owners:

- `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`;
- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

The new dedicated test imports the existing `createStressCvn7Score()` without modifying its source, asserts exact Event/Note counts and exact bytes, builds the public create envelope and passes it through the real native create path. It then proves repeated detached read/export canonical parity, unknown score/Part extension payload preservation and consumer compatibility across Foundation, Runtime, Session and Node.

Workspace-law freezes the accepted planning interval, exact technical/lifecycle allowlists, single cap authority and protected paths. It also asserts two Node exports, 22 stable failures, public `28/51/8/34/9`, `brilliant-score-1` and TypeScript default.

Commit: `test(rkp-1a): prove frozen scale request compatibility`.

Gate: focused compiled test on current Node and Node 20.20.2, native bridge, full dynamic runner with identical manifest/hash/totals, Rust workspace gates and protected zero-delta. Rollback: revert P3 only.

## P4 — candidate freeze

Owners: lifecycle paths only.

- Run all final gates from a clean HEAD and record exact commands, totals, hashes, elapsed diagnostics and protected deltas in the one future implementation evidence file.
- Set implementation candidate-ready true and review pending.
- Keep archive/integration/E2 resume false.
- Request independent implementation audit; do not claim PASS.

Commit: `docs(rkp-1a): freeze property cap repair candidate`.

## Final gate matrix

- `cargo +1.97.1 fmt --all -- --check`
- `cargo +1.97.1 check --workspace --all-targets --locked`
- `cargo +1.97.1 test --workspace --all-targets --locked`
- `cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings`
- `cargo +1.88.0 check --workspace --all-targets --locked`
- `npm.cmd run typecheck`, `npm.cmd run build`, dynamic full runner on Node current and 20.20.2
- native `--expose-gc` bridge and dedicated RKP-1A compatibility test
- child/Rust parent/RKP-2/Stage6 child Trellis; JSON/JSONL/path/parent/fence/diff checks
- implementation-base-to-HEAD literal allowlist and all protected paths zero
- final clean/staged empty

Only an accepted, archived and explicitly integrated RKP-1A descendant may remove `public-json-property-cap-contract-conflict` and restore RKP-2 E2.
