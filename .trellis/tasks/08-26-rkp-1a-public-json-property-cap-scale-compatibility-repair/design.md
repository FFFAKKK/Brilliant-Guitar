# Design — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## 1. Authority topology

The archived RKP-1 task remains immutable historical authority for the original `1,048,576` bound. This child is its versioned successor for one compatibility widening; it does not edit the archive or active specs during planning.

`crates/brilliant-core-types/src/json.rs` is the sole numeric owner of `JSON_PROPERTY_LIMIT`. `BoundedJsonValue::validate_limits()` uses it directly. `crates/brilliant-kernel-contracts/src/codec.rs` imports the same public constant for `StrictState`; it must not declare a local equivalent or add a second decoder path.

## 2. Exact bounded contract

| Contract | Frozen value |
| --- | ---: |
| old property/value cap | `1,048,576` |
| successor property/value cap | `1,572,864` |
| JSON depth cap | `64` |
| request byte cap | `67,108,864` |
| response byte cap | `67,108,864` |
| failure variant count | `22` |
| property failure code | `codec.property-limit` |

The count semantics do not change: every object, array and primitive is one value; keys are not counted. The new cap is inclusive. `newCap + 1` returns existing `StableFailureV1::CodecPropertyLimit { limit: 1_572_864, actual: 1_572_865 }` and the existing canonical wrapper. No new variant or field is introduced.

## 3. Failure precedence

The live `StrictState::failure()` order is authoritative and frozen:

1. depth fault;
2. property/value-count fault;
3. exact-shape fault;
4. safe-number fault.

This structural rank sits inside the wider public decoder order: request byte length before copying; UTF-8; JSON syntax/one value/trailing input; structural depth/property/shape/number; API/protocol; schema/semantic structure; later Session/Node handle stages; response cap/internal handling. The cap widening changes only the property threshold.

## 4. Compatibility migration

The former threshold becomes accepted capacity, not a legacy rejection sentinel. Tests construct otherwise-valid bounded values at `oldCap`, `oldCap + 1`, `newCap - 1` and `newCap`. The first rejection is exactly `newCap + 1`.

The selected `1,572,864` value leaves `373,629` values, or `31.156%`, above the frozen request's `1,199,235` values. It remains a finite public bound and is not inferred dynamically from the fixture.

## 5. Retention and complexity

`StrictState` continues complete structural traversal after property overflow in scan-only mode. It retains no later key, value or `Null` placeholder, while still validating syntax, saturating/checked counts and detecting a later higher-priority depth fault. Duplicate values are consumed for syntax/resource classification but do not grow the retained tree. Four constant fault slots (depth/property/shape/number) remain the maximum. Source member order cannot choose the public winner.

`BoundedJsonValue` remains data-only and bounded. This task changes no DTO representation, serialization discriminant or extension payload ownership.

## 6. Frozen scale request

The only fixture owner remains `test/core-kernel/fixtures/cvn-7-qualification-score.ts#createStressCvn7Score`; it is read-only for this task. Its request traverses production `decode_create_request`. A new dedicated TypeScript test may generate the exact request and load the existing private native bridge, but it may not modify the fixture, Node adapter, Runtime seam or package scripts.

Exact frozen facts:

- `102,400` Events and `51,200` Notes;
- canonical score bytes `15,013,904`;
- create-request bytes `15,013,932`;
- request values `1,199,235`;
- document values `1,199,233`;
- envelope values `2`.

Passing the decoder is necessary but not sufficient. Entry evidence is decoder success followed by native create, repeated read/export, canonical bytes and detached output. Only accepted and integrated RKP-1A evidence may unblock RKP-2 E2.

## 7. Consumer impact

| Consumer | Required proof | Production change |
| --- | --- | --- |
| Core Types | single constant and inclusive boundaries | `json.rs` only |
| Contracts | real strict decode, exact bytes, precedence/resources | `codec.rs` only |
| Foundation / extensions | large bounded payload decodes without schema drift | none |
| Runtime / Session | accepted document publishes once and reads deterministically | none |
| Node | existing two-export private bridge admits and reads request | none |
| TypeScript native wire adapter | successor property failure remains stable instead of becoming internal | `rust-kernel-smoke.ts` only |
| TypeScript strict capture | separate member/element descriptor bound remains read-only | none |

