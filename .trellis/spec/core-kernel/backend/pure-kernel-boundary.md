# Pure Kernel Boundary

> **Authoritative staged boundary (2026-07-15):** The Core V1 roadmap still
> classifies nine mechanisms, but each task implements only its approved block.

## Current K1-3 Planning Stage

K1-1 score document/exact time, semantic schema/codec, hard validation, feature-profile validation, and diagnostics are the frozen foundation. Accepted K1-2 adds the closed six-command write boundary, atomic transactions, documentVersion, fine-grained history, undo/redo, and deterministic command replay. K1-3 now plans only stable address/range, deeply immutable reads, exact dirty checkpoints, and two deterministic committed/session facts. Registry/capability, general reports, and migrations remain separately reviewed later tasks.

`ExtensionBlock` belongs to the score document/schema mechanism. It stores pure JSON-compatible data and does not create a registry, plugin runtime, capability system, or tenth mechanism.

Current boundary rules:

- Core persists WrittenPitch and Part transposition; SoundingPitch is derived.
- Core owns Fraction/NoteValue; tick, PPQ, milliseconds, playback cursors, and layout coordinates are adapter-derived.
- Core preserves score/part ExtensionBlock envelopes but never interprets guitar tuning, string/fret, or technique payloads.
- Core codec owns `unknown` to typed semantic data; physical files and original bytes remain external.
- K1-3 keeps `CommandBus` as the only public session owner. Reads return detached frozen snapshots; `markPersisted` changes only the clean checkpoint; publishing remains private.
- K1-3 exposes no mutable ScoreDocument, patch API, dynamic selector/event registration, registry, report framework, plugin lifecycle, UI/IO object, or physical save operation.
- Fixtures and test helpers live under `test/` and never enter production exports.

Every active type must map to the frozen K1-1 foundation, approved K1-2 block, or reviewed K1-3 planning contract. Anything else requires a new approved task.

Later-stage design is a roadmap only and must be refreshed against the reviewed `brilliant-score-1` contract before implementation. Retired boundary drafts are stored under `.trellis/archive/core-kernel/`.
