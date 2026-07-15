# Command, Transaction, History, and Replay

> **Authoritative K1-2 contract (2026-07-15):** this guide defines the executable
> Pure Core write boundary over the frozen `brilliant-score-1` model.

## Public Write Boundary

- `CommandBus.submit(input: unknown)` is the only K1-2 score write entry.
- Public patch, JSON path, field replacement, array splice, script, and mutable whole-document replacement are forbidden.
- Public targets use stable document/measure/part/staff/voice/event/note IDs. They never use tick, slot, collection index, or persisted offset.
- Insert commands target one Voice and use `SequenceAnchor = start | after-event`. The referenced event must belong uniquely to that Voice.
- Full `ScorePoint` / `ScoreRange` and cross-Voice/cross-Measure range operations belong to K1-3.

## Envelope and Closed Command Set

Every envelope contains exactly `commandVersion: 1`, `commandId`, a typed target, and a strict payload. The closed built-in set is:

- `core.document.set-metadata`
- `core.note.set-written-pitch`
- `core.event.set-note-value`
- `core.voice.insert-notes-event`
- `core.voice.insert-rest-event`
- `core.event.remove`

Inserted Event and Note IDs are caller supplied. Core must not derive IDs from time, randomness, position, tick, or array index. K1-2 has no dynamic register/unregister API; registry and capability belong to K1-4.

## Transaction Contract

- A bus deep-clones and semantically validates initialization state and never retains caller-owned mutable references.
- Handlers prepare internal typed forward/inverse mutations only: metadata replacement, WrittenPitch replacement, NoteValue replacement, or one Voice/anchor Event insert/remove.
- Mutations are not public and are not a persistence/replay format.
- Forward mutation is applied to an isolated candidate. Core semantic validation runs before atomic state replacement.
- Semantic-invalid candidates reject with unchanged `semantic.*` diagnostics.
- Semantic-valid/profile-unsupported candidates commit and return the complete `ScoreSupportResult` such as `unsupported.chord`.
- Setting a replace-command value to its current deep-equal value is `no-op`: no version, history, or redo change.
- Unexpected handler/mutation errors collapse to a privacy-safe stable failure and never expose exception text, source, path, stack, or mutation data.

## Version and History

- New runtime version is 0. Each committed submit, undo, and redo increments exactly once; rejection/no-op does not increment. Unsafe-integer overflow rejects atomically.
- One committed command creates one internal HistoryEntry. Rejected/no-op operations create none.
- History stores a detached command, deterministic safe-integer sequence, and detached forward/inverse mutations. It stores no timestamps, random IDs, dirty state, events, or whole-document snapshots.
- Undo/redo apply one inverse/forward mutation to an isolated candidate and rerun semantic validation/profile classification before atomically moving the entry between stacks.
- A new committed command after undo clears redo. Rejected/no-op submissions preserve redo.

## Replay and Preservation

- `replayCoreCommands(initialDocument, acceptedCommands)` feeds command envelopes through the same decode/resolve/transaction/validation path as live submit.
- Replay does not accept internal mutations, active bus state, snapshots, or a submit/undo/redo operation log.
- Identical initial documents and command sequences produce deeply equal final documents, version sequences, and result classifications without clock/random dependencies.
- Replay returns a detached final document and cannot replace an active bus document wholesale.
- Unknown score-owned/part-owned ExtensionBlock payloads and every untargeted subtree survive commit, rejection, undo, redo, and replay.

## Stable Result and Failure Boundary

Every result reports status, documentVersion, undoDepth, and redoDepth. Committed/no-op results include support classification; rejected results include a closed privacy-safe failure.

Failure coverage includes malformed envelope/payload/version, unknown command ID, target mismatch/not found, anchor missing/wrong owner, semantic invalidity, version overflow, internal failure, empty undo/redo, and history invariant failure.

K1-2 does not own dirty state, snapshots/selectors, post-commit events, general reports, Registry/Capability, Guitar commands, UI, playback, or physical IO.
