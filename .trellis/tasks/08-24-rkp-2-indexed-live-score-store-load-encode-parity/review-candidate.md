# Review Candidate — RKP-2 Post-Stage-5 Manifest Authority Closure

## Fresh S6.2 planning projection — 2026-09-03

`18318BFF RETURNED 0/1/0 — DUAL TEST-LANE REPAIR READY FOR COMMIT AND REREVIEW`

The current candidate is a docs-only, exact 15-path fresh S6.2 plan rooted at base `9da9d036a6c2ef184ea68d5b33fabfb1e9a0eba5` and tree `179e08f0f3ec77f9368cc781c9e4567671791f30`. The sole current child is `.trellis/tasks/09-03-rkp-2-stage-6-s6-2-fresh-evidence-consumption`; its planned branch/worktree are `codex/rkp-2-stage-6-s6-2-fresh-evidence-consumption` and `.worktrees/rkp-2-stage-6-s6-2-fresh-evidence-consumption`.

The predecessor EOL prerequisite is accepted, natively archived, and fast-forward integrated at `9da9d036a6c2ef184ea68d5b33fabfb1e9a0eba5`. The stopped `c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b` attempt remains diagnostic-only and non-reusable. Initial plan `7d7adc03fcf963633ae1e4cde4abc3dd95291e33` returned `0/1/0` for CRLF-derived hashes; LF repair `18318bffc375d7d64de0169fab4ffff899e1244c` returned `0/1/0` for not separating the fresh no-native and built-native test lanes. The exact repair freezes `590/582/7/1` before native materialization and `611/605/4/2` only after hash-equal build/copy, with no technical change. The next legal gate is the exact repair commit followed by targeted read-only rereview; this section does not claim a planning PASS or authorize `task.py start`, code changes, E3, acceptance, archive, qualification, cutover, RKP-3 or push.

All subsequent sections are historical context and do not override this current projection.

## Stage 6 closeout terminal review candidate

`READY FOR DEDICATED INDEPENDENT L6 TERMINAL PROJECTION REVIEW`

Pin the current candidate and verify the direct chain `d0396bbb -> 9e74b826 -> 34389020 -> <candidate>`, exact closeout 12-file native move, archive-aware successor references, unchanged historical semantic/Stage 6 archives, childless `in_progress` RKP-2, false S6.2/S6.3, TypeScript default, Rust-parent ownership, and the exact next gate `explicit_user_authorization_for_rkp2_s6_2_resume`.

This candidate does not claim terminal PASS and does not authorize S6.2, S6.3, qualification, cutover, RKP-3, push or production changes. All later sections are historical context.

## Historical lifecycle result before Stage 6 closeout

`RKP-2 STAGE 6 S6.0 COMPLETE — BLOCKED ON PART-OWNER WIRE-CONTRACT PLANNING REVIEW`.

## Current blocking planning projection

Exact Stage 6 activation/state commit `ce673a2ad62348fa73458d493a45f9c005bf0288` remains preserved. S6.1/S6.2/S6.3 are false and the RKP-2 implementation candidate is not ready.

Archived child `08-26-rkp-2-part-owner-wire-contract-repair` owns only the bounded `ExtensionOwnerV1::Part` public `partId` serde repair. Exact repaired planning head `ee1af9409b4140d322c88389a4c1df1368655a31` and exact implementation candidate `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa` both passed their independent gates at P0/P1/P2=`0/0/0`. The repair retains exact score/Part public shapes, assigns Foundation only the derived-serde Part mapping scope, leaves score-extra closure with Contracts/TypeScript, forbids a `part_id` alias or custom deserializer, changes exactly six technical paths, and is now accepted/archived before S6.1 resume.

This RKP-2 review file records the active bounded child candidate only. It does not claim an independent implementation PASS, accept/archive/integrate the child, change TypeScript default or claim a Stage 6 candidate.

