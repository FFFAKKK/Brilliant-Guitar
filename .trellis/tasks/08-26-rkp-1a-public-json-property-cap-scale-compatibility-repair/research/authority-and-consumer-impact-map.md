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

Only the first two code owners may change. Downstream layers receive tests, not implementation edits.

## Stable compatibility

- StableFailureV1 remains 22 variants.
- `codec.property-limit` keeps exact `limit`/`actual` fields.
- Depth 64 and request/response 64 MiB remain.
- `brilliant-score-1`, public `28/51/8/34/9`, two Node exports and TypeScript default remain.

## Blocker projection

The current Stage-6 seam child remains in progress with E1/E1R green and E2 not started. Its external blocker is `public-json-property-cap-contract-conflict`. RKP-2 stays in progress and operationally paused. The Rust parent points its planning gate to this child's independent review while retaining the active implementation relationships.
