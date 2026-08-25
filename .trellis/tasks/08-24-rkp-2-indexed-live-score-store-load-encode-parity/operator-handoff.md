# Operator Handoff — RKP-2

## Current status

`STAGE 5 COMPLETE — BLOCKING RUNNER CHILD READY FOR INDEPENDENT IMPLEMENTATION REVIEW — STAGE 6 NOT STARTED`.

- Branch: `codex/rkp-2-indexed-live-score-store-implementation`.
- Worktree: `.worktrees/rkp-2-indexed-live-score-store-implementation`.
- Planning base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Task: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`.
- Approved planning head: `625054ec78e6410e0fb6034ab0c8f60bbf110d08`.
- Approved planning-state head: `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`.
- Accepted repair closeout first parent: `b5d63006a4c286bad01fdb56112b9a6741f648b0`.
- Clean unified implementation base: `df40aef391440ae64ad3e266419579bee5887a1f`.
- Independent planning review: P0/P1/P2=`0/0/0` in dedicated task `01a01e48-1934-77b0-821e-a8026cd9e5f7`.
- Stage 1 independent implementation review: exact candidate `8af8e63e1d22a6d5e22796a9e5ffa19a66b902ae`, dedicated auditor `01a01e48-1934-77b0-821e-a8026cd9e5f7`, PASS P0/P1/P2=`0/0/0`.
- State: `in_progress`, `task_start_run=true`, `production_implementation_authorized=true`, `user_implementation_authorization=true`, `implementation_candidate_ready=false`.
- Stage 2 exact candidate `a4ede43d944edc7e25860a9eda821889a8a581d8` is owner-accepted as the Stage 3 prerequisite; no independent Stage 2 audit is claimed.
- Stage 3 exact candidate `c348e2f332d4e96e3b3dd74def7263c95770a868` is owner-accepted as the Stage 4 prerequisite; no independent Stage 3 audit is claimed.
- Stage 4 exact candidate `72cf0769cb66deb58691a39b664395ed28670da1` is owner-accepted as the Stage 5 prerequisite; no independent Stage 4 audit is claimed.
- Stage 5 authorization is consumed; Stage 6 is not started or authorized.
- Post-Stage-5 manifest projection: `bda15099f4932aced965eabc6b6e147accd9b5ce`.
- Previous planning-authority closure candidate `e3829dafe0e7bfc4b3cc1d615dd20b2d5eed8e9b` was returned by dedicated auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7` with `P0/P1/P2=0/1/0` because its historical JSONL invariant was anchored only to the Stage 5 parent.
- Current approved-planning-state anchor repair candidate: this docs-only commit, exact hash reported after commit; dedicated targeted planning rereview is pending and no PASS is claimed.
- TypeScript is the default runtime.

## What this plan delivers

RKP-2 replaces the Rust smoke whole-document holder with an indexed, session-private `LiveScoreStore`, then proves deterministic DTO export. It adds no command mutation and performs no runtime cutover.

Frozen choices:

- exact `slotmap=1.1.1`, Runtime-only, no serde/unstable feature;
- seven typed generational record keys;
- explicit order topology;
- HashMap private lookup with no iteration-derived output;
- exact Fraction sorted-Vec Voice time index;
- Foundation validation-scratch pre-count/reserve followed by independent Runtime store pre-count/reserve/build/local-check/publish;
- workspace-internal Foundation/Runtime capacity failures map to existing `bridge.internal`; the public failure union remains 22;
- full index rebuild and encode/decode/encode parity remain verification paths rather than per-open production work;
- exact 22 stable failures and two Node exports;
- six reversible implementation stages after activation.

## Activation gate resolution

The RKP-1 post-archive repair is independently accepted and archived. Its audited implementation remains `267a63bc6ff35b49842fb713c34f4099c8829e18`; lifecycle closeout reaches `b5d63006a4c286bad01fdb56112b9a6741f648b0`. The non-fast-forward unified base `df40aef391440ae64ad3e266419579bee5887a1f` has exact parents `b5d63006...` and `53646c92...`, preserves both ancestries, and contains no new production/test/Cargo/package/tsconfig changes relative to the repair closeout.

The initial RKP-2 planning review of `6a349b6...` returned `0/5/1`; `f4ed2bc...` returned `0/1/0`; `135af27...` returned `0/0/1`; the final exact `625054e...` rereview passed `0/0/0`. The approved plan is now active, but no implementation stage beyond Commit 0 has begun.

The parent was resolved field by field: RKP-0, RKP-1, the post-archive repair and RKP-2 each remain referenced exactly once. RKP-2 is now the sole current/active implementation child.

## Stage 1 checkpoint

Stage 1 pins workspace `slotmap = "=1.1.1"`, consumed only through `slotmap.workspace = true` in Runtime. Cargo metadata resolves features exactly `default,std`; neither `serde` nor `unstable` is enabled. The executable RKP-2 workspace law passes `6/6` and freezes the literal allowlists, seven-crate graph, Runtime-only dependency, RuntimeHandle boundary, exact two Node exports, 22 stable failures, TypeScript default and public `28/51/8/34/9`. Deterministic fixture helpers contain no store-dependent assertion or production implementation.

