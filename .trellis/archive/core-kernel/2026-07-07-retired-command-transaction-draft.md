# ARCHIVED Command and Transaction Draft

> **ARCHIVED — NOT A K1-2 IMPLEMENTATION CONTRACT.** Replaced by the active
> replanning boundary after `brilliant-score-1` foundation review.

## Core Rule

All score writes go through registered semantic commands.

External callers must not mutate `ScoreDocument` directly and must not submit arbitrary patch operations, JSON paths, field replacements, array splices, or script-like write requests.

## Command Lifecycle

Every write command must follow this order:

1. Receive a `CommandEnvelope`.
2. Verify the command ID is registered.
3. Validate the payload schema.
4. Check caller capability.
5. Validate the command target address or range.
6. Check command preconditions.
7. Apply internal deltas to an isolated draft.
8. Run hard validation on the resulting document.
9. Commit on success.
10. Roll back on failure and return structured errors.

## Undo and Redo

- V1 uses fine-grained history.
- Each successful undoable semantic command creates one `HistoryEntry`.
- `undo` moves back one history entry.
- `redo` reapplies one history entry.
- Failed, unsupported, or rolled-back commands must not create history entries.
- Redo stack is cleared after a new successful command.
- Intelligent merge policies, time-window merges, macro coalescing, and cross-command compression are out of scope for V1.

## Internal Delta Boundary

Internal deltas may exist for transaction, history, replay, and debugging implementation.

Internal deltas must never become:

- Public plugin API.
- UI write API.
- Importer write API.
- Event payload.
- `.bgp` semantic schema.

## Required Command Tests

- A successful command changes the document, increments document version, creates events, and updates history if undoable.
- A failing command leaves the document, dirty state, events, and undo stack unchanged.
- `insertNote -> setNotePitch -> addTechnique` can be undone in three visible steps.
- Unsupported patch-like command IDs are rejected.
- Command replay produces the same score state from the same starting document.
