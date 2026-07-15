# K1-3 Address / Snapshots / Selectors / Events

## Status

- Phase: implementation complete candidate; independent final acceptance is pending.
- Base: independently accepted K1-2 implementation `b62a838`, archived by `fcc7707`.
- Branch: `codex/k1-3-address-snapshots-selectors-events`.
- Authority: this task's `prd.md`, `design.md`, and `implement.md`, plus `.trellis/spec/core-kernel/backend/snapshot-events.md`.
- Gate: implementation is complete-candidate; the task remains `in_progress` until an independent final acceptance fixes the accepted HEAD.

## Goal and User Value

Add the Pure Core read and committed-notification boundary over the frozen `brilliant-score-1` document and K1-2 `CommandBus`: stable semantic addresses/ranges, deeply immutable versioned snapshots, pure built-in selectors, exact session dirty state, and deterministic post-commit events. External modules must be able to read and react to committed score state without receiving a mutable Core document, bypassing semantic commands, or pulling Registry/Capability, general reports, Guitar semantics, UI, playback, layout, or physical IO into K1-3.

## Confirmed Foundation

- `ScoreDocument` remains the only score truth; K1-3 cannot add a parallel read model or persisted schema fields.
- K1-2 owns the private document, monotonically increasing `documentVersion`, deterministic history sequence, undo stack, and redo stack.
- The current stable entity language is document/measure/part/staff/voice/event/note IDs. Public array indexes, JSON paths, tick/PPQ, layout coordinates, screen coordinates, Guitar string/fret, and UI selection are not Core addresses.
- `measureDefinitions` supplies global Measure order. A Part's `measureContents` is joined by `measureId`; its array order is not the musical ordering authority. Event order is the containing Voice's `sequence.events` order.
- K1-4 Registry/Capability and dynamic selector/event contributions remain out of scope. K1-3 uses a closed built-in read/event surface.
- K1-5 general KernelError/report shells remain out of scope; K1-3 may define only the closed failures needed by its own read/subscription/checkpoint contracts.
- Retired track/beat/tick address drafts are non-authoritative.

## Requirements

### Address and range

- **K1-3-REQ-001 — Stable address:** `ScoreAddress` is the K1-2 seven-kind stable-ID `ScoreEntityTarget` contract, not a second target language.
- **K1-3-REQ-002 — Typed points:** `ScorePoint` is a closed union of global Measure points, Part-scoped Measure points, and Voice-scoped Event points.
- **K1-3-REQ-003 — Typed inclusive ranges:** `ScoreRange` is a closed union of global Measure ranges, Part-scoped Measure ranges, and Voice-scoped Event ranges. Endpoints are inclusive and normalized to musical order. Reverse input is accepted and canonicalized. Arbitrary cross-Part or cross-Voice linear ranges are rejected; a future UI may represent disjoint selection as multiple Core ranges.
- **K1-3-REQ-004 — Stable resolution:** public address/range inputs are strictly decoded without getters, extra fields, indexes, paths, ticks, or coordinates. Missing entities, wrong owners, incompatible endpoint kinds, and internal invariant failures return closed privacy-safe failures and never raw exceptions.

### Snapshot and selectors

- **K1-3-REQ-005 — Snapshot identity:** a `DocumentSnapshot` is logically identified only by `documentId + schemaVersion + documentVersion`. It has no timestamp, random ID, or separate `snapshotId`.
- **K1-3-REQ-006 — Deep immutability:** every public snapshot and selector result is detached from writable CommandBus state and runtime-deep-frozen. Old snapshots remain stable after later commits. All unknown ExtensionBlock JSON values are preserved exactly.
- **K1-3-REQ-007 — Atomic read state:** `CommandBus.read()` returns a stable result containing the current `DocumentSnapshot`, `{ undoDepth, redoDepth }`, and `dirty` boolean from one synchronous state observation. Snapshot construction/invariant failures return a closed read failure without changing runtime state.
- **K1-3-REQ-008 — Closed pure selectors:** K1-3 exports only metadata, stable entity lookup, structural ownership lookup, typed range resolution, history-state, and dirty-state selectors. They are deterministic pure reads over a Core-produced read state/snapshot. The snapshot itself supplies full-document reading. Serializable-score shaping, diagnostics aggregation, registry summary, layout/playback projections, Guitar interpretation, and dynamic selector registration are excluded.
- **K1-3-REQ-009 — Cache boundary:** the runtime may cache the current deeply frozen DocumentSnapshot and private lookup indexes, but object-reference identity is not a public contract and cached state cannot become a write-back channel.

### Dirty checkpoint

- **K1-3-REQ-010 — Exact clean state:** the initial state is clean. K1-3 derives a deterministic internal content-state identity from the current K1-2 history position. A committed edit moves away from the clean identity; undo/redo returns to clean exactly when it returns to that saved history state. Deeply equal content recreated on another branch remains dirty.
- **K1-3-REQ-011 — Async-safe persisted checkpoint:** physical IO saves a specific snapshot and then calls `CommandBus.markPersisted({ documentId, documentVersion })`. K1-3 maps that observed version to its internal content-state identity. If later edits already exist, the older saved state becomes the clean checkpoint while the current state remains dirty. Malformed, wrong-document, unavailable-version, reentrant, overflow, and internal failures are stable rejections. K1-3 performs no filesystem IO or whole-document hashing.

### Events and isolation

