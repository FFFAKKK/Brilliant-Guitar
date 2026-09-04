# RKP-4 History, Snapshots, Events and Replay

## Goal

Build the next private Rust-kernel stage on the accepted RKP-3 transaction
engine: retain reversible semantic history without document copies, implement
atomic undo/redo, expose cached immutable reads and index-backed selectors,
track persisted-state identity and dirty transitions, publish deterministic
data-only events through an isolated TypeScript subscription bridge, maintain a
bounded in-memory materialization checkpoint, and replay Core semantic
envelopes through a fresh native session. The Pure TypeScript Core remains the
product default.

## Background

- Planning base: `46a684c78551d118f75b4864a8ed6ec5d3de77c3` on
  `codex/rkp-3-transaction-overlay-changeset-planning`.
- RKP-3 is accepted and archived. Its audited technical source is
  `3ca82f1fcf68070e6c775d0848839864dbc87c71`, with archive compatibility at
  `560fd89d32026cdc41c3cf0df65285e99e015456`.
- RKP-3 supplies the indexed `LiveScoreStore`, the exact 28 Core command
  routes, atomic forward/inverse `ChangeSetV1`, stable affected addresses,
  batch-child segments, logical-byte accounting, and a private native submit
  seam. Its current Rust read still reports placeholder history/dirty state and
  materializes the complete document on every call.
- Architecture Reset V2 assigns RKP-4 history, selectors/snapshots, events,
  replay, dirty mechanics, and checkpoints. RKP-5 remains the sole owner of
  incremental Level A/B/C validation and support classification; RKP-6 owns
  integrated plugin/session composition; RKP-7 owns complete differential and
  performance qualification.
- The immutable RKP-0 oracle rows 57-61 define the applicable Core history,
  dirty, event, batch, and replay projections. RKP-4 consumes those rows without
  changing the oracle bytes or claiming later integrated behavior.

## Requirements

### RKP4-R001 — Store semantic history as one vector plus cursor

The Rust runtime shall own `Vec<HistoryEntryV1> + cursor`. Each effective Core
submit stores one monotonically sequenced, detached entry containing the
original semantic command envelope, the accepted RKP-3 `ChangeSetV1` with
ordered forward and reverse-safe inverse operations, canonical affected
addresses, and batch-child boundaries. It shall not store a full document,
runtime handle, function/trait object, JS value, wall clock, random value, raw
error, UI value, or file object.

`undoDepth == cursor` and `redoDepth == entries.len() - cursor`. An effective
submit after undo truncates the redo tail and appends one new entry. Rejected
and no-op submits preserve the vector, cursor, next sequence, document version,
dirty identity, snapshot/checkpoint state, and event sequence. History is never
silently evicted.

### RKP4-R002 — Apply stored effects atomically for undo and redo

Undo selects `entries[cursor - 1]` and applies its inverse without rerunning the
command preparer; redo selects `entries[cursor]` and applies its forward
operations without rerunning the preparer. Both use a production-internal RKP-3
stored-effect preflight/adoption path, recheck operation preconditions and local
store/index invariants, update every affected index atomically, increment the
document version exactly once, and move the cursor only after infallible
adoption begins.

Empty undo/redo returns the accepted stable failures with exact zero state and
event delta. Any expected preflight, capacity, event-sequence, or invariant
failure occurs before live mutation. An unexpected panic after adoption begins
poisons the native session rather than presenting partial state as a normal
rejection.

RKP-4 does not claim final Level A/B/C validation or support classification.
RKP-5 must insert those checks into this same pre-adoption pipeline before the
Rust engine can claim complete public undo/redo parity.

### RKP4-R003 — Track dirty state by content identity, not deep equality

The content identity is the sequence of the entry immediately before the
cursor, or `0` at the initial state. The runtime shall retain one checked
identity for every committed document version so a delayed asynchronous save
can mark an older observed version persisted in O(1). `markPersisted` validates
the exact `{documentId, documentVersion}` checkpoint, updates only the clean
identity, and performs no filesystem I/O, hashing, encoding, or document
comparison.

