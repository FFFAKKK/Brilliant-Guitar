# Operator Handoff — RKP-2

## Current status

`STAGE 3 COMPLETE — STAGE 4 NOT STARTED`.

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
- Stage 3 authorization is consumed; Stage 4 is not started or authorized.
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

Stage 3 adds exactly seven private slotmap handle types, scalar-only Runtime records, a typed part/measure content key and explicit canonical-order topology. `LiveScoreStore` is built privately from the already decoded and Stage-2-validated DTO; it owns only records, topology and scalars and retains no complete `ScoreDocumentV1` tree. The store remains disconnected from `SmokeRuntime`, Session and Node until Stage 5, so the four new private modules use a narrow reasoned `dead_code` allowance rather than widening the public API.

Runtime independently checked-pre-counts and fallibly reserves all Stage-3-owned slotmaps, maps and vectors before insertion. It inserts once in DTO order, resolves references through typed/local maps and returns no store until deterministic local invariants pass. The private reserve-fault seam returns `InternalCapacity` with zero publication. Store tests pass `5/5`, including root identity, exact topology/coverage, record resolution without retaining the original tree, stale-generation invalidation and reserve-fault atomicity; full workspace Rust is `60/60` with fmt/check/clippy/MSRV passing.

## Next operator action

Do not start Stage 4 without a later explicit user continuation. Stage 4 is the derived-index/time-query/parity commit in `implement.md`; a new file/dependency/public shape outside the approved matrix returns to planning review.

## Audit and closeout

The operator stops at an implementation candidate. A dedicated read-only auditor reports P0/P1/P2. Acceptance/archive and later RKP-3 planning are separate owner decisions. Push, default cutover and official qualification remain outside RKP-2.
