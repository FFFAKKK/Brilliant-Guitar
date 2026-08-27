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

`src/core-kernel/native/rust-kernel-smoke.ts` validates the Rust native response envelope. The P1 predecessor still hard-coded `codec.property-limit.limit===1_048_576`; P2 changed that wire validator at exact audited head `0f65272951fd23080b6f536b2e58f50afe249b02` to accept only successor `1_572_864`. Its fake and real `newCap+1` regressions preserve exact `codec.property-limit` facts `1572864/1572865` and reject predecessor/extra/malformed facts as `bridge.internal`. P3A does not edit that validator again: it owns only the capture-profile definition and selection of `native-wire-v1` at both create-document and read-response capture call sites.

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

The original seven lifecycle owners are only child `task.json`, `operator-handoff.md`, `review-candidate.md`, future `research/implementation-evidence.md`, Rust parent `task.json`, RKP-2 `task.json`, and the current Stage-6 seam-repair `task.json`. They are the sole P4 lifecycle owners; planning authority files freeze after independent planning PASS.

The current A amendment is not P4 B. Its direct parent is exact `e4103b779574fcdc728d024c1b8f30244cb332c3`, it changes exactly the thirteen A planning/projection paths, and it contains no workspace-law edit. It must not name its own hash. After targeted independent planning PASS for exact A and separate user authorization, B has direct parent accepted A and exactly eight changed paths: the original seven lifecycle owners plus `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. That eighth path has only the one-time mechanical governance-projection responsibility; it is not a lifecycle owner.

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

P3B technically changes only the RKP-1A compatibility test; any necessary workspace-law projection is limited to its already allowlisted path. It uses the real decoder without bypass, raw and public native journeys, DAG and cloned inputs, repeated reads, exact SHA roles, semantic/extension equality, predecessor rejection and the single-file self-worker protocol in section 12.1. It records wall/RSS as diagnostics only. Its bounded implementation audit passed at the reviewed parent `e4103b779574fcdc728d024c1b8f30244cb332c3`; the next gate is this P4-entry amendment's targeted planning review.

Reverting P2 returns to the audited P1 RED checkpoint; reverting P1 after that restores the former cap and old-wire green state. P4 B is docs/evidence freeze only and cannot begin until exact A passes targeted planning review and receives separate authority. B's workspace-law projection fixes the non-merge, no-extra-commit history `bd8946e → f06c57b → 673a2b9 → e4103b7 → accepted A → HEAD`: each historical segment and cumulative assertion remains, `e4103b7..A` is exactly A's thirteen planning/projection paths, and `A..HEAD` is exactly B's eight paths. It must not hard-code B's own hash, use a wildcard/directory exemption or tolerate a merge/empty/extra commit. B alone sets candidate-ready true with review pending; archive, integration and E2 remain false.

The rollback projection is deliberately not a normal `git revert B`. If required after B, create one later exact eight-path governance rollback descendant: restore only the seven lifecycle owners to the accepted-A not-ready state, retain the workspace-law path to freeze the B→rollback chain, and reject a second owner. A itself remains intact. RKP-2 E2 remains paused until P4, final independent implementation audit, owner acceptance/archive and explicit integration consume the accepted successor.

### 12.1 P3B single-file self-worker v1

#### Entry and recursion guard

The sole source and worker entry is `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`; the compiled path is the corresponding `dist/test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.js`. No helper/worker file is added.

The normal test parent launches exactly:

```text
process.execPath <absolute-compiled-test-file> --rkp1a-p3b-self-worker-v1
```

with `child_process.spawn(..., { cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })`. The child environment inherits the session environment after deleting `NODE_TEST_CONTEXT`, then sets:

- `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1=1`;
- `BRILLIANT_RKP1A_P3B_REQUEST_V1=<absolute E:-scratch request.json>`;
- `BRILLIANT_RKP1A_P3B_RESULT_V1=<absolute E:-scratch result.json>`;
- `TEMP` and `TMP` to the owned E:-scratch leaf; `CARGO_TARGET_DIR` remains the session E: target and `CARGO_INCREMENTAL=0`.

The repository remains TypeScript CommonJS (`tsconfig.json#compilerOptions.module=CommonJS`). The test uses the exact compatible namespace import `import * as path from "node:path"` and computes direct entry only as `path.resolve(process.argv[1] ?? "") === path.resolve(__filename)`; a default `node:path` import, an ESM URL entry, ESM output and any `tsconfig` change are forbidden. Worker mode is active only when all four conditions hold: the CommonJS direct-entry expression is true; `process.argv.slice(2)` is exactly `['--rkp1a-p3b-self-worker-v1']`; `process.env.BRILLIANT_RKP1A_P3B_SELF_WORKER_V1 === '1'`; and `NODE_TEST_CONTEXT` is absent. Any argv/env marker with an incomplete combination rejects as `p3b.recursion-guard` before test registration or child spawn. A normal `node:test` load has `NODE_TEST_CONTEXT`, never enters the worker body and only registers/runs tests. The direct worker registers no tests, calls the worker body exactly once and contains no self-spawn path. Compile/recursion fixtures must positively compile and exercise this CommonJS formula, reject argv/env/direct-entry mismatches, and prove a `NODE_TEST_CONTEXT` child cannot recurse.

