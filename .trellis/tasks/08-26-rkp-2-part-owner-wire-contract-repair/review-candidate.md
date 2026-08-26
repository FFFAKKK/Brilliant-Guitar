# Review Candidate — RKP-2 Part Owner Wire Contract Repair

## Verdict requested

`READY FOR TARGETED INDEPENDENT IMPLEMENTATION REREVIEW`.

Exact repaired planning head `ee1af9409b4140d322c88389a4c1df1368655a31` passed targeted independent planning rereview at P0/P1/P2=`0/0/0`. The user authorized only this bounded child through R3; implementation review remains pending and no later lifecycle action is authorized.

## Exact object

- Base: `ce673a2ad62348fa73458d493a45f9c005bf0288`
- Branch: `codex/rkp-2-part-owner-wire-contract-repair`
- Task: `.trellis/tasks/08-26-rkp-2-part-owner-wire-contract-repair`
- Parent: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- Root-cause audit: P0/P1/P2=`0/1/0`, bounded blocking planning child required
- First planning review of `7e211869b7ab8d5ead3916ca8d98107d55f182db`: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/1/0`
- Child targeted rereview: PASS, P0/P1/P2=`0/0/0`, exact head `ee1af9409b4140d322c88389a4c1df1368655a31`
- R0 activation: `dd6f92759e0254742fd4bf2761fe0d020ec4d3aa`
- R1 Foundation: `4510fd95f406acc109cad8f120a0050a0e678c2e`
- R2 Contracts/native/governance and exact technical head: `738f746085a2b3f9e3e5520523cf5356b6f6f576`
- R3 evidence/candidate freeze: `cb721507e405778a7b8ae2ec4e48d4d40e395366`
- First independent implementation review: RETURN FOR BOUNDED IMPLEMENTATION REPAIR, P0/P1/P2=`0/1/0`, only current-tense/range evidence
- Docs-only evidence repair: this HEAD, exact hash reported after commit; targeted implementation rereview pending

## Candidate decision

The public owner wire remains exactly score `{kind}` or Part `{kind,partId}`. The Rust identifier `part_id` receives only `#[serde(rename = "partId")]`; the enum receives `deny_unknown_fields`. No alias is accepted. Foundation directly proves Part mapping/Part-extra rejection and exact Score normal decode/encode. Because internally tagged unit `Score` does not reject extras under this derived serde configuration, Contracts and TypeScript remain the sole public score-extra exact-shape owners; no custom Foundation deserializer or unit-variant change is allowed.

## Scope proof

The immutable intervals prove:

- `ce673a2ad62348fa73458d493a45f9c005bf0288..ee1af9409b4140d322c88389a4c1df1368655a31`: exactly 15 docs-only planning paths;
- `ee1af9409b4140d322c88389a4c1df1368655a31..738f746085a2b3f9e3e5520523cf5356b6f6f576`: exactly six technical plus seven lifecycle paths;
- `ee1af9409b4140d322c88389a4c1df1368655a31..cb721507e405778a7b8ae2ec4e48d4d40e395366`: exactly six technical plus eight lifecycle paths, fourteen unique paths total;
- R3 `738f746085a2b3f9e3e5520523cf5356b6f6f576..cb721507e405778a7b8ae2ec4e48d4d40e395366`: exactly eight lifecycle/evidence paths and no technical path.

Technical ownership is exactly the six paths listed in `design.md`. The candidate has zero delta outside those six technical paths and the eight allowed lifecycle/evidence paths. Cargo/toolchain/rustfmt, package/tsconfig, active specs, unrelated `crates/**`, `src/**` and unrelated `test/**` remain protected. This candidate does not claim that `ce673a2...candidate` has zero `crates/**` or `test/**` delta.

## Review checklist

- [x] Public `partId` and forbidden `part_id` are unambiguous.
- [x] Field rename is bidirectional and Part struct fields are closed without claiming derived-serde score-extra closure.
- [x] Contracts/TypeScript exclusively enforce score-extra public exact shape; Foundation adds no custom deserializer or unit-variant change.
- [x] No alias, migration or second codec owner exists.
- [x] Root cause is Foundation, not Contracts, TypeScript or Runtime.
- [x] Existing stable code/path/violation and zero-publication behavior are preserved.
- [x] Score/Part unknown blocks, nested JSON and order are covered through real native create/read.
- [x] Six technical paths are necessary and sufficient.
- [x] R0–R3 and their rollback points are independent.
- [x] Planning PASS, implementation authorization, implementation audit, acceptance/archive/integration and S6.1 resume remain distinct.
- [x] TypeScript default and `2/22/28/51/8/34/9/brilliant-score-1` remain fixed.

## Current lifecycle truth

RKP-2 S6.0 remains committed and is not rewritten. Stage 6 remains started/authorized but operationally paused. S6.1/S6.2/S6.3 are false. This child is `in_progress` with start/production authorization true only for R0–R3, candidate-ready true and targeted implementation rereview pending. Archive/push/cutover/measurement/RKP-3 remain false.

## Self-audit

Bounded-repair planning review passed P0/P1/P2=`0/0/0`. The first independent implementation review of exact candidate `cb721507e405778a7b8ae2ec4e48d4d40e395366` returned P0/P1/P2=`0/1/0` only for current-tense and range evidence. This docs-only repair closes that finding; targeted rereview remains pending and no implementation PASS is claimed.

## Gate evidence

- Trellis child/RKP-2/Rust parent: PASS.
- JSON/JSONL, path existence/uniqueness, parent reference once, Markdown fences and diff-check: PASS.
- Exact ranges: planning 15 docs-only; accepted-planning-to-technical-head six technical plus seven lifecycle; accepted-planning-to-`cb721507` six technical plus eight lifecycle; R3 eight lifecycle only. Delta outside the six technical and eight lifecycle allowlists is zero; RKP-2 JSONLs are zero-delta.
- TypeScript typecheck and clean-clone build: PASS.
- Node 20.20.2 and 24.15.0 dynamic runner: 78 files, manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 579 discovered / 578 pass / 1 expected GC skip / 0 fail on both.
- Node 20/24 focused bridge+parity+workspace-law: 23/23 on both; parity is 6/6 and workspace-law is 8/8.
- Fresh LF Rust: 73/73 plus fmt/check/clippy/MSRV PASS; Foundation 18/18 and Contracts 16/16.
- Trellis child/RKP-2/Rust parent, JSON/JSONL/path uniqueness, parent reference, Markdown fences and diff-check: PASS.