Rust fmt/check/test `40/40`/clippy/MSRV, existing Node bridge `9/9`, RKP-1 workspace-law `6/6`, TypeScript typecheck/build and the focused RKP-2 test pass. The full TypeScript suite is rerun at the clean committed Stage 1 HEAD because its RKP-0 lifecycle guard intentionally rejects any dirty worktree.

The independent Stage 1 audit accepted exact candidate `8af8e63e1d22a6d5e22796a9e5ffa19a66b902ae` with P0/P1/P2=`0/0/0` as the Stage 2 prerequisite.

## Stage 2 checkpoint

Stage 2 adds one checked `ExactFraction` path for compare, gcd-reduced addition, dotted/tuplet NoteValue duration and JavaScript safe-integer result enforcement. Foundation now performs one fixed-order full load validation after checked pre-count and fallible reservation of borrowed-key scratch collections. Document ID is registered before all entity IDs; later duplicates report their exact canonical path; missing coverage scans document measure order rather than hash iteration.

The unchanged `decode_score_document_value` seam returns only a fully validated DTO. Empty top-level measures/parts and empty notes remain `invalid-value`; empty staves/voices and reference/coverage failures remain `invalid-reference`. The pathless workspace-internal `FoundationDecodeFailure::InternalCapacity` is exhaustively mapped only to existing `bridge.internal`; the stable failure count remains 22. The private reserve-fault test proves capacity wins before a latent semantic failure, so no accepted create request reaches Runtime/Session/Node publication.

Focused Rust is Foundation `16/16` plus Contracts `15/15`; the workspace total is `55/55`. Stage 2 changes no Runtime, Session, Node, Core Types, Extension Protocol, TypeScript production or public contract.

## Stage 3 checkpoint

Stage 3 adds exactly seven private slotmap handle types, scalar-only Runtime records, a typed part/measure content key and explicit canonical-order topology. `LiveScoreStore` is built privately from the already decoded and Stage-2-validated DTO; it owns only records, topology and scalars and retains no complete `ScoreDocumentV1` tree. The store remains disconnected from `SmokeRuntime`, Session and Node until Stage 5; private `#[used]` function-pointer anchors keep the staged implementation compiled without widening the public API or lowering lints.

Runtime independently checked-pre-counts and fallibly reserves all Stage-3-owned slotmaps, maps and vectors before insertion. It inserts once in DTO order, resolves references through typed/local maps and returns no store until deterministic local invariants pass. The private reserve-fault seam returns `InternalCapacity` with zero publication. Store tests pass `5/5`, including root identity, exact topology/coverage, record resolution without retaining the original tree, stale-generation invalidation and reserve-fault atomicity; full workspace Rust is `60/60` with fmt/check/clippy/MSRV passing.

## Stage 4 checkpoint

Stage 4 builds private Entity, typed Ownership, VoiceTime, Extension and Core Reference indices during the canonical import. The existing `PartMeasureKey` content map remains the sole direct Part/Measure lookup. Stable-ID lookup performs one EntityIndex map lookup plus one typed slot lookup; owner relations are typed maps. Extension payloads remain opaque and are never scanned for references.

Per-Voice exact intervals are built once from canonical sequence start and positive exact durations. Exact-start and half-open overlap `[start,end)` use binary-search bounds and return semantic-order slices; empty or reversed ranges reject privately. A fresh `rebuild_indices_from_store` produces a handle-free normalized projection of stable IDs, canonical fractions and stable paths. Primary/rebuilt equality passes; a corrupted entity index is rejected. Minimal and representative metrics assert exact linear entity/topology/reference/time/index counts. Focused Rust is indices `4/4`, time-index `3/3`, store `6/6`; full workspace Rust is `67/67` with fmt/check/clippy/MSRV passing. The unchanged full TypeScript runner discovers `552` tests: `551` pass, `1` expected GC skip and `0` fail; the compiled RKP-2 workspace-law contributes its independently passing `6/6` tests.

## Stage 5 checkpoint

Stage 5 replaces `SmokeRuntime` with one `KernelRuntime` that owns exactly one `LiveScoreStore` plus revision zero and retains no second `ScoreDocumentV1` holder. `LiveScoreStore::export_document` walks only the explicit measure/part/staff/content/voice/event/note/extension topology vectors and dereferences typed records; no HashMap or SlotMap iteration decides output order and no RuntimeHandle reaches DTO, diagnostics or Node.

Session create now uses a private fallible Runtime factory seam. Runtime capacity and invariant failures map to the existing `bridge.internal`; semantic build failures map to the existing `score.invalid-structure` variants; rejection returns no `KernelSession`. Node source is unchanged and keeps the existing publish-after-accepted-Session law with exactly two free-function exports. Native reads deterministically materialize the Store export, preserve optional fields and unknown score-owned Extension payloads, produce repeated identical bytes, and remain detached from input/output aliases.

