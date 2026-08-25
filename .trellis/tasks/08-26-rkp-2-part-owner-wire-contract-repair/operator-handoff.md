# Operator Handoff — RKP-2 Part Owner Wire Contract Repair

## Current status

`R0 ACTIVATED — R1 READY`.

- Branch: `codex/rkp-2-part-owner-wire-contract-repair`
- Worktree: `.worktrees/rkp-2-part-owner-wire-contract-repair`
- Exact planning base: `ce673a2ad62348fa73458d493a45f9c005bf0288`
- Parent: `08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- Status: `in_progress`
- `task_start_run=true`
- `production_implementation_authorized=true`
- `independent_planning_review=passed`
- Accepted planning head: `ee1af9409b4140d322c88389a4c1df1368655a31`
- Targeted planning rereview: PASS, P0/P1/P2=`0/0/0`
- `implementation_candidate_ready=false`
- TypeScript remains default.

The original RKP-2 worktree remains on the same base, clean and unmodified by this planning branch. Stage 6 is historically started/authorized at S6.0, but operationally paused before S6.1. S6.2 and S6.3 are also not started.

## Blocking finding

The accepted public Part owner is `{ "kind": "part", "partId": "part-1" }`. Foundation's private Rust field is `part_id` without a serde field rename. Contracts and TypeScript correctly require `partId`; Runtime only clones a validated owner. Therefore Foundation is the unique repair owner.

The planned production attribute is exactly:

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

No `alias`, custom codec, migration, public DTO or failure is permitted.

The fixed serde configuration closes unknown fields on the struct-like `Part` variant, but derived serde does not directly reject extras on the internally tagged unit `Score` variant. Exact `Score` normal decode/encode stays in Foundation tests; score-extra rejection remains exclusively with the existing Contracts descriptor-first strict walk and TypeScript strict codec. Foundation must not add a custom deserializer or change the unit variant.

## Future implementation boundary

Technical paths are exactly six:

1. `crates/brilliant-score-foundation/src/dto.rs`
2. `crates/brilliant-score-foundation/src/codec.rs`
3. `crates/brilliant-kernel-contracts/src/codec.rs`
4. `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts`
5. `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts`
6. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Execution is R0 activation, R1 Foundation Part mapping/direct serde tests, R2 Contracts/native/workspace-law exact-shape proof, R3 full evidence/candidate freeze. Each is independently reversible.

## Next action

Proceed only to R1 Foundation serde mapping/tests. The implementation authorization covers R0–R3 of this child, not RKP-2 S6.1, acceptance, archive, integration, push, cutover, qualification or RKP-3.

The first independent planning review of `7e211869b7ab8d5ead3916ca8d98107d55f182db` returned P0/P1/P2=`0/1/0` because it incorrectly required Foundation to reject score extras directly. Exact repaired head `ee1af9409b4140d322c88389a4c1df1368655a31` passed targeted rereview at `0/0/0` and is the sole implementation authority.

Planning validation used the exact clean `ce673a2...` technical baseline because the accepted RKP-2 workspace-law must reject this not-yet-reviewed child until R2 updates the already allowlisted governance test. Baseline evidence is Rust `70/70`, native `13/13`, and dynamic runner 78 files / manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5` / `576 discovered, 575 pass, 1 expected GC skip, 0 fail`.

The planning candidate workspace-law remains fail-closed at `6/7`; the exact clean base remains `7/7`. The repair does not modify or relax that test.

Do not continue RKP-2 Stage 6, accept/archive/integrate, push, qualify, cut over or create RKP-3. Stop after R3 at independent implementation review.