Activation is based on clean non-fast-forward merge `df40aef391440ae64ad3e266419579bee5887a1f`, whose exact parents are accepted repair closeout `b5d63006a4c286bad01fdb56112b9a6741f648b0` and approved RKP-2 planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`. Both are ancestors, as is audited RKP-1 implementation `94387b339b5e4d9ce6b7f97597a1b56edd051f01`.

The unified base passed its activation gates. Stage 1 pins the exact Runtime-only slotmap dependency and its executable contract skeleton. Independent auditor `01a01e48-1934-77b0-821e-a8026cd9e5f7` accepted exact Stage 1 candidate `8af8e63e1d22a6d5e22796a9e5ffa19a66b902ae` with P0/P1/P2=`0/0/0`.

Stage 2 now adds only the five approved Foundation/Contracts paths plus allowlisted lifecycle projection. One exact Fraction implementation owns comparison, gcd-reduced addition, dotted/tuplet duration and safe-integer checks. Full load validation uses checked pre-count, fallible reserve and borrowed ID/owner keys before its fixed traversal. Diagnostics never derive from hash iteration; the root document ID is registered first; later duplicates retain the later path. Empty collection/reference mappings and the 22 stable failures remain exact. Private reserve-fault injection selects pathless `InternalCapacity` before semantic faults, and Contracts maps it to the existing exact `bridge.internal` bytes.

Focused Stage 2 Rust passes Foundation `16/16` and Contracts `15/15`; full workspace Rust at that checkpoint passes `55/55`. Exact Stage 2 candidate `a4ede43d944edc7e25860a9eda821889a8a581d8` is owner-accepted as the Stage 3 prerequisite; no independent Stage 2 audit is claimed.

Stage 3 adds only the five approved Runtime paths plus allowlisted lifecycle projection. It defines exactly seven private typed slotmap handles, scalar-only records, typed part/measure content identity and explicit canonical-order topology. The private `LiveScoreStore` independently pre-counts and fallibly reserves every Stage-3-owned structural container, inserts once in DTO order and publishes only after local invariants succeed. It retains no complete `ScoreDocumentV1`, remains disconnected from `SmokeRuntime`/Session/Node, and exposes no handle or slot/generation detail outside Runtime. Exact Stage 3 candidate `c348e2f332d4e96e3b3dd74def7263c95770a868` is owner-accepted as the Stage 4 prerequisite; no independent Stage 3 audit is claimed.

Stage 4 adds only the four approved Runtime paths plus allowlisted lifecycle projection. Entity/Ownership/Extension/Core Reference indices and exact per-Voice time indices are built during canonical import; Part/Measure content keeps its single primary map. Stable-ID and owner queries are map/typed-slot based, while exact-start and half-open overlap queries use binary bounds and return semantic-order slices. Independent rebuild normalizes handles to stable IDs, exact fractions and stable paths; clean parity passes and deliberate corruption fails. Minimal/representative structural counters are exact and contain no full-document lookup-scan counter. Focused indices `4/4`, time-index `3/3`, store `6/6`; full workspace Rust `67/67`. Exact Stage 4 candidate `72cf0769cb66deb58691a39b664395ed28670da1` is owner-accepted as the Stage 5 prerequisite; no independent Stage 4 audit is claimed.

Stage 5 changes only the seven approved Runtime/Session/parity paths plus allowlisted lifecycle projection. Explicit topology traversal reconstructs the full DTO in canonical array order without HashMap/SlotMap iteration or RuntimeHandle leakage. `KernelRuntime` exclusively owns the indexed Store and revision zero; the complete source DTO is transient. The private Session factory maps Runtime semantic/capacity/invariant failures into existing stable failures and publishes no Session on rejection. Node source remains byte-identical and retains two exports. Repeated native reads are byte-identical and detached; optional values, array order and unknown Extension payloads survive. Focused Rust passes Runtime `15/15`, Session `4/4`; workspace Rust passes `70/70`; two native loaders/two exports and combined native tests pass `13/13`; both workspace laws pass `6/6`; the clean-head full runner discovers `556` tests with `555` pass, `1` expected GC skip and `0` fail. RKP-2 remains `implementation_candidate_ready=false`; Stage 6 is not started or authorized.

## Bounded successor-governance closure candidate

Manifest projection commit `bda15099f4932aced965eabc6b6e147accd9b5ce` replaced only the deleted `smoke_runtime.rs` row in each JSONL with `runtime.rs`. The previous closure candidate `e3829dafe0e7bfc4b3cc1d615dd20b2d5eed8e9b` was returned `P0/P1/P2=0/1/0` because it anchored historical zero drift only to the Stage 5 parent. The current docs-only candidate repairs that single P1 by anchoring the executable invariant to approved planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`.

