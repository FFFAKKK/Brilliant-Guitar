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

## 6. TypeScript capture profiles

`captureStrictInput` is the sole capture implementation and the sole owner of profile-to-limit selection. The accepted profile union is closed to `default | native-wire-v1`:

| Profile | Exact maximum members/elements | Consumers |
| --- | ---: | --- |
| `default` | `1,048,576` | every existing default TypeScript capture caller |
| `native-wire-v1` | `1,572,864` | native create-document capture and native read-response capture in `rust-kernel-smoke.ts` |

Call sites select a profile and never repeat either number. The default profile and its hostile accessor/proxy/cycle/depth behavior remain byte-for-byte unchanged. Create capture overflow remains `bridge.capture-invalid`; response capture overflow or malformed response remains `bridge.internal`; no stable failure, export or DTO is added.

Exact cross-model counts are:

| Projection | Rust JSON values | TypeScript members/elements | Bytes |
| --- | ---: | ---: | ---: |
| document | `1,199,233` | `1,199,232` | `15,013,904` input |
| create request | `1,199,235` | `1,199,234` | `15,013,932` |
| read response wrapper | `1,199,245` | `1,199,244` | `15,014,112` raw payload |

Rust counts the root as a value, hence values equal members plus one; the read wrapper adds twelve edges. `createStressCvn7Score()` is a shared-reference DAG: WeakMap capture observes `1,045,635` members. `JSON.parse(JSON.stringify(score))` is the semantically equivalent tree with `1,199,232` members and fails the predecessor default profile before native code. P3A and P3B cover both representations.

## 7. Frozen scale request and canonical evidence

The only fixture owner remains `test/core-kernel/fixtures/cvn-7-qualification-score.ts#createStressCvn7Score`; it is read-only for this task. Its request traverses production `decode_create_request`. A new dedicated TypeScript test may generate the exact request and load the existing private native bridge, but it may not modify the fixture, Node adapter, Runtime seam or package scripts.

Exact frozen facts:

- `102,400` Events and `51,200` Notes;
- input and Rust-export score bytes `15,013,904` each;
- create-request bytes `15,013,932`;
- request values `1,199,235`;
- document values `1,199,233`;
- envelope values `2`.

Passing the decoder is necessary but not sufficient. Entry evidence is decoder success followed by raw and public native create, repeated read/export, semantic equality, detached output and exact canonical roles. Only accepted and integrated RKP-1A evidence may unblock RKP-2 E2.

RKP-2 authority is `canonical(input) == canonical(exported)`, not raw input bytes equal raw output bytes. Foundation `BTreeMap` ordering owns payload-object canonical order. Input and export are semantically equal and the same length, but the first difference is zero-based byte `15,011,087` / one-based `15,011,088` at `$.extensions[0].payload`: TypeScript input orders `marker` then `generatorVersion`; Rust orders `generatorVersion` then `marker`.

- input SHA-256: `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`;
- Rust canonical export SHA-256: `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`.

The raw input hash is never called the Foundation canonical hash. P3B proves semantic/value/array/entity equality, repeated raw/public read stability, and deep equality for all 18 extensions, 16 Part-owned blocks and the one unknown block. Neither TypeScript encoder, Foundation ordering nor fixture changes.

## 8. Consumer impact

| Consumer | Required proof | Production change |
| --- | --- | --- |
| Core Types | single constant and inclusive boundaries | `json.rs` only |
| Contracts | real strict decode, exact bytes, precedence/resources | `codec.rs` only |
| Foundation / extensions | large bounded payload decodes without schema drift | none |
| Runtime / Session | accepted document publishes once and reads deterministically | none |
| Node | existing two-export private bridge admits and reads request | none |
| TypeScript native wire adapter | successor property failure remains stable instead of becoming internal | `rust-kernel-smoke.ts` only |
| TypeScript strict capture | default remains `1,048,576`; `native-wire-v1` is `1,572,864` | `strict-input-capture.ts` plus native caller selection |

### 8.1 TypeScript responsibility split

`src/core-kernel/native/rust-kernel-smoke.ts` validates the Rust native response envelope. Its current hard-coded `codec.property-limit.limit===1_048_576` is a real successor-wire consumer and must change to `1_572_864`. Both a fake native rejection and a real native `newCap+1` rejection must remain `codec.property-limit` with exact `1572864/1572865`; neither may downgrade to `bridge.internal`.

`src/core-kernel/codec/strict-input-capture.ts#STRICT_INPUT_MAX_PROPERTIES` stays exactly `1_048_576` as the default profile. That contract counts object members and array elements while safely reading JavaScript descriptors. Rust `JSON_PROPERTY_LIMIT` counts every serialized JSON object, array and primitive while excluding keys. Equal historical numbers do not make them one authority. The only change is adding the closed `native-wire-v1` profile and selecting it for both native create document capture and native response capture.

