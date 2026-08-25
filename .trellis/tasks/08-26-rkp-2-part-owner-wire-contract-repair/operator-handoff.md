# Operator Handoff — RKP-2 Part Owner Wire Contract Repair

## Current status

`READY FOR INDEPENDENT IMPLEMENTATION REVIEW`.

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
- R0: `dd6f92759e0254742fd4bf2761fe0d020ec4d3aa`
- R1: `4510fd95f406acc109cad8f120a0050a0e678c2e`
- R2 / exact technical head: `738f746085a2b3f9e3e5520523cf5356b6f6f576`
- R3: this docs-only candidate-freeze commit, exact hash reported after commit
- `implementation_candidate_ready=true`
- `implementation_review=pending`
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

## Implemented boundary

Technical paths are exactly six:

1. `crates/brilliant-score-foundation/src/dto.rs`
2. `crates/brilliant-score-foundation/src/codec.rs`
3. `crates/brilliant-kernel-contracts/src/codec.rs`
4. `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts`
5. `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts`
6. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Execution is R0 activation, R1 Foundation Part mapping/direct serde tests, R2 Contracts/native/workspace-law exact-shape proof, R3 full evidence/candidate freeze. Each is independently reversible.

## Next action

Send the exact R3 HEAD to a dedicated read-only implementation auditor. Review the bidirectional `partId` serde rename without alias, derived-serde responsibility split for Score extras, canonical stable failures/zero publication, ordered unknown score+Part block native round-trip, accepted-head six-path workspace-law anchor, and protected zero-delta. The implementation authorization does not cover RKP-2 S6.1, acceptance, archive, integration, push, cutover, qualification or RKP-3.

The first independent planning review of `7e211869b7ab8d5ead3916ca8d98107d55f182db` returned P0/P1/P2=`0/1/0` because it incorrectly required Foundation to reject score extras directly. Exact repaired head `ee1af9409b4140d322c88389a4c1df1368655a31` passed targeted rereview at `0/0/0` and is the sole implementation authority.

Technical-head validation used a fresh `core.autocrlf=false` clone: Rust `73/73`, fmt/check/clippy/MSRV PASS; Node 20.20.2 and 24.15.0 focused native+parity+workspace-law `23/23`; both dynamic full runners used 78 files and manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, with `579 discovered, 578 pass, 1 expected GC skip, 0 fail`. Typecheck/build, Trellis, JSON/JSONL, exact path and protected-delta gates pass.

No independent implementation PASS is claimed. RKP-2 Stage 6 remains operationally paused at S6.0, before S6.1.

Do not continue RKP-2 Stage 6, accept/archive/integrate, push, qualify, cut over or create RKP-3. Stop after R3 at independent implementation review.