The mechanical successor contract remains narrow: the approved-state and Stage 5-parent manifests are LF-normalized identical; all three historical commits exist with the approved state ancestral to the Stage 5 parent and that parent directly parenting the projection; `bda15099...` changes only the designated row's `file` and `reason` fields relative to approved planning. The 21 RKP-2 production/test paths remain unchanged; `implement.jsonl` and `check.jsonl` remain exactly 25/20 rows; every other row and field matches approved planning; every JSONL path exists and is unique.

The pre-archive implementation candidate added exactly twelve child-planning artifacts to the historical ten coordination paths, producing the historical 22-path active projection. The same five LF-normalized files remain content-frozen; both JSONL contents and hashes are unchanged.

## Blocking full-runner child candidate

At exact base `eed4871a86191783d539b7d4097be3627e98e4a0`, independent full-runner review found one P1: the quoted wildcard is not a cross-platform completeness contract. Node 24 can return 29 files/261 tests with exit zero while the true literal tree is 77 files/557 tests; Node 20.20.2 exits one for the literal glob. Package/package-lock are unchanged from `df40aef...`, so the finding is inherited infrastructure debt.

Child `08-25-rkp-2-cross-platform-full-test-runner-contract-repair` freezes one deterministic owner: literal recursive enumeration, BigInt `(dev,ino)` alias rejection, code-unit sorting, immutable `full-test-manifest-v1`, Node 20/24 common `run({ files, concurrency })`, event-type-plus-pass-`data.file` seen coverage, separate reporter completion and nonzero propagation. Duplicate passes are valid; any fail is fatal; success requires independent manifest/run-files/seen equality. It changes no runner/package implementation path in planning.

Dedicated planning repairs passed and P/A were explicitly merged at `b4906ac`. Corrections `b200168` and `ce9598e` formed implementation candidate `15c84a1929d1365ebf466088e896fd5309a4fa57`; dedicated implementation review returned P0/P1/P2=`0/1/1`. State `04364ec`, precedence repair `f77549e` and branch evidence `139f127` close exactly those findings. Targeted rereview of `6dac686d7f7dcaa447330209c6da04e414b7615c` returned P0/P1/P2=`0/1/0` only for the workspace-law oracle; state `dd63ff2` and ordered-signal proof `adaea92` close that governance gap with production runner byte-zero. The child is ready only for another targeted implementation rereview; no PASS, Stage 6 authorization, acceptance, archive or integration is claimed.

This exact anchor A pins P `44832ad01d136368c1b61203e9207ca4a521241f`; `eed4871a..P` remains twenty planning paths. Only after amendment PASS and explicit integration does future `P..candidate` Stage 4 use child technical 4 plus active lifecycle 11 and stop at independent implementation review, with RKP-2 still 21 technical + 22 active coordination. The thirteen-path archive and 23-path post-archive projection remain unchanged.

## Recorded verdict

`PASS — P0/P1/P2=0/0/0` for exact technical planning head `625054ec78e6410e0fb6034ab0c8f60bbf110d08`.

