# Authority and Consumer Impact Map

## Current authority

- Sole numeric owner: `crates/brilliant-core-types/src/json.rs#JSON_PROPERTY_LIMIT`.
- Core consumer: `BoundedJsonValue::validate_limits()`.
- Public request consumer: `crates/brilliant-kernel-contracts/src/codec.rs#StrictState`, which imports the Core Types constant.
- Historical authority: archived RKP-1 task; immutable.
- Successor implementation: this RKP-1A child; P0-P2, P3A and P3B are complete and independently audited historical stages through exact `e4103b779574fcdc728d024c1b8f30244cb332c3`. The live gate is only A3's targeted P4-entry planning review; B/P4 lifecycle remains unauthorized.

No active spec is changed in this candidate. A later spec/authority promotion, if required, is a separate docs-only decision after implementation acceptance.

## Consumer graph

`JSON_PROPERTY_LIMIT` → Core Types bounded data-only JSON → Foundation extension payloads → Contracts strict public request decoder → Runtime import → Session publication → existing two-export Node bridge.

Core Types owns the numeric resource constant. Contracts imports it. The existing TypeScript native response validator in `src/core-kernel/native/rust-kernel-smoke.ts` is a failure-wire consumer and was updated in P2 to accept `codec.property-limit.limit=1_572_864`; it does not become a Rust cap authority.

`src/core-kernel/codec/strict-input-capture.ts#captureStrictInput` is the sole TypeScript capture/profile owner. Its default remains `STRICT_INPUT_MAX_PROPERTIES=1_048_576`; a closed `native-wire-v1=1_572_864` profile is added for the native create-document and read-response captures. Call sites select profiles and never duplicate limits. It counts JavaScript object members/array elements during descriptor capture, unlike Rust's object/array/primitive serialized-value count. The equal predecessor number is coincidental contract history, not shared ownership.

Foundation, Runtime, Session and Node addon production layers receive tests, not implementation edits. Foundation `BTreeMap` remains the payload-object canonical-order owner; TypeScript encoder and the frozen fixture remain unchanged.

## Stable compatibility

- StableFailureV1 remains 22 variants.
- `codec.property-limit` keeps exact `limit`/`actual` fields.
- Depth 64 and request/response 64 MiB remain.
- `brilliant-score-1`, public `28/51/8/34/9`, two Node exports and TypeScript default remain.

## Blocker projection

The current Stage-6 seam child is in progress with E1/E1R green and E2 not started. Its external blocker is `public-json-property-cap-contract-conflict`. RKP-2 stays the sole active implementation child and is operationally paused. This RKP-1A task is the Rust parent's in-progress dependency repair with P0-P2/P3A/P3B complete and audited. The no-commit P3 attempt and P3 planning repairs are historical only. The next gate is targeted independent planning review of A3, not E2 and not a reopened P3 stage.

P3B added no authority owner or file: the existing RKP-1A compatibility test is also the one CommonJS direct self-worker. Its `__filename` entry check, argv/env/`NODE_TEST_CONTEXT` guard, first-observed process state, exact taskkill/reap status and bounded E:-scratch cleanup are completed evidence-only and test-local; no production helper or OS fault hook was created. After future B/P4 and final implementation audit, owner acceptance/archive and integration, Stage6 alone owns a separate docs-only authority amendment. That amendment may later authorize only `indices.rs` plus RKP-2 workspace-law to replace raw-input equality with semantic equality and Rust canonical encode/re-encode equality. RKP-1A never owns `indices.rs`.
