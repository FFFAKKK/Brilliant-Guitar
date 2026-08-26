# Implementation Plan — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## 0. Phase gate

This file is planning authority only. Do not run `task.py start` until an independent planning audit returns P0/P1/P2=`0/0/0` and the user separately authorizes implementation.

Before every phase:

1. verify exact accepted planning HEAD, branch, clean worktree and staged-empty state;
2. verify the five technical and seven lifecycle paths are the complete allowlists;
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

Bounded RED gate:

- Core Types focused tests, fmt/check/clippy/MSRV and the one-owner source scan must be green.
- `codec::tests::structural_rank_beats_source_order_for_compound_faults` is allowed to fail only because actual bytes are the new `1572864/1572865` while its unchanged snapshot expects `1048576/1048577`.
- A no-repository-write diagnostic named `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` must show that a fake native `codec.property-limit` with exact `1572864/1572865` is still downgraded to `bridge.internal` by the predecessor TypeScript validator. Record its command and diff. The P2 committed regression test will be named `fake and real native successor property-limit stays stable`.
- No other RED is allowed. Full failing test names and reasons are part of P1 evidence.

After committing P1, stop for a dedicated independent P1 implementation audit. Only PASS plus separate user authorization permits P2. Rollback P1 restores the old cap and old-wire green state.

## P2 — Contracts strict decoder and resource laws

Owners: `crates/brilliant-kernel-contracts/src/codec.rs`, `src/core-kernel/native/rust-kernel-smoke.ts`, and `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`.

- Keep importing Core Types `JSON_PROPERTY_LIMIT`; add compile/runtime equality assertions without a duplicated numeric owner.
- Update direct boundary and exact-byte tests to the successor cap.
- Freeze depth → property → shape → number adjacent and compound precedence.
- Prove scan-only zero post-limit retention, bounded four-slot fault storage, duplicate discard, unique/duplicate linear visits and no counter wrap.
- Prove invalid UTF-8, invalid/trailing JSON, exact-shape/extra-field and safe-number behavior is unchanged.
- Prove request `64 MiB + 1` is rejected before parsing or full copy and response cap remains unchanged.
- Change only the native adapter's property-limit validator to the successor limit. Do not change `STRICT_INPUT_MAX_PROPERTIES` or TypeScript capture behavior.
- Add exact fake and real native `newCap+1` assertions proving `codec.property-limit`, `limit=1_572_864`, `actual=1_572_865` and no downgrade to `bridge.internal`.

Commit: `fix(rkp-1a): align strict decoder resource contract`.

Gate: Contracts/Core Types focused tests, fake/real native successor mapping, exact wire snapshots, fmt/check/clippy/MSRV and protected-path checks must be green. Then stop for a dedicated independent P2 implementation audit. Only PASS plus separate user authorization permits P3.

Rollback: revert P2 to the independently audited P1 bounded RED state. A second rollback of P1 is required to restore the old-cap/old-wire green state.

## P3 — consumers and frozen real-decoder proof

Owners:

- `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`;
- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

Extend the P2 dedicated test with the existing `createStressCvn7Score()` without modifying its source, assert exact Event/Note counts and exact bytes, build the public create envelope and pass it through the real native create path. Then prove repeated detached read/export canonical parity, unknown score/Part extension payload preservation and consumer compatibility across Foundation, Runtime, Session and Node.

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