Undoing to a clean identity clears dirty; redo or a new branch may set it again.
A deep-equal branch with a different history sequence remains dirty. Invalid,
mismatched, unavailable, invariant-failing, and reentrant checkpoints preserve
all state and publish no event. A no-op checkpoint publishes no event.

### RKP4-R004 — Cache explicit immutable snapshots

An explicit read shall atomically return document identity/schema/version, a
complete detached immutable `ScoreDocument`, history depths, and dirty state.
The Rust runtime materializes at most one current-revision snapshot cache entry;
repeated reads of the same revision reuse it. The private TypeScript adapter
passes its known cached revision so a same-revision native response may omit
the document bytes and reuse the exact frozen JS snapshot object. A caller with
no matching cache always receives a complete document.

A successful document mutation invalidates only the current native cache.
Previously returned JS snapshots stay stable and detached. Failed/no-op writes
and `markPersisted` do not invalidate document content. Snapshot construction or
serialization failure preserves the live session and old cache and returns a
stable data-only failure.

### RKP4-R005 — Read selectors directly from the live store and indices

The private Stage-4 native path shall implement the accepted metadata, entity,
ownership, range, history, and dirty selectors. Non-document entity and range
selectors resolve through stable-ID, ownership, order, reference, and time
indices and materialize only the selected DTO slice. They must not first export
or traverse the whole document. Explicit document-entity selection may reuse
the full snapshot cache because the requested value is the entire document.

Selector outputs are detached, deeply frozen by the TypeScript adapter,
repeatable, and version-coherent. Invalid address/range, missing endpoint,
owner mismatch, and invariant failures retain the accepted stable read codes
and never mutate session state.

### RKP4-R006 — Keep persisted identity and operational checkpoints separate

The public-compatible `markPersisted` identity in RKP4-R003 is not the internal
materialization checkpoint. The runtime shall schedule one replaceable,
in-memory operational checkpoint after either 512 newly committed history
entries or 33,554,432 accumulated `ChangeSet` logical bytes since the last
successful checkpoint. Undo/redo do not create history entries and therefore do
not advance these scheduling counters.

Checkpoint construction runs only after the interactive commit critical
section and is tied to the accepted document version, history cursor, content
identity, and a detached canonical document. At most the latest completed
checkpoint is retained, so checkpoint count is bounded at one while history is
not evicted. A materialization/allocation failure cannot roll back the already
committed edit: the previous checkpoint remains valid, the due state and
counters remain set for a later retry, no public event is emitted, and a stable
private maintenance status/counter records the condition. Physical journal,
crash recovery, paths, and file I/O belong to Persistence.

### RKP4-R007 — Sequence events in Rust and dispatch handlers in TypeScript

Before a committing transition, Rust shall reserve all required safe-integer
event sequences. Submit/undo/redo publishes one
`core.document.committed` event; a dirty toggle additionally publishes one
`core.session.dirty-state-changed` event after it. `markPersisted` publishes
only a dirty event when dirty actually toggles. Rejects, no-ops, empty history,
failed reads, and failed checkpoints publish nothing.

Events contain only event version/sequence, document identity/version, cause,
Core command ID, canonical affected stable addresses, and dirty value where
applicable. Rust returns detached data-only event DTOs after commit; it never
stores JS handlers or host objects.

The private TypeScript adapter owns subscriptions and dispatches synchronously
before the initiating call returns, in registration order, over a per-event
subscriber snapshot. Duplicate subscriptions are independent, unsubscribe is
idempotent, and synchronous throws, rejected promises, and rejecting thenables
are isolated without stopping later handlers or creating an unhandled
rejection. Reads/selectors are allowed during callbacks; submit, undo, redo,
and `markPersisted` reject reentrantly before entering native code.

### RKP4-R008 — Replay semantic envelopes through a fresh session