The dedicated read-only auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7` recorded the final planning PASS after review cycles `6a349b6=0/5/1`, `f4ed2bc=0/1/0`, `135af27=0/0/1`, and `625054e=0/0/0`, then accepted Stage 1 candidate `8af8e63=0/0/0`. The approved planning record is preserved. No independent Stage 2, Stage 3, Stage 4 or Stage 5 audit is claimed. Stage 5 does not implement commands, transactions, history, events, selectors, incremental validation, providers or Stage 6 behavior; it does not archive, push, run official qualification, switch the default runtime or create RKP-3.

## Bounded repair under rereview

1. The authority dependency graph now uses the complete consumer-to-dependency arrows, each labeled `depends on`, including Runtime/Session dependencies on Extension Protocol and the future Tauri-to-Session edge; Tauri remains out of RKP-2 implementation scope.
2. Atomic import has two explicit capacity phases. Foundation adds pathless workspace-internal `InternalCapacity`; the single allowlisted Contracts codec maps it to existing `bridge.internal`; Runtime capacity uses its private internal failure. The stable failure union remains 22.
3. Full export/encode/decode/encode round-trip is a test/differential acceptance proof, not a normal production publication prerequisite.
4. Empty-collection failure mapping is frozen per existing wire behavior: top-level measures/parts and notes use `invalid-value`; staves/voices and coverage/reference use `invalid-reference`.
5. The planning allowlist enumerates exactly 13 task files plus three Rust-parent files; no task-directory wildcard remains.
6. All slotmap evidence URLs are pinned to documentation version `1.1.1`.
7. Failure order is now codec/API/schema -> Foundation scratch capacity -> Foundation semantic -> Runtime store capacity/local checks -> created; the two reserve-fault matrices select exact existing `bridge.internal` and publish zero session/handle.

## Review focus

1. Approved planning state `53646c92...` and Stage 5 parent `4f5f45a...` contain LF-normalized identical JSONLs; both and projection `bda15099...` exist; the approved state is ancestral to the Stage 5 parent; and that parent is the projection's sole direct parent.
2. The current coordination allowlist is exactly 23 literal paths (historical ten plus thirteen archived child artifacts) while the RKP-2 technical allowlist remains exactly 21; all twelve active child paths are absent and no wildcard or directory-level exemption exists.
3. Relative to approved planning state, `bda15099...` changes only the designated successor row's `file` and `reason` fields; five LF-normalized content hashes then freeze the repaired manifests/authority, and all other JSONL rows and fields, counts, valid JSON, existence and uniqueness remain exact.
4. The child is the sole test-infrastructure owner; RKP-2 Stage 6 is a consumer only and remains blocked pending planning/implementation reviews, acceptance/archive, integration and separate authorization.
5. Stage 5 remains complete while Stage 6, candidate readiness, implementation review, default cutover and lifecycle closeout remain untouched.
6. Planning base and accepted RKP-1 ancestry remain intact.
7. One semantic truth/two representations and absence of retained ScoreDocument in the target Runtime.
8. Exact slotmap pin/features, typed-key privacy and arbitrary-iteration fence.
9. Document/entity global StableId uniqueness and strict separation from RuntimeHandle/MusicalLocation.
10. Complete scalar record/topology model, including non-entity PartMeasureContent.
11. Entity/owner/content/time/extension/reference indices and claimed complexity.
12. Exact Fraction/duration/time-range correctness without ticks/floats.
13. Two-phase Foundation-validation/Runtime-store pre-count and reserve, explicit internal-capacity mappings, followed by build/local checks/publication and zero-session rejection.
14. Deterministic full-validation order plus mapping into the unchanged 22 failures.
15. Canonical/lossless export, unknown extensions and index normalized parity.
16. Public `28/51/8/34/9`, two Node exports, TypeScript default and resource-cap freeze.
17. Six reversible stages, protected paths and downstream RKP boundaries.
18. Stress evidence is a diagnostic liveness/linearity gate, not a weakened product performance budget.
19. Parent conflict integration rule preserves repair and RKP-2 child references.

## Evidence expected

- Trellis validations;
- JSON/JSONL parse and per-file unique paths;
- parent child occurrence exactly one;
- Markdown fence/diff check;
- protected production/test/config delta zero from `063b332d`;
- Rust and TypeScript gate outputs;
- explicit reproduction/attribution of any known RKP-1 post-archive baseline failures;
- docs-only changed-path list and clean worktree.
## Owner acceptance record - exact audited candidate

Dedicated independent implementation rereview task 01a01e48-1934-77b0-821e-a8026cd9e5f7 returned PASS FOR IMPLEMENTATION ACCEPTANCE, P0/P1/P2=0/0/0, for exact technical candidate 8d9a2a4a35c7707fad5398733eb43c08984bea2b. The earlier ordered-signal workspace-law oracle P1 is closed. This lifecycle record does not alter or impersonate that audited implementation commit.

Owner closeout is authorized to use Trellis native archive and then replace the twelve active-child authority paths with the exact thirteen archived successors. RKP-2 Stage 5 remains complete; Stage 6 remains not started and not authorized; TypeScript remains the default runtime. No push, qualification, RKP-3 or default cutover is authorized.
## Accepted full-runner archive projection

Dedicated implementation rereview accepted exact candidate 8d9a2a4a35c7707fad5398733eb43c08984bea2b at P0/P1/P2=0/0/0. Trellis native archive commit a1895f36090aafaa8865ffc21e1b6f15679e3be9 moved the child into the frozen 2026-08 archive destination with exactly thirteen artifacts, including research/implementation-evidence.md.

RKP-2 current coordination is now exactly historical ten plus archived thirteen = twenty-three. All twelve active-child paths are absent and mechanically forbidden; both RKP-2 JSONLs remain byte-identical. The accepted descendant is consumable only by fast-forward-only integration from eed4871a86191783d539b7d4097be3627e98e4a0. Stage 6 remains not started and not authorized, and TypeScript remains the default runtime.

## Part-owner wire repair targeted rereview projection

Child candidate `cb721507e405778a7b8ae2ec4e48d4d40e395366` received RETURN FOR BOUNDED IMPLEMENTATION REPAIR at P0/P1/P2=`0/1/0`, limited to governance current tense and scope evidence. The docs-only repair preserves the six implemented technical paths byte-for-byte and corrects the immutable intervals to planning 15, technical head 6+7, candidate 6+8=14, and R3 eight lifecycle paths only.

The child is candidate-ready only for targeted independent implementation rereview. No implementation PASS, acceptance, archive, integration or RKP-2 S6.1 resume is claimed; S6.0 and the TypeScript default remain exact.

## Part-owner wire repair implementation acceptance

- Exact audited child candidate: `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa`.
- Auditor thread: `019faec2-f6ec-78e3-bfd9-7dc472d1c3af`.
- Verdict: `PASS FOR IMPLEMENTATION ACCEPTANCE`, P0/P1/P2=`0/0/0`.
- Owner closeout/native archive are authorized; the subsequent lifecycle heads must not impersonate the audited technical candidate.
- RKP-2 candidate freeze is not resumed: S6.0 remains preserved, S6.1+ false, TypeScript default, and no push/cutover/qualification/RKP-3.

## Part-owner wire repair archived authority

- Exact archive: `.trellis/tasks/archive/2026-08/08-26-rkp-2-part-owner-wire-contract-repair`, 12 artifacts; active authority absent.
- Accepted audited implementation: `c77d2dd5d3405e9ee24c5168851b2cc7816ec1aa`; later lifecycle commits do not replace it.
- Acceptance sync: `b761be55597e641b9b1ee83fe277653377ffb41a`; native archive: `b5e4952438f2d3a11c0b1667071a8c3c3fff3d46`.
- Parent current blocking child is clear. S6.0 is retained, S6.1+ remain false, and fast-forward-only integration plus full gates precede any Stage 6 technical resume.

## Stage 6 private scale evidence seam planning projection

The current blocking child is `08-26-rkp-2-stage-6-private-scale-evidence-seam-repair`, created from exact S6.1 head `4a302bc9f9981940336fc97941b08e09bd0d1f67`. S6.1 is retained complete; S6.2/S6.3 remain false. The child plans one `cfg(test)` Runtime seam plus a fail-closed worker because the prior TypeScript-only S6.2 allowlist cannot invoke private parity/export/encode evidence.

This projection does not claim an implementation defect or planning PASS. The child is `READY FOR INDEPENDENT PLANNING REVIEW`, start/production authorization and candidate readiness remain false, and TypeScript remains default. No S6.2 work, acceptance, archive, push, cutover, qualification or RKP-3 is authorized.

## Stage 6 private scale evidence seam targeted planning rereview

The first independent review of exact planning candidate `df686882efa30f489da138d2730acbdd4fb9cd30` returned P0/P1/P2=`0/2/0`. This bounded repair freezes the nine planning-authority files by LF-normalized SHA-256, reduces the future mutable lifecycle allowlist to exactly eight paths, and closes the previously open libtest/artifact/owner-probe/sentinel/PowerShell/precedence/stage-order decisions.

Targeted rereview should verify: the nine hashes recompute exactly; no ninth mutable lifecycle path is permitted; E1 never requires the stress request; E2 owns the sole request plus first real stress run; E3 uses a fresh request; the exact two sentinels and closed failure/detail union fail closed with first-failure precedence; and no qualification claim is inferred from RSS or elapsed diagnostics. The task is still planning, start/production authorization and candidate readiness are false, S6.2/S6.3 remain false, and no PASS is claimed.

## Stage 6 private scale evidence seam final targeted planning rereview

Candidate `176fd3670d3015631fc1553a59cc8e4d3a941221` received a second targeted P0/P1/P2=`0/1/0`. The final bounded repair replaces the nonexistent `lookup_entity` metrics argument with real `store.metrics` before/after snapshots, uses direct `store.indices.lookup_owner` with an independent default metric, and emits two separate probe records.

It also removes shutdown outcomes from the primary failure union: cap/timeout stay primary while `terminationStatus`, `reapStatus` and `cleanupStatus` record secondary outcomes. The review target remains planning-only, final targeted rereview pending, with S6.1 retained and S6.2/S6.3 false.

## Stage 6 private scale evidence seam cleanup-ownership rereview

Candidate `8d773b8e9d39ac21aba9cad715609fffc80eefec` received another targeted P0/P1/P2=`0/1/0` solely because its start-failure envelope said cleanup was not attempted after PowerShell had become sole owner of handed-off TEMP resources. The bounded repair freezes TypeScript pre-handoff ownership, PowerShell post-handoff ownership, `cleanupStatus=succeeded|failed`, exact two-attempt cleanup and post-cleanup-only sentinel generation. The target remains planning-only and pending final targeted rereview; S6.2/S6.3 remain false.

## Stage 6 private scale evidence seam activation

Exact planning authority `d638b81a3c9b3d7461f75a91c8d5b090f06adea2` passed dedicated planning review at P0/P1/P2=`0/0/0`. The user authorized only this bounded child implementation. Native E0 activation is complete, E1 has not started, and the child is not candidate-ready. RKP-2 remains paused after retained S6.1; S6.2/S6.3 and implementation review remain pending, with TypeScript still the product default.

## Private scale evidence repair E1 checkpoint

- E1 is locally complete at the private child boundary: focused `1/1`, one exact Runtime libtest artifact, Clippy/MSRV PASS, and a fresh LF clone Runtime result of `16` passed plus `1` intentionally ignored stress test.
- The child remains `in_progress` with candidate readiness false. E2/E3 and parent RKP-2 S6.2/S6.3 have not started; TypeScript remains default.

## Private scale evidence repair E3 review projection

The repair child is now **READY FOR DEDICATED INDEPENDENT IMPLEMENTATION REVIEW** after a fresh E3 worker run at source HEAD `4ad23773e9c9e1081667a4eccb84cc464b85bc89`. The exact successful protocol is frozen in the child evidence document with SHA-256 `64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862`.

The review target is the bounded repair candidate only. RKP-2 S6.1 remains retained complete, S6.2/S6.3 remain false, TypeScript remains default, and no acceptance/archive/integration/qualification/cutover/push/RKP-3 claim is made.