#### Success sentinel and exact evidence schema

The internal prefix is exactly `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:`. On workload success the worker atomically writes `result.json`, then writes to stdout exactly `<prefix><compact-json>\n`. The result-file UTF-8 bytes must equal the compact JSON bytes after the prefix. Stderr must be empty.

The JSON object has exactly the keys and nesting below, in the shown serialization order. Every integer is a JSON integer in `0..=Number.MAX_SAFE_INTEGER`; all frozen counters/bytes equal the literals below, `workloadElapsedMicros > 0`, and `peakRssBytes > 0`. Hashes are exact lowercase 64-hex literals. Every proof field is literal `true`. Missing, duplicate or extra keys at any depth, wrong types, non-integers, out-of-range numbers, non-finite/coerced values or a different key order are malformed protocol.

```json
{
  "schemaVersion": 1,
  "status": "ok",
  "fixtureId": "cvn7-stress-v1",
  "counts": {
    "measures": 400,
    "parts": 16,
    "staves": 16,
    "measureContents": 6400,
    "voices": 12800,
    "events": 102400,
    "notes": 51200,
    "extensions": 18,
    "partOwnedExtensions": 16,
    "unknownExtensions": 1,
    "documentRustValues": 1199233,
    "documentTypescriptMembers": 1199232,
    "createRequestRustValues": 1199235,
    "createRequestTypescriptMembers": 1199234,
    "requestEnvelopeValues": 2,
    "readResponseRustValues": 1199245,
    "readResponseTypescriptMembers": 1199244,
    "directDagCaptureMembers": 1045635
  },
  "bytes": {
    "inputScore": 15013904,
    "createRequest": 15013932,
    "readResponse": 15014112,
    "rustCanonicalExport": 15013904
  },
  "hashes": {
    "inputScoreSha256": "5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e",
    "rustCanonicalExportSha256": "4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7"
  },
  "proofs": {
    "realDecodeCreateRequest": true,
    "directDagRawJourney": true,
    "directDagPublicJourney": true,
    "clonedTreeRawJourney": true,
    "clonedTreePublicJourney": true,
    "repeatedRawReadStable": true,
    "repeatedPublicReadStable": true,
    "semanticDeepEqual": true,
    "extensionsDeepEqual": true,
    "predecessorRejected": true,
    "zeroPartialPublication": true
  },
  "diagnostics": {
    "workloadElapsedMicros": 1,
    "peakRssBytes": 1
  }
}
```

The two diagnostic `1` values above denote their minimum allowed value, not frozen observed evidence; the final candidate records the actual safe integers. No path, raw native output, stack, handle, RuntimeHandle, partial counters or partial success object is allowed in the sentinel.

#### Output, timeout, shutdown and cleanup

Raw stdout and stderr are each capped at exactly `1_048_576` bytes while streaming; the harness stops retaining at the cap and observes `p3b.stdout-overflow` or `p3b.stderr-overflow` on the first additional byte. Successful stdout is exactly one LF-terminated sentinel line and nothing else, and successful stderr is zero bytes. Prefix count zero is `p3b.sentinel-missing`; prefix count greater than one is `p3b.sentinel-duplicate`; one prefix plus leading/trailing/multiple-line output, invalid UTF-8/JSON, result-file mismatch or exact-schema violation is `p3b.sentinel-malformed`.