The native replay seam accepts one strict initial `ScoreDocument` and a dense
array of Core semantic envelopes, creates a fresh isolated session, and routes
each envelope through the same decode, catalog, handler, transaction, history,
and version pipeline used by interactive submit. It never accepts stored
ChangeSets, undo/redo logs, event logs, snapshots, handles, functions, or a live
session as replay input.

Replay stops at the first rejection, reports the lowest zero-based failed
command index, returns all results through that command and the final detached
canonical document, and never mutates or emits events to an existing session.
RKP-4 result comparison covers stage-owned status, version, history depths,
failure, and document projections only; RKP-5 later supplies support and full
validation parity.

### RKP4-R009 — Add one coherent private Stage-4 bridge surface

Preserve the three predecessor Node exports and add exactly two private exports:

- `operateKernelStage4V1(handle, requestBytes) -> Buffer` for submit, undo,
  redo, `markPersisted`, cache-aware read, and direct select operations;
- `replayKernelStage4V1(requestBytes) -> Buffer` for detached Core replay.

All Stage-4 requests and responses use exact versioned byte DTOs and the
existing 64 MiB bridge request/response caps, strict depth/property/dense-array
capture, opaque-handle ownership/thread/busy/reentrant/poison rules, and closed
failure mapping. The predecessor `submitKernelStage3V1` delegates to the unified
history-aware submit transition while discarding its unobservable event list;
the predecessor read returns real history/dirty fields. Mixed Stage-3/Stage-4
calls therefore cannot bypass history invariants.

This private bridge is evidence infrastructure, not a product engine selector
or new public TypeScript export.

### RKP4-R010 — Preserve atomic resource accounting

Before the first live mutation, every state-changing operation shall check the
document version, history sequence/cursor arithmetic, event sequence range,
history and per-version identity vector reservations, ChangeSet preconditions,
store/index commit plan, and applicable bridge/output caps. No expected failure
may remain after adoption begins.

Metrics distinguish interactive mutation work, explicit snapshot materializing
and serialization, selector slice work, checkpoint maintenance, and replay.
After load/warmup an ordinary local submit/undo/redo that does not cross a
checkpoint threshold records zero full-document scans, zero full-document
clones, zero full semantic validations, and zero full snapshot
materializations. Checkpoint-threshold materialization is explicitly attributed
to maintenance rather than hidden inside those counters.

### RKP4-R011 — Consume only the RKP-4 oracle projection

Without changing the immutable RKP-0 fixture bytes, mechanically exercise rows
57-61 and compare exact submit/no-op/persisted/dirty event traces, undo/redo and
redo-tail behavior, atomic batch history/event units, batch rejection zero
delta, and detached Core semantic replay. RKP-3 command/document projections
remain regressions.

RKP-4 must not claim RKP-5 validation/support, RKP-6 integrated module/plugin
identity and availability, row 62/64 integrated behavior, row 63 migration, or
RKP-7 performance qualification.

### RKP4-R012 — Preserve lifecycle, compatibility, and rollback boundaries

Implementation may touch only the eventual reviewed Stage-4 allowlist in
Contracts, Runtime, Session, Node, the private native adapter, successor-aware
Rust migration tests, the concise transition spec, and RKP-4/parent task
artifacts. It must not change public Core exports, the 28/51/8/34/9 protected
inventories, `brilliant-score-1`, Cargo dependency versions, frozen oracle
bytes, TypeScript command behavior, product default selection, qualification
evidence, RKP-5+, or remote state.

Rollback is removal/reversion of RKP-4 commits, leaving the accepted RKP-3
runtime and TypeScript product default intact.

## Acceptance Criteria

- [ ] AC1: Exact accepted RKP-3 base, clean worktree, task/branch/dependency,
  TypeScript-default, planning/implementation gate, and literal changed-path
  boundaries are mechanically asserted.
- [ ] AC2: `Vec<HistoryEntryV1> + cursor` proves multi-step submit/undo/redo,
  monotonic non-reused sequences, tail truncation, no-op/rejection redo
  preservation, batch boundaries, and no document copy in any history entry.
