# File, Test and Rollback Matrix

## Planning and amendment ownership

The original planning diff is exactly 15 paths: its 12 child files plus the three projections below. A1 is the first P4-entry amendment, exactly 13 paths: the ten listed current planning artifacts (not `research/implementation-evidence.md`) plus the same three projections. A2 directly follows A1 and has the same thirteen paths. A3 directly follows exact `9e1770b39f01484c860a39a6746f3ef7a638f612`, adds the existing authority-and-consumer impact map and P0/P1/P2 historical evidence, and is exactly the following fifteen paths: `e4103b7..A2` remains thirteen paths; `e4103b7..A3` is fifteen paths.

- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
- `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json`

All `src/**`, `test/**`, `crates/**`, Cargo/package/tsconfig/toolchain and specs are zero-delta during A planning. A1 directly follows exact `e4103b779574fcdc728d024c1b8f30244cb332c3`; A2 directly follows exact `aacb057af6eaa7c16e88ed94e2ecfc323c540032`; A3 directly follows exact `9e1770b39f01484c860a39a6746f3ef7a638f612`. None changes workspace-law or names its own commit hash.

After exact A3 independently passes and separately receives user authorization, B directly follows accepted A3 and owns exactly eight paths: the original seven lifecycle paths in design section 10 plus `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. The test path only freezes mechanical governance, never lifecycle state. Workspace-law must retain `bd8946e → f06c57b → 673a2b9 → e4103b7 → A1 aacb057 → A2 9e1770b`, assert individual A1/A2 thirteen-path and A3 fifteen-path commit sets, assert `e4103b7..accepted A3` is the cumulative fifteen paths and `accepted A3..B` is the eight B paths, and reject self-hash, merge, empty/extra commit, wildcard and directory exemption. A rollback is a later exact eight-path governance descendant that restores the seven lifecycle paths to accepted-A3 P4-not-ready state and freezes B→rollback; it does not revert A1/A2/A3.

## Cumulative technical ownership

| Phase | Exact path | Responsibility | Rollback |
| --- | --- | --- | --- |
| P1 | `crates/brilliant-core-types/src/json.rs` | sole cap plus direct inclusive boundaries | revert P1 |
| P2 | `crates/brilliant-kernel-contracts/src/codec.rs` | StrictState, exact wire, precedence and resources | revert P2 |
| P2 | `src/core-kernel/native/rust-kernel-smoke.ts` | accept exact successor native property-limit wire without internal downgrade | revert P2 to audited P1 RED |
| P3A | `src/core-kernel/codec/strict-input-capture.ts` | sole closed default/native capture profile implementation and limit owner | revert P3A |
| P3A | `test/core-kernel/cvn-3-strict-input.test.ts` | exact default/native edges and hostile descriptor behavior | revert P3A |
| P2/P3A/P3B | `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts` | P2 successor wire; P3A DAG/cloned capture; P3B real consumer/canonical proof plus the only direct self-worker entry, harness, protocol parser and negative fixtures | revert owning phase |
| P3A/P3B | `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | literal authority/range/protected-path projection only | revert owning phase |

`test/core-kernel/fixtures/cvn-7-qualification-score.ts` is a read-only input, not an owner.
`crates/brilliant-kernel-runtime/src/indices.rs` is excluded and remains the Stage6 child's sole production owner.

## Exact test matrix

