# RKP-3 Transaction Overlay, ChangeSet and 28 Core Commands

## Goal

Build the next private Rust-kernel stage on the accepted and archived RKP-2 `LiveScoreStore`: resolve all 28 frozen Core semantic commands through indices, stage ordered reversible changes in an isolated transaction overlay, and adopt the store plus every affected index exactly once. The Pure TypeScript Core remains the product default.

## Background

- Planning base: `6d0956c970f4414cb61e0f3d7148672a6e635032` on `codex/rkp-2-indexed-live-score-store-implementation`.
- RKP-2 is accepted and archived; its worktree is clean and supplies the indexed `LiveScoreStore`, typed generational handles, canonical export, deterministic index rebuild/parity checks, and private complexity counters.
- The accepted TypeScript authority exposes exactly 28 command IDs in `src/core-kernel/commands/catalog.ts:1-69`, with envelopes/results/failures in `src/core-kernel/commands/contracts.ts:27-387`.
- Architecture Reset V2 assigns RKP-3 the Overlay/ChangeSet plus 28-command deliverable while TypeScript remains default (`.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md:896-917`). RKP-4 owns history/snapshots/events/replay; RKP-5 owns incremental semantic and extension validation.
- The frozen RKP-0 oracle contains exactly 28 accepted command rows, 28 missing-target rejection rows, and 8 cross-cutting rows. RKP-3 can consume the submit/document/zero-delta projections but must not claim the later history/event/replay or integrated-plugin projections.

## Requirements

### RKP3-R001 — Preserve the frozen semantic-command inventory

The stage shall recognize exactly the 28 command IDs and version-1 envelopes in the accepted order. Within the RKP-3-owned command-local boundary, it shall preserve stable-ID targets, exact anchors, payload semantics, caller-supplied inserted IDs, deterministic ordering, no-op behavior, failure precedence, batch child attribution, unknown ExtensionBlock preservation, and canonical `brilliant-score-1` output. Final semantic-diagnostic and support/classification outcomes remain explicitly outside this stage. It shall not add a generic patch, mutable-document, array-index, JSON-path, dynamic handler-registration, or arbitrary callback write path.

### RKP3-R002 — Keep crate ownership explicit

- `brilliant-core-types` owns the checked document-version increment primitive needed after revision zero.
- `brilliant-kernel-contracts` owns versioned, exact-shape, data-only command request/result/failure DTOs.
- `brilliant-kernel-session` owns the fixed 28-command catalog, route/decode orchestration, stable-target resolution requests, and Core handlers.
- `brilliant-kernel-runtime` owns `TransactionOverlay`, ordered forward/inverse `ChangeSet`, overlay-aware reads, capacity planning, store/index adoption, rollback-by-discard, and complexity counters.
- `brilliant-kernel-node` and the private TypeScript native adapter expose only bounded byte DTOs plus the existing opaque session handle; no Rust borrow, RuntimeHandle, ChangeSet, closure, trait object, mutable store, or whole-document normal-edit response crosses the boundary.

### RKP3-R003 — Freeze typed reversible change classes

The internal ChangeSet vocabulary shall cover scalar replacement, entity insert/remove, ordered-child insert/remove/move, ExtensionBlock replace/remove, and declared-reference update. Every record carries a typed stable address, the necessary precondition, and forward data. The runtime derives inverse data from the overlay-aware current state before staging the forward change and stores inverse operations in reverse-safe order. ChangeSets contain no wall clock, randomness, source paths, exception text, function pointers, host objects, or public serialization contract.

### RKP3-R004 — Isolate mutations until one atomic adoption

Handlers may read only through a restricted overlay-aware view and may only append through a restricted typed builder. Later batch children see earlier staged changes. Before adoption, the runtime must finish target/anchor/reference checks, duplicate-ID checks, effect/affected/ChangeSet caps, allocation reservation, index delta planning, local store invariants, deterministic affected-address generation, and the complete commit plan.