### 7.1 TypeScript responsibility split

`src/core-kernel/native/rust-kernel-smoke.ts` validates the Rust native response envelope. Its current hard-coded `codec.property-limit.limit===1_048_576` is a real successor-wire consumer and must change to `1_572_864`. Both a fake native rejection and a real native `newCap+1` rejection must remain `codec.property-limit` with exact `1572864/1572865`; neither may downgrade to `bridge.internal`.

`src/core-kernel/codec/strict-input-capture.ts#STRICT_INPUT_MAX_PROPERTIES` stays exactly `1_048_576`. That TypeScript capture contract counts object members and array elements while safely reading JavaScript descriptors. Rust `JSON_PROPERTY_LIMIT` counts every serialized JSON object, array and primitive while excluding keys. Equal historical numbers do not make them one authority. RKP-1A changes no TypeScript capture threshold or default codec path.

## 8. Exact future technical allowlist

1. `crates/brilliant-core-types/src/json.rs`
2. `crates/brilliant-kernel-contracts/src/codec.rs`
3. `src/core-kernel/native/rust-kernel-smoke.ts`
4. `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts` (new dedicated compatibility/native consumer test)
5. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` (literal governance projection only)

No other Rust, `src/**`, fixture, Node adapter, Cargo, package, tsconfig, toolchain, spec or test path may change. `strict-input-capture.ts` is explicitly read-only. Existing unit tests live in the two Rust owner files, so no second Rust test file is needed.

## 9. Future lifecycle allowlist

Only child `task.json`, `operator-handoff.md`, `review-candidate.md`, future `research/implementation-evidence.md`, Rust parent `task.json`, RKP-2 `task.json`, and the current Stage-6 seam-repair `task.json` may record activation, gates, acceptance projection and blocker removal. Planning authority files freeze after independent planning PASS.

## 10. Rejected routes

- Excluding the envelope saves only two values and still rejects `1,199,233`; it also forks counting semantics.
- A test/internal bypass creates a second admission path and cannot prove the product decoder.
- Shrinking the stress fixture invalidates the frozen scale evidence.
- A dynamic cap derived from fixture size destroys a stable public resource contract.

## 11. Audited phase gates and rollback

P1 changes only `crates/brilliant-core-types/src/json.rs`. Contracts immediately imports the new limit, but its old exact-byte snapshot and the TypeScript native adapter still encode/accept the predecessor wire. P1 is therefore a deliberate bounded RED checkpoint, not a green integration candidate.

The exact P1 allowed RED set is:

1. Rust test `codec::tests::structural_rank_beats_source_order_for_compound_faults`: actual property failure bytes contain `1572864/1572865` while its predecessor snapshot still expects `1048576/1048577`.
2. Non-mutating diagnostic `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING`: a fake native rejected envelope carrying exact `1572864/1572865` is currently normalized by `createRustKernelSmokeSession` to `bridge.internal` because `rust-kernel-smoke.ts` still accepts only the predecessor limit. The future committed test is named `fake and real native successor property-limit stays stable`.

The operator records exact commands, test names and failure diffs. Any additional failing test, changed failure code, hang, resource regression or protected-path delta blocks P1. After the P1 commit the operator stops for an independent P1 implementation audit. P2 requires that audit to PASS and separate user authorization.

P2 updates Contracts plus the native TypeScript validator and its dedicated compatibility test. P2 must make the allowed RED set green without widening failures elsewhere, then stops for an independent P2 implementation audit. P3 requires that audit to PASS and separate user authorization.

Reverting P2 returns to the audited P1 RED checkpoint; it does not restore a green tree. Reverting P1 after that restores the former cap and old-wire green state. Reverting P3 removes integration evidence only. P4 is docs/evidence freeze only. RKP-2 E2 remains paused until independent final implementation PASS, owner acceptance/archive and explicit integration gates consume the accepted successor.

## 12. Resume boundary

P0 through P4 remain separate commits. Neither P1 nor P2 audit is the final implementation acceptance audit. P3 consumer/stress work and P4 candidate freeze remain separately authorized future steps.
