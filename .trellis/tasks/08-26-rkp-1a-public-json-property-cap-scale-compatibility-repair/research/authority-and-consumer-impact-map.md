# Authority and Consumer Impact Map

## Current authority

- Sole numeric owner: `crates/brilliant-core-types/src/json.rs#JSON_PROPERTY_LIMIT`.
- Core consumer: `BoundedJsonValue::validate_limits()`.
- Public request consumer: `crates/brilliant-kernel-contracts/src/codec.rs#StrictState`, which imports the Core Types constant.
- Historical authority: archived RKP-1 task; immutable.
- Successor candidate: this RKP-1A child; planning review pending.

No active spec is changed in this candidate. A later spec/authority promotion, if required, is a separate docs-only decision after implementation acceptance.

## Consumer graph

`JSON_PROPERTY_LIMIT` → Core Types bounded data-only JSON → Foundation extension payloads → Contracts strict public request decoder → Runtime import → Session publication → existing two-export Node bridge.

Core Types owns the numeric resource constant. Contracts imports it. The existing TypeScript native response validator in `src/core-kernel/native/rust-kernel-smoke.ts` is a wire consumer and must update its accepted `codec.property-limit.limit` to `1_572_864`; it does not become a cap authority.

`src/core-kernel/codec/strict-input-capture.ts#STRICT_INPUT_MAX_PROPERTIES=1_048_576` remains read-only. It counts JavaScript object members/array elements during descriptor capture, unlike Rust's object/array/primitive serialized-value count. The equal predecessor number is coincidental contract history, not shared ownership.

Foundation, Runtime, Session and Node native production layers receive tests, not implementation edits.

## Stable compatibility

- StableFailureV1 remains 22 variants.
- `codec.property-limit` keeps exact `limit`/`actual` fields.
- Depth 64 and request/response 64 MiB remain.
- `brilliant-score-1`, public `28/51/8/34/9`, two Node exports and TypeScript default remain.

## Blocker projection

The current Stage-6 seam child is in progress with E1/E1R green and E2 not started. Its external blocker is `public-json-property-cap-contract-conflict`. RKP-2 stays the sole active implementation child and is operationally paused. This RKP-1A task is the Rust parent's current planning child; the next gate is targeted independent planning rereview, not E2.
