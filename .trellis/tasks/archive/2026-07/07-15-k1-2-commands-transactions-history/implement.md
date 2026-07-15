# K1-2 Implementation Plan

All production behavior follows behavioral RED → minimum GREEN → focused regression. Compiler/import failures do not count as RED. Each slice must preserve the frozen K1-1 model and validation contracts.

## Slice 0 — Planning and Task Gate

- [x] Rewrite `prd.md` with approved requirements and exclusions.
- [x] Add `design.md` with exact contracts, data flow, invariants, and alternatives.
- [x] Add this implementation checklist.
- [x] Synchronize active command/transaction spec and product SPEC-003.
- [x] Validate planning artifacts and commit them separately.
- [x] Start the existing Trellis task; do not create another task.

Rollback: documentation-only revert; no production state exists.

## Slice 1 — Strict Public Contracts and Decoder

- [x] RED: strict command tests for six valid envelopes plus wrong version, unknown ID, extra envelope/payload fields, wrong target kind, malformed unions, sparse arrays, non-finite numbers, patch-like input, and caller aliasing.
- [x] GREEN: add `src/core-kernel/commands/contracts.ts`, strict decoding helpers, and closed command decoder.
- [x] Define the frozen internal `CORE_COMMAND_DEFINITIONS` catalog with no dynamic registration API.
- [x] Verify target and payload types reuse K1-1 ScoreDocument domain types.
- [x] Run focused command codec tests and typecheck.

Rollback point: contracts/decoder can be removed without touching K1-1.

## Slice 2 — Resolver and Typed Mutation Algebra

- [x] RED: entity resolver tests for document/measure/part/staff/voice/event/note, missing/duplicate IDs, and anchor start/missing/duplicate/wrong owner.
- [x] RED: exact immutable apply tests for metadata, WrittenPitch, NoteValue, insert, and remove forward/inverse pairs.
- [x] GREEN: implement stable-ID resolver and internal closed mutation types/application.
- [x] Prove untargeted subtree and deep ExtensionBlock identity-by-value preservation.
- [x] Run focused resolver/mutation tests and typecheck.

Rollback point: internal modules are not publicly exported and can be replaced independently.

## Slice 3 — Atomic Submit and Versioning

- [x] RED: bus initialization cloning/validation; six command committed/rejected paths; replace no-op paths; semantic-invalid rollback; profile-unsupported chord commit; handler/mutation exception privacy; version overflow.
- [x] GREEN: implement isolated candidate transaction pipeline and one-time atomic commit.
- [x] Reuse the K1-1 semantic validator and feature-profile classifier; do not duplicate their rules.
- [x] Add an internal deterministic test seam for injected handler/mutation failure without exposing it from the public index.
- [x] Run focused transaction tests, K1-1 regressions, and typecheck.

Rollback point: remove CommandBus export; K1-1 public surface remains unchanged.

## Slice 4 — History / Undo / Redo

- [x] RED: one-entry-per-commit, no history for rejection/no-op, multi-step undo/redo, empty stacks, redo invalidation, and redo preservation after rejection/no-op.
- [x] RED: history invariant failure is atomic; every successful undo/redo revalidates semantics and returns support classification.
- [x] GREEN: implement internal HistoryEntry, deterministic sequence, and atomic stack transitions using stored typed mutations.
- [x] Confirm HistoryEntry, mutations, and current document are not public exports.
- [x] Run focused history tests and typecheck.

Rollback point: history is internal; submit can be retained or reverted as one module boundary.

## Slice 5 — Deterministic Replay and Ownership

- [x] RED: repeated replay deep equality for final document, version sequence, and result classification; stop-on-rejection behavior; detached returned document.
- [x] RED: caller mutation of initial document and previously submitted payload cannot alter bus/history/replay results.
- [x] RED: deep unknown ExtensionBlock survival across submit rejection, commit, undo, redo, and replay.
- [x] GREEN: implement replay by invoking the same isolated submit transition used by CommandBus.
- [x] Search production code for `Date`, `Math.random`, tick/slot/path/splice/patch, and accidental mutable getters.
- [x] Run focused replay/ownership tests and typecheck.

Rollback point: replay is an additive wrapper over the transaction engine.

## Slice 6 — Public Boundary and Full Verification

- [x] RED/GREEN: extend public API boundary tests for approved exports and forbidden internals/K1-3/K1-4 APIs.
- [x] Extend forbidden dependency tests to cover all new command modules.
- [x] Update Core spec indexes/quality checklist if implementation reveals stable conventions; do not broaden scope.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `npm test` in an environment that permits subprocess spawning.
- [x] Run `git diff --check`.
- [x] Run Trellis task validation/check, review the complete diff, and commit implementation separately from planning.

## Slice 7 — Independent Acceptance Repair

- [x] RED: prove the exported default Profile and its nested values are not runtime-frozen and attempted mutation changes chord replay classification.
- [x] RED: prove undo/redo do not convert an unexpected support-classification failure to an atomic history failure.
- [x] RED: prove a maximum-length sparse array reaches the decoder's declared-length loop before actual key cardinality is checked.
- [x] GREEN: deeply freeze the default K1 Profile without changing custom-profile or K1-1 validation semantics.
- [x] GREEN: wrap complete undo/redo transition bodies and map unexpected failures to `history.invariant-violation` with the original state.
- [x] GREEN: inspect the array length descriptor and actual own-key count before iterating dense indexes.
- [x] Synchronize the independent K1-2 task, active Core specs, parent roadmap, and product SPEC-016 without expanding K1-2.
- [x] Re-run focused regressions, full quality gates, and Trellis validation/check.
- [x] Receive independent manual re-acceptance before archiving K1-2 or starting K1-3.

## Review Gates

- Gate A: planning artifacts and specs are internally consistent before `task.py start`.
- Gate B: each slice has observed behavioral RED evidence before production code.
- Gate C: no frozen K1-1 contract changed.
- Gate D: public surface contains no internal mutation/history/document getter or later-block API.
- Gate E: all full validation commands pass before completion is claimed.

## Stop Conditions

Stop and return to planning if any slice requires a persisted schema change, K1-1 diagnostic rename, mutable document exposure, full range model, snapshot/event API, registry/capability, Guitar semantics, UI/IO integration, or a public generic patch mechanism.