Focused Rust passes Runtime `15/15` and Session `4/4`; full workspace Rust passes `70/70` with fmt/check/clippy/MSRV. The rebuilt Windows addon passes both loaders with two exports and combined RKP-1 bridge plus RKP-2 parity `13/13`; RKP-1 and RKP-2 workspace laws each pass `6/6`. At the clean committed Stage 5 head, the real full runner discovers `556` tests: `555` pass, `1` expected GC skip and `0` fail, including the clean-worktree lifecycle guard.

## Post-Stage-5 manifest authority closure

Stage 5 deleted `crates/brilliant-kernel-runtime/src/smoke_runtime.rs`. Approved planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0` is the historical JSONL anchor: its LF-normalized manifests must equal those at Stage 5 parent `4f5f45a5f5a97968ef5280524cd4e6ab8dbebda8`. Commit `bda15099...` then changes exactly one row in each context manifest to the live successor `crates/brilliant-kernel-runtime/src/runtime.rs`; only that row's `file` and `reason` fields change relative to the approved state. All other rows and fields remain identical, the counts remain `implement=25` and `check=20`, and every path remains existing and unique. Workspace-law also proves all three commits exist, the approved state is an ancestor of the Stage 5 parent, and the Stage 5 parent is the projection's sole direct parent.

The accepted design's former permanent JSONL zero-delta rule made that planned successor projection fail workspace-law. At the pre-child authority closure, coordination was exactly ten literal paths and workspace-law froze the LF-normalized SHA-256 of five repaired authority/manifest files. The current planning candidate preserves that invariant and adds exactly twelve literal child-planning artifacts, producing 22 coordination paths without a wildcard or directory exemption.

- `check.jsonl`: `7e12f6d00ba17e1967ef57e884e7b5d6ca7efedbb2aaf94de04fc4b3091251c3`
- `implement.jsonl`: `cd0a42070a76a18e782d7da4ebc0e9a88d2ed5dece0d093125d4fc8982229705`
- `design.md`: `91a6245bddf56ac98f24ff336c0ad26d7ac8ef3724a7ff92441b1d06af290a91`
- `implement.md`: `1909c3a2d9901a63500935959475a30606b3a7a742770d5c19045eda5a87e0ec`
- `research/file-test-and-rollback-matrix.md`: `8135656225a02d5392e4f66967a280797d09105b4823a1734c53b2ac1fef8053`

This remains planning-authority governance, not Stage 6 implementation or evidence freeze. The five files freeze at the exact current candidate after their hashes are recomputed; both JSONL contents/hashes remain unchanged. Later changes require a new planning review.

## Blocking full-runner planning child

Independent full-runner evidence at `eed4871a86191783d539b7d4097be3627e98e4a0` found one P1: the quoted wildcard may run only 29 files/261 tests on Node 24 and still exit zero, while a literal complete run covers 77 files/557 tests; Node 20.20.2 rejects the literal wildcard. Package and lock files are unchanged from `df40aef...`, so the defect is test infrastructure, not Stage 5 product behavior.

Child `08-25-rkp-2-cross-platform-full-test-runner-contract-repair` is the sole test-infrastructure owner. Its first candidate `c43a34e7d02a57cfd90de506cf97787ff5571a9e` was returned P0/P1/P2=`0/3/0`; bounded repair `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed at `0/0/0`. Event-coverage P/A also passed `0/0/0` and is explicitly merged at `b4906ac`. Corrections `b200168` and `ce9598e` now form the technical/proof boundaries. The child is `in_progress`, started and production-authorized for this repair only; it is ready for independent implementation review, which remains pending. Discarded Stage 3 `610d20b` remains outside current ancestry.

The amendment consumes only event type plus pass `data.file`, allows duplicate passes, rejects missing/non-string/relative/unknown files, keeps any-nesting fail fatal and requires enumerator manifest, exact `run()` files and pass-seen set equality. Name/nesting/details/reporter text are not truth. Enumeration, physical alias, stream/reporter failures, 4+11 and 22/23 governance are unchanged.

This anchor A pins exact P `44832ad01d136368c1b61203e9207ca4a521241f`; `eed4871a..P` stays exactly twenty paths. After amendment PASS and explicit integration, future `P..candidate` Stage 4 is exactly child technical 4 plus active lifecycle 11 and stops for implementation review while RKP-2 remains 21 technical + 22 coordination. Only after implementation PASS may native archive create the exact thirteen archived artifacts, replace the twelve active child paths and yield coordination 23; explicit integration then creates a new prerequisite. RKP-2 Stage 6 remains separately unauthorized.

## Next operator action

Send the exact child candidate to a dedicated read-only implementation auditor. Focus on pass-`data.file` seen coverage, three-way non-tautological equality, hard-link/stream/reporter rules, dual Node manifest/totals, exact P-anchored 20/4+11/13/22/23 projections and review-before-archive sequencing. Do not start Stage 6. Acceptance, archive, integration and lifecycle closeout remain pending.

## Audit and closeout

The operator stops at an implementation candidate. A dedicated read-only auditor reports P0/P1/P2. Acceptance/archive and later RKP-3 planning are separate owner decisions. Push, default cutover and official qualification remain outside RKP-2.
