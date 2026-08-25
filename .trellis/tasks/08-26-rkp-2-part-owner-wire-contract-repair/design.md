# Design — RKP-2 Part Owner Wire Contract Repair

## 1. Authority and lifecycle

Planning base is exactly `ce673a2ad62348fa73458d493a45f9c005bf0288` on the preserved RKP-2 implementation line. That commit is S6.0 only: Stage 6 is started and authorized, but S6.1/S6.2/S6.3 have not begun and the RKP-2 candidate is not ready.

Authority order for this repair is:

1. accepted Architecture Reset V2;
2. accepted `brilliant-score-1` TypeScript model and strict codec;
3. accepted RKP-2 plan and Stage 1–5 implementation history;
4. this bounded repair plan after independent planning PASS;
5. later implementation candidate after independent implementation PASS.

This plan does not start the child, authorize production implementation, accept/archive anything, run qualification, switch the default runtime or create RKP-3.

## 2. Frozen public wire

The public `ExtensionOwner` wire is closed to exactly two shapes:

```json
{"kind":"score"}
```

```json
{"kind":"part","partId":"part-1"}
```

`part_id` is not a compatibility spelling. It is forbidden on input and output. No alias or migration is introduced because the snake_case spelling was never an accepted public contract.

## 3. Root cause and non-root causes

### 3.1 Root cause

`crates/brilliant-score-foundation/src/dto.rs` defines:

```rust
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ExtensionOwnerV1 {
    Score,
    Part { part_id: StableId },
}
```

The enum variant rename covers `Score -> score` and `Part -> part`; it does not rename the struct-variant field. Consequently, derived deserialization expects `part_id`, public `partId` fails after Contracts, and serialization emits `part_id`.

### 3.2 Explicit non-root causes

- Contracts strict walk already requires exact keys `kind` and `partId`, rejects extras and never authorizes `part_id`.
- TypeScript `decodeExtensionOwner` already requires exact keys `kind` and `partId`.
- Runtime stores and exports `record.owner.clone()`; it neither invents nor rewrites the owner wire.
- Score-owned owners contain no field and therefore avoid the drift.

### 3.3 Affected behavior

- Rust load/create of a valid Part-owned block;
- typed export/encode of a Part-owned block;
- unknown Part-owned extension preservation and canonical native read;
- Stage 6 hostile/finality proof that combines score-owned and Part-owned blocks.

The stable failure model, Node boundary and public export counts are not root causes and must remain unchanged.

## 4. Exact production change

The only production behavior change is frozen as:

```rust
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ExtensionOwnerV1 {
    Score,
    Part {
        #[serde(rename = "partId")]
        part_id: StableId,
    },
}
```

Contract consequences:

- `rename = "partId"` applies in both deserialize and serialize directions;
- no `alias = "part_id"` is permitted;
- enum-level `deny_unknown_fields` rejects unknown fields for both variants;
- `{kind:"part", partId, part_id}` rejects rather than selecting one spelling;
- the private Rust field remains idiomatic `part_id`; the public DTO and JSON remain camelCase;
- no custom serializer/deserializer, migration layer or secondary owner type is introduced.

## 5. Boundary flow and ownership

```text
request bytes
  -> Contracts bounded strict JSON walk (exact public partId shape)
  -> Foundation serde DTO decode (this repair)
  -> Foundation semantic validation (owner Part ID resolves)
  -> Runtime record/topology/index import (clone validated owner)
  -> Runtime canonical topology export
  -> Foundation/Contracts serde encode (this repair emits partId)
  -> Session/Node existing read result
```

There is one public shape owner: the accepted score schema. Foundation implements its Rust DTO mapping; Contracts captures hostile shape and stable failure precedence; Runtime owns no wire conversion.

## 6. Failure and publication contract

- `part_id` alone is rejected by the existing Contracts exact-shape gate as `codec.invalid-shape` at `document/extensions/<index>/owner/partId` with `missing-field`; the later extra-field candidate must not replace the higher-ranked missing-field result.
- `partId` plus `part_id` is rejected as `codec.invalid-shape` at `document/extensions/<index>/owner` with `extra-field`.
- score owner plus any extra field is rejected at that owner path with `extra-field`.
- invalid/empty/non-string `partId` retains existing shape/semantic mapping and exact stable bytes.
- direct Foundation tests bypass Contracts only to prove serde exactness; a serde shape error remains workspace-internal and does not create a public failure variant.
- every rejected native create returns payload only and publishes zero handle/session/runtime/store.
- the StableFailureV1 union remains exactly 22.

