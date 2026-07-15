# Command, Transaction, History, and Replay

> **Authoritative K1-2 contract (2026-07-15):** this guide defines the executable
> Pure Core write boundary over the frozen `brilliant-score-1` model.

## Scenario: K1-2 Semantic Command Runtime

### 1. Scope / Trigger

Apply this contract to every Core ScoreDocument write, transaction, version change, history transition, undo/redo, or deterministic command replay.

K1-2 does not own full ScorePoint/ScoreRange, dirty state, snapshots/selectors, post-commit events, general reports, Registry/Capability, Guitar commands, UI, playback, or physical IO.

### 2. Signatures

```typescript
type ScoreEntityTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string }

type SequenceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-event"; readonly eventId: string }

CommandBus.create(initialDocument: ScoreDocument): CommandBusCreationResult
CommandBus.submit(input: unknown): CommandResult
CommandBus.undo(): CommandResult
CommandBus.redo(): CommandResult

replayCoreCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
): ReplayCoreCommandsResult
```

Every envelope has exactly `commandVersion: 1`, `commandId`, `target`, and `payload`. The deeply frozen built-in catalog contains only:

- `core.document.set-metadata`
- `core.note.set-written-pitch`
- `core.event.set-note-value`
- `core.voice.insert-notes-event`
- `core.voice.insert-rest-event`
- `core.event.remove`

Every CommandResult contains status, documentVersion, undoDepth, and redoDepth. Committed/no-op results contain ScoreSupportResult; rejected results contain one closed CommandFailure.

### 3. Contracts

- `submit(unknown)` is the only K1-2 write entry. Public patch, JSON path, field replacement, splice, script, and mutable whole-document replacement are forbidden.
- Targets use stable IDs, never tick, slot, collection index, or persisted offset. Insertions use one Voice plus start/after-event; after-event must belong uniquely to that Voice.
- Inserted Event/Note IDs are caller supplied. Core never derives identity from time, randomness, position, tick, or array index.
- The command catalog is static. Dynamic register/unregister and externally supplied handlers belong to later Registry/Capability work.
- Initialization clones and semantically validates its document. Strict command decode constructs detached plain values and retains no caller references.
- Unknown decode must not execute getters, input array methods, iterators, or coercion hooks. Read own data descriptors, reject extra/sparse/accessor properties, and copy accepted arrays into new plain arrays. For arrays, read the own `length` data descriptor and actual own keys first; if `ownKeys.length !== length + 1`, reject before traversing declared indexes.
- Handlers prepare internal typed forward/inverse mutations only: metadata, WrittenPitch, NoteValue, or one Voice/anchor Event insert/remove. Mutations are neither public nor a persistence/replay format.
- Forward/inverse application creates an isolated candidate. Semantic validation runs before atomic state replacement; profile classification runs only for the valid candidate/current document.
- Semantic-invalid candidates reject with original `semantic.*` diagnostics. Semantic-valid/profile-unsupported candidates commit with complete unsupported classification.
- The exported default K1 ScoreFeatureProfile is deeply frozen at runtime, including nested constraints, meters/meter entries, and NoteValue allowed-value arrays. External code cannot change live or replay classification policy.
- Deep-equal replacement is no-op: no version/history/redo change.
- Runtime version starts at 0. Each committed submit/undo/redo increments once; rejection/no-op does not. Unsafe-integer overflow rejects atomically.
- One committed submit creates one internal HistoryEntry containing deterministic sequence, detached command, and detached forward/inverse mutations. No timestamps, random IDs, dirty/event state, or document snapshots.
- Undo/redo apply one inverse/forward mutation to an isolated candidate, rerun semantic/profile validation, and atomically move one entry. Their complete application/validation/classification paths have a final exception boundary; unexpected failures preserve the original state and return `history.invariant-violation`. A new committed submit clears redo; rejection/no-op preserves it.
- Replay feeds envelopes through the live submit transition, stops at rejection, and never accepts mutations, active state, snapshots, or a submit/undo/redo log.
- Unknown ExtensionBlock payloads and every untargeted subtree remain deeply equal across commit, rejection, undo, redo, and replay.
- Unexpected errors collapse to stable privacy-safe failures with no exception text, source, file path, stack, raw input, or mutation data.

