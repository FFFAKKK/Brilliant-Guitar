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
| P3 | `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts` | real fixture/native/consumer proof | revert P3 |
| P3 | `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | literal authority/range/protected-path projection | revert P3 |

`test/core-kernel/fixtures/cvn-7-qualification-score.ts` is a read-only input, not an owner.

## Exact test matrix

| Area | Required cases |
| --- | --- |
| migration | `oldCap` and `oldCap+1` accepted |
| successor boundary | `newCap-1` and `newCap` accepted; `newCap+1` rejected |
| public bytes | exact `codec.property-limit` wrapper with `1572864/1572865` |
| shared authority | compile/runtime equality; one numeric owner scan |
| precedence | all depth/property/shape/number adjacent and compound orderings |
| hostile structure | duplicate key, reverse order, invalid tag/type, extra/missing fields |
| resources | scan-only, zero post-limit retention, fault slots ≤4, linear unique/duplicate visits |
| syntax/number | invalid UTF-8, invalid/trailing JSON, JS safe-number bounds |
| byte cap | 64 MiB accepted where otherwise valid; 64 MiB+1 rejected before copy/parse |
| frozen stress | exact events/notes/value/byte counts through real decoder |
| consumers | Foundation extension payload, Runtime record, Session publication, Node create/read/export |
| compatibility | two exports, 22 failures, `28/51/8/34/9`, `brilliant-score-1`, TS default |

## Clean-checkout environment

Future heavy gates use session-only `TEMP`/`TMP` under `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap\tmp`, `CARGO_TARGET_DIR` under its `target` child and `CARGO_INCREMENTAL=0`. Resolve the exact prefix before creation or cleanup; do not change global configuration.