| Area | Required cases |
| --- | --- |
| migration | `oldCap` and `oldCap+1` accepted |
| successor boundary | `newCap-1` and `newCap` accepted; `newCap+1` rejected |
| public bytes | exact `codec.property-limit` wrapper with `1572864/1572865` |
| shared authority | compile/runtime equality; one numeric owner scan |
| precedence | all depth/property/shape/number adjacent and compound orderings |
| native failure consumer | fake and real `codec.property-limit` preserve exact `1572864/1572865`; no `bridge.internal` downgrade |
| TS contract split | default capture remains `1048576`; native-wire-v1 is `1572864`; both native create/read call sites select the profile |
| hostile structure | duplicate key, reverse order, invalid tag/type, extra/missing fields |
| resources | scan-only, zero post-limit retention, fault slots ≤4, linear unique/duplicate visits |
| syntax/number | invalid UTF-8, invalid/trailing JSON, JS safe-number bounds |
| byte cap | 64 MiB accepted where otherwise valid; 64 MiB+1 rejected before copy/parse |
| frozen stress | exact events/notes/value/byte counts through real decoder |
| consumers | Foundation extension payload, Runtime record, Session publication, Node create/read/export |
| capture profiles | default/native cap-1/cap/cap+1; create and read select native; default hostile behavior unchanged |
| representation | DAG capture `1,045,635`; cloned document `1,199,232`; create/read exact member counts |
| canonical roles | input/export exact SHAs, semantic equality, repeated reads, 18/16/1 extension deep equality |
| P3B self-worker entry | CommonJS `path.resolve(process.argv[1] ?? "") === path.resolve(__filename)` + exact argv/env + absent `NODE_TEST_CONTEXT`; partial marker and recursive spawn reject |
| P3B success protocol | one `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:` LF line; exact recursive schema/types/ranges/order; result bytes equal payload; stderr empty; extra fields reject |
| P3B process resources | stdout/stderr each cap `1,048,576`; `180000 ms` spawn-to-settlement; exact taskkill argv and independent taskkill/reap `5000 ms` guards; cleanup leaf twice with `5000 ms` guards and `100 ms` delay under E: only |
| P3B failure matrix | first-observed `primary ??=`; CommonJS/recursion, both event orderings, taskkill launch/nonzero/timeout, reap timeout, cleanup recovery/two-failure, sentinel/output/evidence faults; no partial success |
| compatibility | two exports, 22 failures, `28/51/8/34/9`, `brilliant-score-1`, TS default |

## Audited RED and rollback matrix

| Checkpoint | Allowed result | Stop/review | Rollback |
| --- | --- | --- | --- |
| P1 | Core Types green; only `codec::tests::structural_rank_beats_source_order_for_compound_faults` old-byte snapshot and `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` diagnostic RED | stop for independent P1 implementation audit; no P2 without PASS plus authorization | revert P1 to old-cap/old-wire green |
| P2 | all prior allowed RED becomes green; no new failure | independent P2 audit passed at `0f652729...`; no P3A without amended planning PASS and authorization | revert P2 to audited P1 RED; then optionally revert P1 to old green |
| P3A | capture profile, DAG/cloned create and public-read gates green | independently audited history | revert P3A to audited P2 |
| P3B | real consumer/canonical/native/full gates green | independently reviewed through `e4103b7`; no P4 B without exact A3 planning PASS plus authorization | revert P3B, retaining audited P3A |
| P4 A1/A2/A3 | A1/A2 exact 13 planning/projection paths; A3 exact 15 with cumulative 15; candidate false | targeted independent P4-entry planning review of exact A3 | retain A1/A2/A3; no B yet |
| P4 B | seven lifecycle owners plus one workspace-law projection; candidate true/review pending only | independent implementation review; no acceptance/archive/integration/E2 | later exact eight-path governance rollback to accepted-A3 P4-not-ready state, never ordinary `git revert B` |

The P1 diagnostic performs no repository write and supplies a fake native rejected envelope with `code=codec.property-limit`, `limit=1572864`, `actual=1572865`; current adapter behavior must be recorded as `bridge.internal`. The eventual committed test name is `fake and real native successor property-limit stays stable`. Any failure outside the two-entry P1 set blocks rather than being relabeled expected.

## Clean-checkout environment

Future heavy gates use session-only `TEMP`/`TMP` under `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap\tmp`, `CARGO_TARGET_DIR` under its `target` child and `CARGO_INCREMENTAL=0`. Resolve the exact prefix before creation or cleanup; do not change global configuration.

P3B uses no additional source path: its compatibility test is both the ordinary CommonJS `node:test` file and the sole direct self-worker. The exact `__filename` formula, argv/env/`NODE_TEST_CONTEXT` guard, sentinel schema, `1 MiB` caps, first-observed failure rule, taskkill/reap secondary states and cleanup recovery contract live in design section 12.1. All request/result/stdout/stderr/native scratch descends from the resolved `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap\p3b` leaf. Every failure rejects without partial evidence; cleanup first-fail/second-success is recorded recovery, while two failures reject. Wall time and RSS are diagnostic only.