## 7. Literal future implementation allowlist

Exactly six technical paths may change:

1. `crates/brilliant-score-foundation/src/dto.rs`
2. `crates/brilliant-score-foundation/src/codec.rs`
3. `crates/brilliant-kernel-contracts/src/codec.rs`
4. `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts`
5. `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts`
6. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Lifecycle/evidence ownership is limited to:

- this child task's already planned artifacts and later `research/implementation-evidence.md`;
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`;
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md`;
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md`;
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`.

All other `crates/**`, `src/**`, `test/**`, Cargo/toolchain/rustfmt, package/tsconfig, spec and task paths are protected. A required seventh technical path stops implementation for planning rereview.

## 8. Test matrix

| Layer | Required proof | Frozen outcome |
| --- | --- | --- |
| Foundation DTO | exact Part `partId` deserialize/serialize | round-trip equal; encoded owner has only `kind,partId` |
| Foundation DTO | `part_id` only | reject; no alias |
| Foundation DTO | `partId` plus `part_id` | reject unknown field |
| Foundation DTO | score owner exact / score owner extra | exact succeeds; extra rejects |
| Contracts | public `partId` create request | decode succeeds and reaches validated DTO |
| Contracts | malformed owner variants | existing exact stable code/path/violation and canonical bytes |
| Fixture/native | ordered score + Part unknown blocks | nested JSON, arrays and block order preserved |
| Native | create then repeated read | accepted; byte-repeatable; detached; only `partId` |
| Native | `part_id` and combined extra | rejected payload only; zero handle |
| Governance | source/static scan | no serde alias; no `part_id` public fixture/output; exact six paths |
| Public inventory | Node/failure/TS/schema | `2`, `22`, `28/51/8/34/9`, `brilliant-score-1` unchanged |
| Regression | prior S6.1 RED | becomes GREEN without changing Runtime/Node/public schema |

No public fault hook is needed. Tests exercise the real Foundation decoder, Contracts request decoder and native create/read path rather than duplicating production logic.

## 9. Compatibility and resource behavior

- This repair restores an already accepted field name; it does not version or migrate the schema.
- Unknown extension payload remains opaque `BoundedJsonValue`; no payload key is interpreted.
- Canonical block and nested array order remain governed by the existing topology/export and canonical encoding paths.
- Request/response caps, reserve-fault precedence, panic containment and handle publication laws remain unchanged.
- Score-owner behavior remains byte-compatible.

## 10. Staging and rollback

- **R0:** activation/lifecycle only. Roll back to the accepted planning head without production delta.
- **R1:** Foundation serde mapping and direct tests. Roll back R1 alone to restore pre-repair DTO behavior.
- **R2:** Contracts/native/fixture/workspace-law proof. Roll back R2 without removing the independently reviewable R1 fix.
- **R3:** evidence and candidate freeze only. Roll back R3 to reopen implementation evidence without changing technical commits.

After independent implementation PASS, owner closeout accepts and natively archives this child, then integrates the accepted descendant into the preserved RKP-2 branch. Only that integrated prerequisite may resume RKP-2 S6.1 under its already recorded Stage 6 authorization.

## 11. Exclusions

No commands, transactions, history, incremental validation, provider/WASM, Guitar/Piano/Bass, Product Host, Tauri, public plugin, RKP-3, default runtime cutover, qualification measurement, Cargo dependency, Node export or schema change is included.

## 12. Planning review focus

The independent planner should verify:

1. field-level `rename` plus enum-level `deny_unknown_fields` is the unique narrow serde repair;
2. `part_id` cannot be accepted through an alias or escape Contracts;
3. strict failure paths and publication behavior are frozen;
4. the six technical paths and lifecycle projections are complete but not expansive;
5. R0–R3, independent implementation review, archive/integration and S6.1 resume are distinct gates.