- [ ] AC3: Stored forward/inverse effects preflight and adopt atomically for all
  RKP-3 change classes; empty/capacity/precondition/invariant/version/event
  failures are exact zero-delta, and unexpected adoption panic poisons the
  handle.
- [ ] AC4: Dirty identity proves initial/edit/save/delayed-save/undo/redo/new
  branch/deep-equal branch behavior, exact checkpoint failures, and complete
  per-document-version identity retention.
- [ ] AC5: First and repeated full reads prove one current-revision native
  materialization, cache-aware no-document response, exact JS snapshot identity
  reuse, deep freeze/detachment, old-snapshot stability, and mutation
  invalidation.
- [ ] AC6: All six selector families match the accepted TypeScript projection;
  non-document entity/range paths use live indices with zero full snapshot
  materializations and bounded visited-record counters.
- [ ] AC7: Event counts, sequence reservation/overflow, identity, order,
  affected addresses, dirty toggles, batch unit, freeze/privacy, subscriber
  snapshot, duplicate/unsubscribe behavior, handler isolation, allowed reads,
  and rejected reentrant writes match the accepted contract.
- [ ] AC8: Operational checkpoint tests prove 511/512 entry and
  33,554,431/33,554,432-byte boundaries, latest-only replacement, accepted
  revision binding, post-critical-section attribution, failure retention/retry,
  no history eviction, and separation from `markPersisted`.
- [ ] AC9: Native replay proves strict dense capture, fresh-session isolation,
  semantic rerouting, stop-first rejection, exact failed index/results/final
  document, deterministic repeatability, no stored-effect inputs, and no live
  session event/state mutation.
- [ ] AC10: The real Node add-on proves exactly five exports, opaque-handle and
  64 MiB boundary safety, unified predecessor submit behavior, detached/frozen
  adapter outputs, subscriber failure isolation, and no product runtime switch.
- [ ] AC11: Immutable oracle rows 57-61 pass the RKP-4 projection while all
  RKP-3 Rust/Node/oracle gates and the full TypeScript suite remain green; no
  RKP-5+ claim is made.
- [ ] AC12: Format, check, test, clippy, supported-toolchain compatibility,
  typecheck, build, task validation, protected-path/hash checks, resource
  counters, `git diff --check`, and clean scoped commit review pass at one exact
  candidate head.
- [ ] AC13: A bounded implementation review reports no P0/P1/P2 findings before
  owner acceptance/archive. Technical PASS alone does not authorize archive,
  RKP-5, qualification, default cutover, cleanup, or push.

## Out of Scope

- RKP-5 incremental/full semantic validation parity, support/profile
  classification, Extension Protocol/request codecs, declarative rules, WASM,
  or domain facts beyond already captured RKP-3 Core affected data.
- RKP-6 integrated catalog, plugin/module commands, provider contribution
  identity behavior, availability, gateway, namespace, migration, or synthetic
  Instrument Plugin consumers.
- RKP-7 complete TS/Rust differential/performance qualification; RKP-8 runtime
  cutover; RKP-9 qualification/cleanup.
- Public application API changes, a product-visible engine selector, physical
  `.bgp` persistence/journal/crash recovery, UI/Workbench, renderer, playback,
  import/export, network, Guitar/Piano/Bass domain behavior, or official plugin
  implementation.
- New Cargo/npm dependencies, schema changes, frozen-oracle edits, acceptance,
  archive, remote push, or default-runtime change.

## Resolved Technical Decisions

1. History is a single vector plus cursor, not two stacks. Entry sequence is a
   content-state identity and is never reused after redo-tail truncation.
2. `markPersisted` records a clean history identity only. It is independent of
   the latest-only operational document checkpoint.
3. Event sequences and event facts are committed in Rust, while JS callback
   storage/dispatch stays in the private TypeScript adapter.
4. Native full reads use an explicit known-revision handshake so cache hits can
   omit document bytes without stranding a caller that lacks a JS cache.
5. RKP-4 undo/redo and replay are structurally complete but deliberately remain
   stage-private until RKP-5 inserts accepted validation/classification into the
   same pre-adoption path.