Every failure observation executes the single rule `primary ??= failure`; there is no later category-ranking rewrite. The observation checkpoints are spawn/start, the `180000 ms` timeout, spontaneous signal/nonzero exit, stdout/stderr overflow, missing/duplicate/malformed sentinel, semantic/hash/count mismatch and cleanup. Thus overflow observed before the timer remains primary when the timer later fires, while timeout observed before a termination-induced signal/nonzero remains primary. Termination, reap and cleanup outcomes are secondary state unless no primary exists, in which case their own deterministic failure is promoted through the same `primary ??=` rule. No infrastructure status can overwrite an earlier workload/protocol failure.

The `180000 ms` timer starts immediately before the single `spawn()` call and measures spawn through settlement; it is never restarted. Timeout or either overflow requests one Windows process-tree termination by launching exactly `taskkill.exe` with argv `['/PID', String(pid), '/T', '/F']`, `shell:false` and `windowsHide:true`. The taskkill launch/settlement has an independent `5000 ms` guard. Its exact secondary `terminateStatus` is `not-required | succeeded | launch-error | nonzero | timeout`; launch error, nonzero exit or timeout makes the harness fail closed even if the child later exits, and becomes primary only when none existed. After termination starts, child `close`/reap has its own `5000 ms` guard and exact `reapStatus` `not-required | succeeded | timeout`; missing `close` becomes `p3b.reap-timeout` and is promoted only when no primary exists. Termination-induced signal/nonzero is recorded only as secondary and never replaces the overflow, timeout or protocol failure that caused termination. Test-only injected taskkill outcomes never perform a destructive OS operation.

The parent exclusively owns the resolved temporary leaf after creation. All `request.json`, `result.json`, captured stdout/stderr and any native/request scratch live below `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap\p3b`; default `C:\Users\ATOM\AppData\Local\Temp`, an implicit C: temp and a default C: Cargo target are forbidden. Cleanup first closes and confirms closed every child/request/result/stdout/stderr handle. It then deletes and confirms absence of the exact owned E:-scratch leaf with a `5000 ms` guard per attempt, at most two attempts and exactly `100 ms` between attempts. `cleanupStatus` is `succeeded | failed`; `cleanupRecovered` is true only when the first attempt failed and the second succeeded. That recovered case is successful. Two failed attempts are `p3b.cleanup-failed`: secondary when a primary already exists, otherwise promoted to primary. The fixture releases any injected lock after asserting protocol state and separately removes its fault artifact; fixture teardown is not credited as harness cleanup.

Only exit code zero, no signal, no primary, no terminate/reap failure, both bounded streams, exactly one exact sentinel/result pair, every frozen assertion and successful cleanup constitute evidence. Every rejection settles nonzero, retains its first observed primary plus secondary statuses for test-local assertions, and publishes no partial success.

#### Executable negative matrix

The same test file owns test-local injectable spawn/clock/taskkill/filesystem seams and self-worker fault modes; they are not product exports or environment contracts and never invoke a real destructive OS command to manufacture failure. Focused tests must cover: CommonJS direct-entry true/false and compile behavior; argv/env mismatch and `NODE_TEST_CONTEXT` recursion guard with zero child spawns; overflow observed before timeout and timeout observed before a later signal; taskkill launch error, nonzero and timeout; child close/reap timeout; cleanup first-attempt failure then second-attempt recovery; cleanup two-attempt failure; explicit nonzero and spontaneous signal; stdout cap+1 and stderr cap+1; missing and duplicate sentinel; invalid JSON; mixed output; missing/wrong/extra nested fields; and result/sentinel byte mismatch. Each case asserts bounded settlement, first-observed primary preservation, exact secondary state, zero partial publication and no residual E:-scratch artifact after test-local fault teardown.

## 13. Stage-6 follow-up ownership and resume boundary

P0, P1 and P2 remain immutable audited history. P3A, P3B and P4 are separate commits and separate review gates; this amendment authorizes none of them.

After accepted RKP-1A is archived and integrated into the Stage-6 descendant, Stage6 must create an independent docs-only authority amendment. It freezes semantic versus canonical equality, exactly one Store export, a primary encode plus verification encode, and the two SHA roles. After that amendment passes planning rereview, its technical allowlist is exactly `crates/brilliant-kernel-runtime/src/indices.rs` and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. The seam removes raw-input-byte equality and proves semantic equality plus encode/decode/verification re-encode canonical equality; `canonicalBytesEqual` means Rust canonical encode equals verification re-encode. E1R2 then needs independent implementation audit PASS before separate authorization can resume E2.
