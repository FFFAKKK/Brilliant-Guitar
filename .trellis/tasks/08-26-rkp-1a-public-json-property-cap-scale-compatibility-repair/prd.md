# RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Goal

Create a versioned successor to the archived RKP-1 JSON resource-limit authority so the frozen RKP-2 scale request is admitted through the one public decoder without weakening the byte cap, depth cap, deterministic failures or bounded-retention laws.

## Background

- Exact planning base is `639e93555c15b46c54c8e9bb7ec610d4a77c7478`. RKP-2 Stage 6 E1 and E1R are green; E2 is not started.
- Independent root-cause audit classified P0/P1/P2 as `0/1/0`: the public JSON value-count cap rejects the frozen request before the scale seam can run.
- The first independent planning audit returned P0/P1/P2=`0/3/1`; its bounded repair was accepted at `1cd0caadff218c1471f67cdf1a1ab78f5653a605`. P0, P1 and P2 are implemented and independently audited at `0/0/0` through exact P2 head `0f65272951fd23080b6f536b2e58f50afe249b02`.
- A later P3 attempt produced no commit and was fully reverted. Independent root-cause audit returned P0/P1/P2=`0/2/0`: the remaining blockers are the TypeScript native capture profile and an incorrect raw-byte canonical-parity assumption. The first amendment candidate at `978160e69b69d643c3d61ca946bde10bfe4aefb0` then received P0/P1/P2=`0/1/1`: its P3B self-worker protocol was under-specified and one P2 wire-validator sentence was stale. This bounded docs-only repair closes only those findings; targeted planning rereview remains pending.
- The request has `1,199,235` counted JSON values. The existing `1,048,576` limit records `1,048,577` only because that is the first rejected value, not the complete request count.
- `brilliant-core-types` owns `JSON_PROPERTY_LIMIT`; `brilliant-kernel-contracts::StrictState` imports it. Archived RKP-1 remains immutable and this child is the successor authority.

## Requirements

### R1 — one compatibility cap

`JSON_PROPERTY_LIMIT` becomes exactly `1,572,864` (`3 × 524,288`). `BoundedJsonValue` and `StrictState` consume that one Core Types authority. No duplicate constant, bypass or secondary admission path is permitted.

### R2 — stable public failure contract

The stable union stays at 22 variants. Overflow remains `codec.property-limit` with only safe-integer `limit` and `actual` fields. `newCap + 1` emits `limit=1572864` and `actual=1572865` with exact canonical bytes.

### R3 — unchanged surrounding bounds and precedence

Request and response byte caps remain `67,108,864`; JSON depth remains `64`. The existing structural winner order is depth → property → shape → number. UTF-8, JSON syntax, exact shape, protocol/version, schema/structure and native handle stages retain their existing outer order.

### R4 — compatibility migration

The former boundary is no longer a rejection line: `oldCap` and `oldCap + 1` are accepted when otherwise valid for the tested layer. The new boundary is inclusive at `newCap - 1` and `newCap`, and rejects exactly at `newCap + 1`.

### R5 — bounded resource behavior

After overflow, parsing continues in scan-only mode only to finish syntax/resource classification and discover higher-priority depth faults. Post-limit retained values, keys and placeholders remain zero; fault storage stays bounded; unique/duplicate traversal remains linear and deterministic; counters cannot wrap.

### R6 — versioned TypeScript capture admission

`captureStrictInput` remains the sole capture implementation and profile/limit owner. Its `default` profile remains exactly `1,048,576` members/elements and byte-for-byte unchanged. One new profile, and only one, is added: `native-wire-v1` with exact maximum `1,572,864`. Call sites select `default` or `native-wire-v1`; they never repeat the numeric limits.

Both the create-document capture and native read-response capture in `rust-kernel-smoke.ts` select `native-wire-v1`. Create capture overflow still maps to `bridge.capture-invalid`; response capture overflow or malformed input still maps to `bridge.internal`. No failure variant, export or DTO is added.

The exact count bridge is frozen: the document is `1,199,233` Rust values / `1,199,232` TypeScript members; the create request is `1,199,235` values / `1,199,234` members; the read wrapper is `1,199,245` values / `1,199,244` members and `15,014,112` raw bytes. Rust counts the root value, so values equal members plus one; the read wrapper contributes twelve additional edges. The directly shared fixture is a DAG and WeakMap capture sees only `1,045,635` members, while a JSON-cloned equivalent tree has `1,199,232`; P3A/P3B must cover both so incidental DAG sharing cannot mask the product admission contract.

### R7 — real frozen-scale admission and canonical contract

The existing `createStressCvn7Score()` fixture is read-only and remains the sole fixture owner. Its `102,400` Events, `51,200` Notes, `15,013,904` score bytes and `15,013,932` create-request bytes do not change. The exact request passes real `decode_create_request` with no test/internal bypass, then completes native create/read/export proof before RKP-2 E2 can resume.

RKP-2 parity authority is `canonical(input) == canonical(exported)`, not raw input bytes equal raw exported bytes. Foundation `BTreeMap` ordering is the canonical owner for payload objects. The input and Rust export are each `15,013,904` bytes and semantically equal, but their first byte difference is zero-based `15,011,087` / one-based `15,011,088` at `$.extensions[0].payload`: TypeScript input orders `marker` before `generatorVersion`, while Rust canonical output orders `generatorVersion` before `marker`. Input SHA-256 is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical export SHA-256 is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. P3B proves both roles, semantic deep equality, repeated raw/public read stability, and all 18 extensions including 16 Part-owned and one unknown block.