Any decode, route, resolution, precondition, capacity, invariant, or batch-child failure discards the overlay. The original records, topology, every derived index, document version, metrics-visible committed state, and explicit snapshot/encode result remain byte- and value-equivalent. No partial handle publication or generation leak is allowed.

### RKP3-R005 — Avoid the performance defect being remediated

After load/warmup, an ordinary local command shall record zero full-document scans, zero full-document clones, zero full semantic validations, and zero full snapshot materializations. Stable target lookup remains average O(1); affected ordered lookup remains O(log n + k) where applicable. A command may visit only its target/owner/reference closure and records required to build its reversible changes.

Full snapshot export is permitted only when the test explicitly calls the existing read/encode path after submit; it is not part of the timed submit path.

### RKP3-R006 — Preserve batch semantics and accepted caps

`core.transaction.batch` accepts a dense list of 1..100 non-batch Core children. Children decode, resolve, stage, and observe the shared overlay in order. A failed child returns the lowest zero-based `failedCommandIndex` and discards the entire overlay. An effective batch performs one adoption and one document-version increment; an all-no-op batch changes nothing. Child boundaries remain private stage data for RKP-4 history integration.

The accepted caps remain `100` children, `131,072` prepared semantic effects, `131,072` unique affected addresses, input depth `64`, default capture properties `1,048,576`, native-wire properties `1,572,864`, and bridge request/response bytes `64 MiB`. Prepared-effect accounting is a distinct TypeScript-compatible counter supplied by each handler; it is not inferred from the lower-level number of ChangeSet operations. RKP-3 additionally freezes `MAX_CHANGESET_LOGICAL_BYTES_V1 = 268,435,456` (`256 MiB`). Logical accounting counts each transaction-owned payload and interned stable string once, plus fixed published weights for operation, order, reference, affected-address, and batch-segment entries; it never uses allocator capacity or platform `size_of`. The stage must prove that the accepted `64 MiB` create plus `64 MiB` command boundary and property/effect caps fit this budget under the frozen accounting model. A failed proof reopens planning rather than silently narrowing the accepted TypeScript surface.

### RKP3-R007 — Use a stage-private native submit seam

RKP-3 may add a private native `submit` operation so the Rust stage can be exercised end to end through the real opaque handle and byte boundary. The response must be a small DTO containing only stage-owned status, document version, stable failure facts, affected addresses, and complexity counters needed for verification. Full document transfer occurs only through the separately invoked existing read path.

This seam is not a product runtime selector, does not replace the public TypeScript `CommandBus`, and does not claim the final application `CommandResult` until RKP-4/RKP-5/RKP-6 supply their owned fields and RKP-7 proves complete parity.

### RKP3-R008 — Consume frozen oracle evidence without rewriting it

The 64-row RKP-0 corpus and manifest remain byte-stable. RKP-3 shall mechanically select the 28 accepted and 28 rejected command rows, execute their submit operations against the Rust stage, and compare:

- accepted final canonical document bytes and document version;
- rejected stable failure and exact zero document/version delta;
- atomic batch final document and child-rejection zero delta;
- all 28 command IDs covered exactly once per accepted/rejected partition.

History depth, dirty state, undo/redo, events, replay, integrated module behavior, migration, and final support/classification equality remain later-stage gates and must not be reported as RKP-3 parity.

### RKP3-R009 — Fail closed at every boundary

Exact-shape decoding rejects extra/missing/duplicate fields, unknown tags/IDs, unsupported versions, invalid numeric domains, malformed unions, nested batch, and over-limit requests without panic or raw-error leakage. Detected capacity and invariant failures return stable data-only failures before adoption and preserve the live runtime. An unexpected panic after adoption begins is contained, poisons the session, and makes it permanently inaccessible rather than presenting a possibly partial state as a normal command rejection.

### RKP3-R010 — Preserve lifecycle and rollback boundaries

Implementation may touch only the eventual reviewed RKP-3 allowlist in the five Rust crates (`brilliant-core-types`, Contracts, Runtime, Session, Node), private native adapter, successor-aware Rust-migration tests, RKP-3 task artifacts, and any explicitly reviewed transition-spec amendment. TypeScript production command behavior, application public exports, `brilliant-score-1`, Cargo dependency versions, default runtime selection, frozen oracle bytes, qualification evidence, RKP-4+, and remote push remain unchanged.