### 4. Validation & Error Matrix

| Condition | Required result | State effect |
|---|---|---|
| malformed/extra/accessor/sparse envelope or payload | `command.invalid-envelope` | none |
| safe-integer version other than 1 | `command.unsupported-version` | none |
| unknown command ID | `command.unknown-id` | none |
| target kind mismatch / missing target | `command.target-mismatch` / `command.target-not-found` | none |
| anchor missing / belongs to another Voice | `command.anchor-not-found` / `command.anchor-wrong-owner` | none |
| candidate semantic-invalid | `command.semantic-invalid` + original diagnostics | none |
| candidate semantic-valid/profile-unsupported | committed + full unsupported result | version +1, one history entry |
| replacement equals current value | no-op + current support | none |
| version overflow / unexpected internal error | stable overflow/internal failure | none |
| empty undo/redo / corrupt history transition | stable history failure | none |

### 5. Good / Base / Bad Cases

- Good: set one Note WrittenPitch by noteId, commit one history entry, then undo/redo with one version increment each.
- Base: insert a semantic-valid two-Note Event and commit with `unsupported.chord`.
- Base: replay the same initial document and command sequence twice and obtain deep-equal documents, versions, and classifications.
- Bad: accept `startTick`, `/parts/0/...`, array-index targeting, public patch, or a payload with extra fields.
- Bad: execute an anchor getter or an input array's overridden `map`/iterator while deciding to reject malformed input.
- Bad: reject legal profile-unsupported data as corrupt, expose an internal mutation, or retain a caller-owned payload reference.

### 6. Tests Required

- Assert six valid commands plus wrong version, unknown ID, extra fields, wrong target, malformed unions, sparse arrays, non-finite values, accessors, poisoned array methods, and patch-like input.
- Assert a maximum-length sparse array rejects from descriptor/own-key cardinality before declared-index traversal.
- Assert all seven entity target kinds resolve internally; missing/duplicate targets and missing/duplicate/wrong-owner anchors never choose the first array match.
- Assert committed/no-op/rejected replacement behavior, exact insert/remove mutations, semantic-invalid rollback, and `unsupported.chord` commit.
- Assert handler/application exception privacy, version overflow, and history invariant failure preserve the exact state object and stack depths.
- Assert one entry per commit, deterministic history sequences, no snapshots/timestamps, multi-step undo/redo, empty stacks, and redo invalidation/preservation.
- Assert forward/inverse round trips, undo/redo semantic revalidation, caller-alias isolation, deterministic replay, and deep ExtensionBlock preservation on every path.
- Assert the default Profile is deeply frozen, tampering attempts cannot change replay classification, and unexpected undo/redo exceptions never escape or mutate state.
- Assert public exports omit catalog, codec, resolver, mutation, runtime state/history, mutable document getters, patch APIs, and K1-3/K1-4 APIs.
- Run `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check`.

### 7. Wrong vs Correct

```typescript
// Wrong: executes a method owned by untrusted input before rejecting extras.
const keys = inputArray.map((_, index) => String(index))

// Correct: inspect own data descriptors, reject extras/accessors, then copy.
const descriptor = Object.getOwnPropertyDescriptor(inputArray, String(index))
if (descriptor === undefined || !("value" in descriptor)) return invalid
decoded.push(descriptor.value)
```

```typescript
// Wrong: leaks storage shape and an unstable address.
submit({ op: "replace", path: "/parts/0/measureContents/0" })

// Correct: versioned semantic command with stable identity.
submit({
  commandVersion: 1,
  commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId },
  payload: { writtenPitch },
})
```
