# K1-2 Technical Design

## 1. Ownership Boundary

K1-2 adds one of the nine planned Core mechanisms: Commands / Transactions / History. It consumes the frozen K1-1 ScoreDocument, strict domain predicates, semantic validator, and `K1_SCORE_FEATURE_PROFILE`. It does not change persisted schema and does not add read snapshots, events, registries, Guitar semantics, UI, IO, or a generic report framework.

The public write surface is `CommandBus.submit(input: unknown)`, `undo()`, and `redo()`. No method returns the active mutable ScoreDocument. Tests may import internal transition modules directly, but `src/core-kernel/index.ts` exports only the approved public contracts.

## 2. Public Contracts

```typescript
export type ScoreEntityTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string };

export type SequenceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-event"; readonly eventId: string };
```

Every command envelope has exactly four fields: `commandVersion`, `commandId`, `target`, and `payload`. `commandVersion` is exactly `1`. The decoded command union is closed over six IDs:

| Command | Required target | Payload |
|---|---|---|
| `core.document.set-metadata` | document | `{ metadata: ScoreMetadata }` |
| `core.note.set-written-pitch` | note | `{ writtenPitch: WrittenPitch }` |
| `core.event.set-note-value` | event | `{ noteValue: NoteValue }` |
| `core.voice.insert-notes-event` | voice | `{ anchor, event: Notes RhythmicEvent }` |
| `core.voice.insert-rest-event` | voice | `{ anchor, event: Rest RhythmicEvent }` |
| `core.event.remove` | event | `{}` |

Inserted event shape uses the existing `RhythmicEvent` fields and exact `content.kind`; inserted IDs remain caller supplied. Strict codecs reject prototype surprises, sparse arrays, non-finite numbers, extra fields, wrong union kinds, wrong target kinds, and invalid domain values. Array decode reads the own `length` data descriptor and `Reflect.ownKeys()` first; if the own-key count cannot represent a dense array, it rejects before any index traversal proportional to the declared length.

The result union is:

```typescript
export type CommandResult =
  | {
      readonly status: "committed";
      readonly documentVersion: number;
      readonly support: ScoreSupportResult;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "no-op";
      readonly documentVersion: number;
      readonly support: ScoreSupportResult;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly failure: CommandFailure;
      readonly undoDepth: number;
      readonly redoDepth: number;
    };
```

`CommandFailure` is a discriminated union with closed codes:

- `command.invalid-envelope`
- `command.unsupported-version`
- `command.unknown-id`
- `command.target-mismatch`
- `command.target-not-found`
- `command.anchor-not-found`
- `command.anchor-wrong-owner`
- `command.semantic-invalid` with frozen `SemanticDiagnostic[]`
- `command.version-overflow`
- `command.internal-error`
- `history.empty-undo`
- `history.empty-redo`
- `history.invariant-violation`

Decoder failures may include a privacy-safe structured path and reason enum, never raw input or exception text.

## 3. Static Command Catalog

`CORE_COMMAND_DEFINITIONS` is an internal deeply frozen catalog keyed by the six command IDs and expected target kinds. The public command-ID type derives from this catalog; exhaustive decoder and mutation-handler switches consume the same closed ID set. There is no `register`, `unregister`, dynamic import, capability check, or externally supplied handler in K1-2.

The catalog is the single source of truth for dispatch. Exhaustive switches and `never` checks protect command and mutation additions from partial implementation.

## 4. Target Resolution

The resolver traverses the immutable document and returns exact entity context by stable ID. It counts matches rather than accepting the first match, so malformed duplicate-ID state cannot silently select an entity. Initialization semantic validation normally prevents duplicate IDs, but duplicate detection remains an internal invariant guard.

Event resolution also returns its owning Voice and predecessor anchor. Note resolution returns its Event/Voice ownership. Insertion resolves the target Voice and then resolves `SequenceAnchor` only within that Voice:

- `start` maps to index 0 internally.
- `after-event` maps to the unique matching event plus one.
- an event found elsewhere but not in the target Voice returns `command.anchor-wrong-owner`.
- absent or duplicate matches return stable failure without mutation.

Array indexes are transient implementation details and never enter public commands, history envelopes, replay input, or persisted data.

## 5. Internal Mutation Algebra

Internal-only `CoreMutation` is closed to:

- replace document metadata;
- replace one Note WrittenPitch;
- replace one Event NoteValue (`duration`);
- insert one Event in a Voice at a stable SequenceAnchor;
- remove one Event, retaining its original Voice and predecessor SequenceAnchor for inverse application.