Rollback is removal/reversion of the RKP-3 commits, leaving accepted RKP-2 and the TypeScript default intact.

## Acceptance Criteria

- [x] AC1: Exact RKP-2 base, clean worktree, branch, task, dependency, TypeScript-default, and no-RKP-4+ boundaries are mechanically asserted.
- [x] AC2: The exact 28-ID Rust catalog and exact request decoder cover every accepted command envelope; malformed/unknown/version/target/anchor/reference/batch failures are stable and zero-delta.
- [x] AC3: `TransactionOverlay` provides overlay-aware reads, deterministic typed staging, reverse-safe inverse derivation, preconditions, and discard-without-publication.
- [x] AC4: For every normal or expected failure outcome, store, topology, entity/ownership/time/extension/reference indices, and generational handles adopt one complete commit plan or remain entirely unchanged; an unexpected adoption panic poisons and retires the session.
- [x] AC5: All 28 accepted oracle submit projections match canonical final documents and version `1`; all 28 missing-target rows match `command.target-not-found`, version `0`, and byte-identical documents.
- [x] AC6: Batch-100, nested/empty/over-limit batch, mixed no-op/effective children, later-child visibility, lowest child failure, aggregate cap, and atomic discard/adoption tests pass.
- [x] AC7: Starting from pre-state, forward then inverse restores it; starting from committed state, inverse then forward restores it, for every change class and representative aggregate removal/move, including canonical document and index projections.
- [x] AC8: Local-command counters prove zero full-document scan/clone/semantic-validation/snapshot-materialization and bounded entity/index/overlay/ChangeSet work; explicit post-submit read remains separately counted.
- [x] AC9: The private Node path proves real add-on load, opaque-handle safety, request/response caps, panic containment, detached/frozen TypeScript results, no full-document submit payload, and no default-runtime change.
- [x] AC10: Existing RKP-2 focused/full Rust and Node tests remain green; TypeScript typecheck/build/full tests remain green with the immutable oracle and protected 28/51/8/34/9 inventories unchanged.
- [x] AC11: Exact production/test/spec/task allowlists, Cargo manifest/lock dependency zero-delta, no generated native artifact, and `git diff --check` pass from the pinned base.
- [x] AC12: A separate implementation review reports no P0/P1/P2 findings before owner acceptance/archive; that result does not authorize RKP-4, qualification, cutover, or push.

## Out of Scope

- RKP-4 history vector/cursor, undo/redo, checkpoints, dirty state, snapshot cache, events, subscriptions, and replay.
- RKP-5 incremental semantic/extension validation, profile/domain classifiers, affected-closure parity, Extension Protocol, or WASM.
- RKP-6 catalog/inventory composition, global read-only availability, extension gateway, stale revision, namespace enforcement, migration, or official/synthetic plugin consumers.
- RKP-7 complete differential/performance qualification; RKP-8 runtime cutover; RKP-9 official qualification and TypeScript-oracle cleanup.
- Product ApplicationAssembly, Workbench/UI, Guitar/Piano/Bass domain behavior, persistence, layout, renderer, playback, export, or public plugin APIs.
- New dependencies, schema changes, public application exports, a product-visible engine selector, or remote push.

## Resolved Technical Decision

RKP-3 does not materialize or full-validate a document inside native submit. It enforces exact decoding, command-local target/anchor/reference rules, duplicate-ID prevention, local record/topology/index/time invariants, resource limits, and atomic adoption. It deliberately does not claim `command.semantic-invalid`, profile/support classification, extension/domain validation, or complete application `CommandResult` parity; those remain RKP-5/RKP-7 gates. Semantically hostile commands that require later-stage validators are excluded from RKP-3 acceptance and the stage-private Node seam cannot become the product default. This decision follows the parent requirement that ordinary local edits record zero full semantic validations and the accepted stage ownership that assigns incremental semantic validation to RKP-5.
