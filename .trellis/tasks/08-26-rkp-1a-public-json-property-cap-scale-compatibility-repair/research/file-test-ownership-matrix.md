# File, Test and Rollback Matrix

## Planning candidate ownership

The planning diff is exactly 15 paths: all 12 files in this child plus:

- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
- `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json`

All `src/**`, `test/**`, `crates/**`, Cargo/package/tsconfig/toolchain and specs are zero-delta during planning.

## Future technical ownership

| Phase | Exact path | Responsibility | Rollback |
| --- | --- | --- | --- |
| P1 | `crates/brilliant-core-types/src/json.rs` | sole cap plus direct inclusive boundaries | revert P1 |
| P2 | `crates/brilliant-kernel-contracts/src/codec.rs` | StrictState, exact wire, precedence and resources | revert P2 |
| P2 | `src/core-kernel/native/rust-kernel-smoke.ts` | accept exact successor native property-limit wire without internal downgrade | revert P2 to audited P1 RED |
| P2/P3 | `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts` | P2 fake/real successor failure mapping; P3 frozen fixture/native/consumer proof | revert owning phase |
| P3 | `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | literal authority/range/protected-path projection | revert P3 |

`test/core-kernel/fixtures/cvn-7-qualification-score.ts` is a read-only input, not an owner.
`src/core-kernel/codec/strict-input-capture.ts` is a read-only independent member/element capture contract fixed at `1_048_576`, not a Rust value-cap owner.

## Exact test matrix

| Area | Required cases |
| --- | --- |
| migration | `oldCap` and `oldCap+1` accepted |
| successor boundary | `newCap-1` and `newCap` accepted; `newCap+1` rejected |
| public bytes | exact `codec.property-limit` wrapper with `1572864/1572865` |
| shared authority | compile/runtime equality; one numeric owner scan |
| precedence | all depth/property/shape/number adjacent and compound orderings |
| native failure consumer | fake and real `codec.property-limit` preserve exact `1572864/1572865`; no `bridge.internal` downgrade |
| TS contract split | native adapter successor limit changes; strict-input member/element limit remains exactly `1048576` and read-only |
| hostile structure | duplicate key, reverse order, invalid tag/type, extra/missing fields |
| resources | scan-only, zero post-limit retention, fault slots ≤4, linear unique/duplicate visits |
| syntax/number | invalid UTF-8, invalid/trailing JSON, JS safe-number bounds |
| byte cap | 64 MiB accepted where otherwise valid; 64 MiB+1 rejected before copy/parse |
| frozen stress | exact events/notes/value/byte counts through real decoder |
| consumers | Foundation extension payload, Runtime record, Session publication, Node create/read/export |
| compatibility | two exports, 22 failures, `28/51/8/34/9`, `brilliant-score-1`, TS default |

## Audited RED and rollback matrix

| Checkpoint | Allowed result | Stop/review | Rollback |
| --- | --- | --- | --- |
| P1 | Core Types green; only `codec::tests::structural_rank_beats_source_order_for_compound_faults` old-byte snapshot and `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` diagnostic RED | stop for independent P1 implementation audit; no P2 without PASS plus authorization | revert P1 to old-cap/old-wire green |
| P2 | all prior allowed RED becomes green; no new failure | stop for independent P2 implementation audit; no P3 without PASS plus authorization | revert P2 to audited P1 RED; then optionally revert P1 to old green |
| P3 | consumer/stress/native/full gates green | proceed only to separately authorized P4 | revert P3, retaining audited P2 |

The P1 diagnostic performs no repository write and supplies a fake native rejected envelope with `code=codec.property-limit`, `limit=1572864`, `actual=1572865`; current adapter behavior must be recorded as `bridge.internal`. The eventual committed test name is `fake and real native successor property-limit stays stable`. Any failure outside the two-entry P1 set blocks rather than being relabeled expected.

## Clean-checkout environment

Future heavy gates use session-only `TEMP`/`TMP` under `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap\tmp`, `CARGO_TARGET_DIR` under its `target` child and `CARGO_INCREMENTAL=0`. Resolve the exact prefix before creation or cleanup; do not change global configuration.