- **K1-3-REQ-012 — Two public facts:** every successful submit/undo/redo publishes exactly one `core.document.committed` event. A separate `core.session.dirty-state-changed` event is published only when the dirty boolean changes, including a successful persisted checkpoint. Rejected, no-op, empty-history, rolled-back, and failed checkpoint operations publish no event.
- **K1-3-REQ-013 — Deterministic event envelope:** events carry `eventVersion: 1`, a safe monotonically increasing `eventSequence`, `eventType`, `documentId`, `documentVersion`, cause, command type when applicable, and deeply frozen stable affected entity targets. They contain no wall clock, randomness, internal mutation, HistoryEntry, mutable document, handler, raw exception, source path, or UI/layout/playback object. When one transition produces two facts, document-committed is dispatched before dirty-state-changed.
- **K1-3-REQ-014 — Subscription isolation:** subscriptions run synchronously in registration order over a snapshot of the subscriber list. Each subscription is independent and returns an idempotent unsubscribe function. Subscription changes during dispatch affect only later events. One handler failure cannot roll back committed state, stop later handlers, or escape as a raw exception; K1-5 may later add structured module-error reporting.
- **K1-3-REQ-015 — Reentrancy and overflow:** `submit`, `undo`, `redo`, and `markPersisted` are synchronously rejected while an event callback is active. Read and subscribe/unsubscribe remain allowed. Required event-sequence capacity is checked before accepting a transition, so overflow rejects atomically without changing document, version, history, dirty checkpoint, or event state.

### Compatibility and boundary

- **K1-3-REQ-016 — K1-2 compatibility:** K1-3 does not change command envelopes, the six-command catalog, semantic/profile behavior, mutation persistence, history contents, undo/redo meaning, or replay behavior. The only additive `CommandFailure` variants are the K1-3 event-boundary failures needed when existing write methods are called reentrantly or cannot reserve event sequence capacity.
- **K1-3-REQ-017 — Replay boundary:** `replayCoreCommands` remains a detached deterministic command replay helper. It does not replay subscribers, dirty checkpoints, snapshot caches, or event session history.
- **K1-3-REQ-018 — External derived state:** playback ticks/cursors, layout geometry, render nodes, UI selection direction, Guitar UI state, file paths, autosave policy, and export caches remain external projections over snapshots/events.
- **K1-3-REQ-019 — Public boundary:** public exports include only approved address/read/selector/event/checkpoint contracts and functions. Internal freeze helpers, indexes, event publisher, subscriber records, history state identities, version-to-state maps, mutations, and HistoryEntry remain private.

## Acceptance Criteria

- [x] **AC-001 (REQ-001..004):** all seven addresses resolve by stable ID; hierarchical ranges normalize in `measureDefinitions`/Voice event order; malformed, missing, wrong-owner, cross-kind, cross-Part, and cross-Voice cases return exact failures.
- [x] **AC-002 (REQ-005..009):** initial/committed/undo/redo snapshots have exact version correlation, are deeply frozen and detached, preserve unknown extensions, and expose no snapshot ID/time/cache identity contract.
- [x] **AC-003 (REQ-007..009):** the six approved selectors are pure, closed, deterministic, version-correlated, and return no writable CommandBus reference.
- [x] **AC-004 (REQ-010..011):** initial, edit, save, async-save, undo, redo, no-op, rejection, and history-branch cases prove exact dirty/clean behavior without hashing or IO.
- [x] **AC-005 (REQ-012..015):** event count, ordering, cause, affected targets, deep freeze, handler order/isolation, subscription snapshot semantics, unsubscribe idempotence, reentrant writes, and sequence overflow match the contracts exactly.
- [x] **AC-006 (REQ-016..019):** K1-1/K1-2 tests retain their meaning; replay emits no session events; public exports contain no K1-4/K1-5/Guitar/UI/IO/dynamic-registration or internal state API.
- [x] **AC-007:** `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, Trellis validation, and forbidden-dependency checks pass before implementation acceptance. Any sandbox `spawn EPERM` is rerun in the approved environment.

## Out of Scope

- New score commands, create/delete/transpose range commands, persisted command/event logs, collaboration, StepMap/OT/CRDT, or cross-session undo history.
- Arbitrary cross-Part/cross-Voice linear ranges, disjoint range sets, UI anchor/focus direction, hit testing, or layout coordinates.
- Dynamic selector/event registration, module identity, capability checks, plugin lifecycle, or third-party code execution.
- General operation-report framework, migrations, physical `.bgp` IO, save/autosave/recovery implementation, import/export, or filesystem integration.
- Guitar tuning/string/fret/technique interpretation, rendering, playback, audio, React, Tauri, VexFlow, browser DOM, or platform APIs.

## Approved Technical Trade-offs

- Extending the existing `CommandBus` keeps one session owner and one write boundary; a second public Kernel session object would duplicate state ownership.
- A history-position identity recognizes the exact saved state without expensive canonical JSON hashing. It intentionally does not declare a separately recreated equal branch clean.
- Hierarchical range variants avoid inventing a musically misleading total order across independent Parts and Voices.
- Version-only snapshot identity keeps repeated reads and command replay deterministic. Internal caching is an optimization, not observable identity.
- Two event types are enough for K1-3 consumers. History and document details are queried from committed read state instead of multiplied into more event families.
- Subscriber exception details are suppressed at this stage because exposing them ad hoc would pre-empt K1-5's structured error/report contract.

## Review Gate

There are no remaining product-scope questions. Planning is not executable until `design.md` and `implement.md` are complete, the PRD convergence and consistency checks pass, and the user explicitly approves the final planning set.
