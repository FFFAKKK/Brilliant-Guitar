# RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Goal

Create a versioned successor to the archived RKP-1 JSON resource-limit authority so the frozen RKP-2 scale request is admitted through the one public decoder without weakening the byte cap, depth cap, deterministic failures or bounded-retention laws.

## Background

- Exact planning base is `639e93555c15b46c54c8e9bb7ec610d4a77c7478`. RKP-2 Stage 6 E1 and E1R are green; E2 is not started.
- Independent root-cause audit classified P0/P1/P2 as `0/1/0`: the public JSON value-count cap rejects the frozen request before the scale seam can run.
- The first independent planning audit returned P0/P1/P2=`0/3/1`; this bounded repair closes the native TypeScript wire consumer, staged RED review gates, current lifecycle projection and workspace-law evidence attribution. Targeted planning rereview remains pending.
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

### R6 — real frozen-scale admission

The existing `createStressCvn7Score()` fixture is read-only and remains the sole fixture owner. Its `102,400` Events, `51,200` Notes, `15,013,904` canonical score bytes and `15,013,932` create-request bytes do not change. The exact request passes real `decode_create_request` with no test/internal bypass, then completes native create/read/export parity before RKP-2 E2 can resume.

### R7 — consumer and public compatibility

`src/core-kernel/native/rust-kernel-smoke.ts` is an existing public-wire consumer: its native `codec.property-limit` validator must accept exactly `limit=1_572_864` and preserve `actual=1_572_865`, never downgrading the valid successor failure to `bridge.internal`. The new compatibility test freezes fake and real native journeys.

`src/core-kernel/codec/strict-input-capture.ts#STRICT_INPUT_MAX_PROPERTIES` remains read-only at `1_048_576`: it counts JavaScript object members and array elements during TypeScript descriptor capture, not Rust serialized-JSON values. It is neither the Rust cap owner nor a second admission path, and this task does not change TypeScript default codec behavior.

Foundation DTOs, extension payloads, Runtime records, Session and Node indirect consumers receive regression coverage. Public inventories remain `28/51/8/34/9`, native exports remain two, schema remains `brilliant-score-1`, stable failures remain 22 and TypeScript remains the default runtime.

### R8 — audited staged transition

P1 is intentionally a bounded RED checkpoint after only the Core Types authority changes. Its exact allowed failures are the old Contracts property-limit exact-byte snapshot and a non-mutating native-adapter successor-limit probe; any other failure blocks. P1 stops for a dedicated independent implementation audit. Only PASS plus separate user authorization permits P2.

P2 closes Contracts snapshots/resources and the native TypeScript wire consumer, then stops for another independent implementation audit before P3. Rolling back P2 returns only to the audited P1 RED state; rolling back P1 is required to restore the old-cap/old-wire green state.

### R9 — lifecycle boundaries

Planning does not authorize `task.py start`, production edits, acceptance, archive, integration, push, Stage 6 E2, RKP-3, default cutover or qualification. The RKP-2 seam repair remains paused after green E1/E1R.

## Acceptance Criteria

- [ ] Independent planning audit accepts the exact planning candidate at P0/P1/P2=`0/0/0`.
- [ ] Future P1 proves the single Core Types cap and exact old/new boundary migration, reproduces only the frozen bounded RED set, then passes an independent P1 implementation audit before P2 authorization.
- [ ] Future P2 proves exact property failure bytes, native fake/real wire preservation, precedence, bounded scan-only retention and 64 MiB pre-copy rejection, then passes an independent P2 implementation audit before P3 authorization.
- [ ] Future P3 proves the unchanged frozen request passes real decoder plus native create/read/export and all listed consumers.
- [ ] Public `28/51/8/34/9`, two exports, 22 failures, `brilliant-score-1` and TypeScript default show zero drift.
- [ ] Every implementation phase is independently revertible and no path outside the exact allowlists changes.

## Out of Scope

- Changing the frozen fixture, counts or bytes.
- Excluding the two-value request envelope from counting.
- Any test-only/internal decoder bypass.
- E1 seam changes, E2 worker/process harness, RKP-2 S6.2/S6.3, Runtime/Session/Node adapter production changes beyond the one allowlisted TypeScript native wire validator, RKP-3 or qualification.
- Editing archived RKP-1 or promoting this candidate into active `.trellis/spec/**` before acceptance.
