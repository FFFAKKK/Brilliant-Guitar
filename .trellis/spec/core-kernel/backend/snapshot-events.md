# Address, Snapshot, Selectors, Checkpoint, and Events

> **Accepted K1-3 contract (2026-07-16):** The archived independent
> `07-15-k1-3-address-snapshots-selectors-events` task is authoritative. Its fixed code baseline is `7369eeac60fecea66c2c9164c04439625c2d78b0`; typecheck, build, 102/102 tests, diff check, and Trellis validation passed.

## Address and Range

- `ScoreAddress` reuses the seven-kind K1-2 stable target union.
- `ScorePoint` supports global Measure, Part-scoped Measure, and Voice-scoped Event points.
- Inclusive ranges use matching hierarchical point kinds, normalize reverse endpoints, use `measureDefinitions` or Voice Event order, and reject arbitrary cross-Part/cross-Voice linear ranges.
- Public indexes, paths, ticks, layout/screen coordinates, UI direction, and Guitar string/fret are forbidden.

## Read and Checkpoint

- `CommandBus.read()` returns one atomic frozen `{ snapshot, history, dirty }` result.
- Snapshot identity is exactly document ID, schema version, and document version; there is no snapshot ID or creation time.
- Snapshots and selector results are detached and deeply frozen, preserve unknown ExtensionBlock JSON, and cannot be written back wholesale.
- The six selectors are metadata, entity, ownership, range, history state, and dirty state.
- `markPersisted({ documentId, documentVersion })` marks the actual asynchronously saved history state clean; it performs no IO or document hashing.

## Events

- Successful submit/undo/redo emits one `core.document.committed` fact.
- `core.session.dirty-state-changed` emits only when the dirty boolean toggles.
- Rejected/no-op/empty-history/rollback/failed-checkpoint operations emit nothing.
- Events use a safe deterministic sequence, stable IDs and document version; they contain no clock/random ID, mutable document, mutation, HistoryEntry, handler, raw error, path, or UI/layout/playback object.
- Document fact precedes dirty fact when both occur.
- Handlers run synchronously in registration order over a subscriber snapshot; failures are isolated and unsubscribe is idempotent.
- JavaScript handlers may still return a Promise/thenable even though the public callback contract is synchronous. Dispatch must observe that return value and attach rejection isolation without awaiting it; synchronous `throw` and asynchronous rejection must neither stop later handlers nor become `unhandledRejection`.
- Read/subscribe are permitted in callbacks; submit/undo/redo/markPersisted reject synchronous reentrancy.
- Event sequence capacity is checked before accepting the candidate transition.

The required isolation pattern captures the return value inside the per-handler
`try/catch` and immediately consumes a possible rejection:

```typescript
const result = handler(event)
if (result !== undefined) {
  void Promise.resolve(result).catch(() => {})
}
```

Awaiting the result is forbidden because it would change synchronous dispatch
order. Calling only `handler(event)` inside `try/catch` is insufficient because
that boundary cannot catch a later Promise rejection.

## Later Boundaries

Registry/Capability and dynamic contributions are K1-4. General error/report and subscriber-exception reporting are K1-5. Playback, layout, UI, Guitar semantics, autosave policy, physical IO, and persisted event logs remain external/later work.

## CVN-5 Aggregate History and Event Projection (Not Active)

An effective `core.transaction.batch` is one semantic transaction: one version increment, one history entry, one aggregate committed event and the existing optional dirty event. The outer event identity remains Core/`core.transaction.batch` even when accepted CVN-6 module children are present; child committed events are absent. History stores the frozen outer envelope plus private effective child/effect/inverse segments, not document snapshots. Undo/redo use stored effects with child preparer count zero and rerun the final semantic/CVN-6 assessment pipeline once. This behavior remains planning-only until the CVN-5 gate is accepted and activated.
