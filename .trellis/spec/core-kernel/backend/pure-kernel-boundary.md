# Pure Kernel Boundary

> **Authoritative staged boundary (2026-07-15):** The Core V1 roadmap still
> classifies nine mechanisms, but each task implements only its approved block.

## Current K1-2 Stage

K1-1 score document/exact time, semantic schema/codec, hard validation, feature-profile validation, and diagnostics are the frozen foundation. K1-2 adds only the closed six-command write boundary, atomic transactions, documentVersion, fine-grained history, undo/redo, and deterministic command replay. Address/range, snapshot/events, registry/capability, general reports, and migrations remain separately reviewed later tasks.

`ExtensionBlock` belongs to the score document/schema mechanism. It stores pure JSON-compatible data and does not create a registry, plugin runtime, capability system, or tenth mechanism.

Current boundary rules:

- Core persists WrittenPitch and Part transposition; SoundingPitch is derived.
- Core owns Fraction/NoteValue; tick, PPQ, milliseconds, playback cursors, and layout coordinates are adapter-derived.
- Core preserves score/part ExtensionBlock envelopes but never interprets guitar tuning, string/fret, or technique payloads.
- Core codec owns `unknown` to typed semantic data; physical files and original bytes remain external.
- K1-2 exposes semantic `CommandBus.submit(unknown)`, undo/redo, and command replay only; it exposes no mutable ScoreDocument, patch API, snapshot API, registry, report framework, or plugin lifecycle.
- Fixtures and test helpers live under `test/` and never enter production exports.

Every active type must map to the frozen K1-1 foundation or the approved K1-2 command/transaction/history/replay block. Anything else requires a new approved task.

Later-stage design is a roadmap only and must be refreshed against the reviewed `brilliant-score-1` contract before implementation. Retired boundary drafts are stored under `.trellis/archive/core-kernel/`.