### R8 — consumer and public compatibility

`src/core-kernel/native/rust-kernel-smoke.ts` is an existing public-wire consumer: its native `codec.property-limit` validator must accept exactly `limit=1_572_864` and preserve `actual=1_572_865`, never downgrading the valid successor failure to `bridge.internal`. The new compatibility test freezes fake and real native journeys.

`src/core-kernel/codec/strict-input-capture.ts#STRICT_INPUT_MAX_PROPERTIES` remains the `default` profile at `1_048_576`: it counts JavaScript object members and array elements during TypeScript descriptor capture, not Rust serialized-JSON values. It is neither the Rust cap owner nor a second admission path. Only the versioned `native-wire-v1` profile is added; global default hostile-input behavior remains byte-for-byte unchanged.

Foundation DTOs, extension payloads, Runtime records, Session and Node indirect consumers receive regression coverage. Public inventories remain `28/51/8/34/9`, native exports remain two, schema remains `brilliant-score-1`, stable failures remain 22 and TypeScript remains the default runtime.

### R9 — audited staged transition

P1 is intentionally a bounded RED checkpoint after only the Core Types authority changes. Its exact allowed failures are the old Contracts property-limit exact-byte snapshot and a non-mutating native-adapter successor-limit probe; any other failure blocks. P1 stops for a dedicated independent implementation audit. Only PASS plus separate user authorization permits P2.

P2 closes Contracts snapshots/resources and the native TypeScript failure-wire consumer and has passed independent implementation audit. P3 is split into two separately audited and separately authorized commits. P3A adds `native-wire-v1` and selects it at create and response capture; it stops for independent audit before P3B. P3B alone proves the frozen consumer journey and canonical/semantic roles; it stops for independent audit before P4. Rolling back P3A returns exactly to audited P2. Rolling back P3B removes only consumer evidence.

### R10 — lifecycle boundaries

This amendment does not authorize P3A, P3B, P4, acceptance, archive, integration, push, Stage 6 E2, RKP-3, default cutover or qualification. The RKP-2 seam repair remains paused after green E1/E1R.

### R11 — one-file P3B self-worker evidence protocol

P3B adds no helper, worker or process file. Its only technical owner remains `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`, whose compiled `.test.js` is both the normal `node:test` module and the sole direct self-worker entry. Worker mode requires the exact direct-entry check, exact argv `--rkp1a-p3b-self-worker-v1` and exact environment marker `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1=1`; partial/mismatched markers fail before test registration or child spawn, and worker mode never registers tests or recursively spawns itself.

The parent launches `process.execPath` directly with `shell:false`, `windowsHide:true` and bounded pipes. The worker emits exactly one LF-terminated `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:` compact-JSON sentinel and an exact matching TEMP-only result payload. The recursively exact schema, literal values, safe-integer ranges and no-extra-field rule are frozen in `design.md`; success requires exit 0, no signal, bounded stdout/stderr, exactly one valid sentinel, all semantic/hash/count assertions and completed cleanup. No partial evidence is publishable.

The liveness timer is `180000 ms` from immediately before spawn until normal settlement; it is never restarted. Spawn/start, timeout, spontaneous signal/nonzero, output overflow, sentinel missing/duplicate/malformed, semantic/hash/count mismatch and cleanup have the fixed precedence in `design.md`. Termination, wait/reap and cleanup are separately bounded. Every request/result/stdout/stderr artifact lives below the resolved E: scratch root; neither default C: TEMP nor a default C: Cargo target is permitted.

## Acceptance Criteria

- [x] P0/P1/P2 are complete and independently audited at `0/0/0`; exact P2 head is `0f65272951fd23080b6f536b2e58f50afe249b02`.
- [ ] Targeted planning rereview accepts this P3A/P3B amendment at P0/P1/P2=`0/0/0`.
- [ ] Future P3A proves default/native capture boundaries, DAG and JSON-cloned create, public read and hostile capture regressions, then passes independent audit before separately authorized P3B.
- [ ] Future P3B proves the unchanged frozen request passes real decoder plus raw/public native create/read/export, exact SHA roles, semantic equality and extension preservation, then passes independent audit before P4.
- [ ] Future P3B negative tests exercise recursion guard, timeout, nonzero/signal, both output caps, missing/duplicate/malformed/extra-field sentinel and cleanup failure using the same single-file harness.
- [ ] Public `28/51/8/34/9`, two exports, 22 failures, `brilliant-score-1` and TypeScript default show zero drift.
- [ ] Every implementation phase is independently revertible and no path outside the exact allowlists changes.

## Out of Scope

- Changing the frozen fixture, counts or bytes.
- Excluding the two-value request envelope from counting.
- Any test-only/internal decoder bypass.
- E1 seam or `indices.rs` changes, E2 worker/process harness, RKP-2 S6.2/S6.3, Runtime/Session/Node addon production changes beyond the two allowlisted TypeScript capture/native files, TypeScript encoder changes, RKP-3 or qualification.
- Editing archived RKP-1 or promoting this candidate into active `.trellis/spec/**` before acceptance.
