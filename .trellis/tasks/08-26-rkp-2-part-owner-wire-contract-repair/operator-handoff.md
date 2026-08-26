# Operator Handoff — RKP-2 Part Owner Wire Contract Repair

## Current status

`IMPLEMENTATION ACCEPTED FOR OWNER CLOSEOUT — NATIVE ARCHIVE AUTHORIZED`.

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
- R3 candidate freeze: `cb721507e405778a7b8ae2ec4e48d4d40e395366`
- First independent implementation review of `cb721507...`: RETURN FOR BOUNDED IMPLEMENTATION REPAIR, P0/P1/P2=`0/1/0`, limited to current-tense and range evidence
- Docs-only evidence repair: complete in this commit; exact hash reported after commit
- `implementation_candidate_ready=true`
- `implementation_review=pending`
- `targeted_implementation_rereview=pending`
- TypeScript remains default.

The original RKP-2 worktree remains on the same base, clean and unmodified by this planning branch. Stage 6 is historically started/authorized at S6.0, but operationally paused before S6.1. S6.2 and S6.3 are also not started.

## Historical blocking finding and current implementation

The original S6.1 blocking finding, before R1, was that the accepted public Part owner is `{ "kind": "part", "partId": "part-1" }` while Foundation's private Rust field `part_id` had no serde field rename. Contracts and TypeScript already required `partId`; Runtime only cloned a validated owner. That historical finding established Foundation as the unique repair owner.

The current candidate has implemented exactly:

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

The current candidate has no `alias`, custom deserializer, migration, public DTO/failure addition or `Score` shape change.

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

The same dedicated read-only implementation auditor accepted exact candidate `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa` at P0/P1/P2=`0/0/0`. Owner closeout and native archive are now authorized; later lifecycle commits must not impersonate the audited technical candidate. The authorization still does not cover RKP-2 S6.1, push, cutover, qualification or RKP-3.

The first independent planning review of `7e211869b7ab8d5ead3916ca8d98107d55f182db` returned P0/P1/P2=`0/1/0` because it incorrectly required Foundation to reject score extras directly. Exact repaired head `ee1af9409b4140d322c88389a4c1df1368655a31` passed targeted rereview at `0/0/0` and is the sole implementation authority.

Technical-head validation used a fresh `core.autocrlf=false` clone: Rust `73/73`, fmt/check/clippy/MSRV PASS; Node 20.20.2 and 24.15.0 focused native+parity+workspace-law `23/23`; both dynamic full runners used 78 files and manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, with `579 discovered, 578 pass, 1 expected GC skip, 0 fail`. Typecheck/build, Trellis, JSON/JSONL, exact path and protected-delta gates pass.

Exact range evidence is: `ce673a2...ee1af940` = 15 docs-only planning paths; `ee1af940...738f746` = six technical plus seven lifecycle paths; `ee1af940...cb721507` = six technical plus eight lifecycle paths, fourteen unique paths total; and R3 `738f746...cb721507` = eight lifecycle paths only. This repair changes only those existing lifecycle/evidence paths and leaves all six technical files byte-identical to `cb721507`.

The first implementation review remains recorded as P0/P1/P2=`0/1/0`; the evidence-only finding was bounded-repaired, and targeted rereview of exact `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa` passed P0/P1/P2=`0/0/0` for implementation acceptance. RKP-2 Stage 6 remains operationally paused at S6.0, before S6.1.

Proceed only with this owner closeout: record acceptance, invoke Trellis native archive, project the archived authority, and fast-forward-only integrate the accepted descendant. Do not continue RKP-2 Stage 6 technical work, push, qualify, cut over or create RKP-3.

## Accepted implementation audit

- Auditor thread: `019faec2-f6ec-78e3-bfd9-7dc472d1c3af`.
- Audited implementation candidate: `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa`.
- Verdict: `PASS FOR IMPLEMENTATION ACCEPTANCE`, P0/P1/P2=`0/0/0`.
- Accepted planning authority remains `ee1af9409b4140d322c88389a4c1df1368655a31`; later docs-only closeout commits are lifecycle heads, not technical audit heads.