Every handler returns a `PreparedMutation` containing `forward`, `inverse`, and `changed`. It never mutates live state. Mutations are neither JSON patch nor a public persistence format.

Replacing values stores deep-cloned before/after values. Insert/remove store deep-cloned event values and stable owners/anchors. Mutation application creates a detached candidate and changes only the resolved target field or Voice event sequence; every untargeted subtree and extension payload remains deeply equal.

## 6. Transaction State Machine

Internal state contains:

```text
document + documentVersion + nextHistorySequence + undoStack + redoStack
```

Initialization deep-clones the caller document and validates Core semantics. A factory result rejects invalid initialization without constructing a usable bus.

The exported `K1_SCORE_FEATURE_PROFILE` is a runtime-deep-frozen policy value, including cardinality constraints, the meter array and meter entries, and allowed NoteValue arrays. Live submit, undo/redo, and replay therefore observe one immutable default classification policy.

Submit flow:

```text
unknown
  -> strict envelope/command decode
  -> stable target + precondition resolution
  -> handler prepares forward/inverse mutation
  -> detect no-op
  -> check next version is safe
  -> apply forward to detached candidate
  -> semantic validation
  -> feature-profile classification
  -> atomic state replacement + one HistoryEntry + clear redo
```

Any decode, resolution, handler, mutation, validation, or overflow failure returns a rejection based on the unchanged state. Catch blocks collapse unexpected internal exceptions to `command.internal-error` and never expose exception contents.

No-op is evaluated only after successful decode/target resolution and before version allocation. Its support result is recomputed from the current valid document; it does not touch history or redo.

## 7. History / Undo / Redo

An internal `HistoryEntry` stores:

- deterministic safe-integer sequence starting at 1;
- a detached decoded command envelope;
- detached forward mutation;
- detached inverse mutation.

It stores no timestamp, random ID, dirty flag, event, caller reference, or whole before/after document snapshot.

Undo peeks one undo entry, checks version/history invariants, applies its inverse to a detached candidate, validates/classifies, then atomically moves the same entry to redo and increments version once. Redo mirrors this using forward mutation. Both complete transition bodies have a final exception boundary covering mutation application, semantic validation, and profile classification. If stored history or an unexpected dependency fails, the current document and both stacks remain unchanged and `history.invariant-violation` is returned without exposing the exception.

Only a new committed submit clears redo. Rejections and no-ops leave it intact.

## 8. Deterministic Replay

`replayCoreCommands(initialDocument, acceptedCommands)` creates an isolated runtime at version 0 and feeds each envelope through the same submit pipeline. It records each public result in order. If an envelope rejects, replay returns a rejected replay result with the failing index and the detached state produced by earlier accepted commands; it does not continue past the invalid accepted stream.

A successful replay result contains a detached final ScoreDocument, final documentVersion, and ordered command results. Replay accepts commands only; it cannot import mutations, undo/redo logs, active bus state, snapshots, wall-clock data, or random seeds. Replaying identical values produces deep-equal documents, versions, and classifications.

## 9. Failure / Side-Effect Matrix

| Case | Result | Version | Undo | Redo | Document |
|---|---|---:|---:|---:|---|
| malformed/version/unknown ID | rejected | same | same | same | same |
| target/anchor failure | rejected | same | same | same | same |
| replace current value | no-op | same | same | same | same |
| semantic-invalid candidate | rejected + semantic diagnostics | same | same | same | same |
| profile unsupported candidate | committed + unsupported | +1 | +1 | cleared | candidate |
| internal/overflow failure | rejected | same | same | same | same |
| empty undo/redo | rejected | same | same | same | same |
| unexpected undo/redo exception | rejected + history invariant | same | same | same | same |
| valid undo/redo | committed | +1 | moved one | moved one | candidate |

## 10. Alternatives Rejected

- Public JSON patch/delta: leaks storage shape and bypasses semantics.
- Full document snapshots in history: memory-heavy and conceals mutation ownership.
- Dynamic command registry: belongs to K1-4 and changes trust/capability requirements.
- Full ScorePoint/ScoreRange now: duplicates K1-3 address/range work.
- Dirty flags and post-commit events now: belong to K1-3 and would couple transaction internals to notification policy.
- Rejecting profile-unsupported documents: confuses legal Core data with corruption.
- Core-generated IDs/timestamps: breaks deterministic replay and reproducibility.

## 11. Compatibility and Rollback

No persisted ScoreDocument schema changes. K1-2 command envelopes are versioned independently with `commandVersion: 1`; they are an in-memory/replay contract, not yet a persisted cross-release log format. Rollback is removal of the new command modules and exports; K1-1 documents and codecs remain readable and unchanged.