## 9. Exact cumulative future technical allowlist

1. `crates/brilliant-core-types/src/json.rs`
2. `crates/brilliant-kernel-contracts/src/codec.rs`
3. `src/core-kernel/codec/strict-input-capture.ts`
4. `src/core-kernel/native/rust-kernel-smoke.ts`
5. `test/core-kernel/cvn-3-strict-input.test.ts`
6. `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`
7. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

No other Rust, `src/**`, fixture, Node adapter, Cargo, package, tsconfig, toolchain, spec or test path may change. In particular, `crates/brilliant-kernel-runtime/src/indices.rs` remains solely owned by the Stage-6 child and is excluded here. Existing Rust unit tests live in the two Rust owner files.

## 10. Future lifecycle allowlist

Only child `task.json`, `operator-handoff.md`, `review-candidate.md`, future `research/implementation-evidence.md`, Rust parent `task.json`, RKP-2 `task.json`, and the current Stage-6 seam-repair `task.json` may record activation, gates, acceptance projection and blocker removal. Planning authority files freeze after independent planning PASS.

## 11. Rejected routes

- Excluding the envelope saves only two values and still rejects `1,199,233`; it also forks counting semantics.
- A test/internal bypass creates a second admission path and cannot prove the product decoder.
- Shrinking the stress fixture invalidates the frozen scale evidence.
- A dynamic cap derived from fixture size destroys a stable public resource contract.

## 12. Audited phase gates and rollback

P1 changes only `crates/brilliant-core-types/src/json.rs`. Contracts immediately imports the new limit, but its old exact-byte snapshot and the TypeScript native adapter still encode/accept the predecessor wire. P1 is therefore a deliberate bounded RED checkpoint, not a green integration candidate.

The exact P1 allowed RED set is:

1. Rust test `codec::tests::structural_rank_beats_source_order_for_compound_faults`: actual property failure bytes contain `1572864/1572865` while its predecessor snapshot still expects `1048576/1048577`.
2. Non-mutating diagnostic `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING`: a fake native rejected envelope carrying exact `1572864/1572865` is currently normalized by `createRustKernelSmokeSession` to `bridge.internal` because `rust-kernel-smoke.ts` still accepts only the predecessor limit. The future committed test is named `fake and real native successor property-limit stays stable`.

The operator records exact commands, test names and failure diffs. Any additional failing test, changed failure code, hang, resource regression or protected-path delta blocks P1. After the P1 commit the operator stops for an independent P1 implementation audit. P2 requires that audit to PASS and separate user authorization.

P2 updated Contracts plus the native TypeScript failure-wire validator and dedicated compatibility test; exact head `0f65272951fd23080b6f536b2e58f50afe249b02` passed independent audit at `0/0/0`.

P3A changes exactly five incremental technical paths: `strict-input-capture.ts`, `rust-kernel-smoke.ts`, `cvn-3-strict-input.test.ts`, the RKP-1A compatibility test and RKP-2 workspace-law. It adds the closed profile, selects it for both native create and response capture, and proves default/native cap-1/cap/cap+1 plus DAG/cloned create, public read and hostile accessor/proxy/cycle/depth/extra/malformed behavior. It stops for independent audit; P3B needs PASS and separate authorization. Reverting P3A returns to audited P2.

P3B technically changes only the RKP-1A compatibility test; any necessary workspace-law projection is limited to its already allowlisted path. It uses the real decoder without bypass, raw and public native journeys, DAG and cloned inputs, repeated reads, exact SHA roles, semantic/extension equality, predecessor rejection, a 180-second isolated-process guard, one success sentinel, bounded cleanup and no partial publication. It records wall/RSS as diagnostics only. It stops for independent audit before P4.

Reverting P2 returns to the audited P1 RED checkpoint; reverting P1 after that restores the former cap and old-wire green state. P4 is docs/evidence freeze only. RKP-2 E2 remains paused until P3A, P3B, P4 and final independent implementation audit PASS, then owner acceptance/archive and explicit integration consume the accepted successor.

## 13. Stage-6 follow-up ownership and resume boundary

P0, P1 and P2 remain immutable audited history. P3A, P3B and P4 are separate commits and separate review gates; this amendment authorizes none of them.

After accepted RKP-1A is archived and integrated into the Stage-6 descendant, Stage6 must create an independent docs-only authority amendment. It freezes semantic versus canonical equality, exactly one Store export, a primary encode plus verification encode, and the two SHA roles. After that amendment passes planning rereview, its technical allowlist is exactly `crates/brilliant-kernel-runtime/src/indices.rs` and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. The seam removes raw-input-byte equality and proves semantic equality plus encode/decode/verification re-encode canonical equality; `canonicalBytesEqual` means Rust canonical encode equals verification re-encode. E1R2 then needs independent implementation audit PASS before separate authorization can resume E2.
