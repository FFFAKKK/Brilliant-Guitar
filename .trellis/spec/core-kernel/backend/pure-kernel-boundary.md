# Pure Kernel Boundary

> **Authoritative staged boundary (2026-07-16):** The Core V1 roadmap still
> classifies nine mechanisms, but each task implements only its approved block.

## Current Accepted K1-3 / K1-4 Implementation Stage

K1-1 score document/exact time, semantic schema/codec, hard validation, feature-profile validation, and diagnostics are the frozen foundation. Accepted K1-2 adds the closed six-command write boundary, atomic transactions, documentVersion, fine-grained history, undo/redo, and deterministic command replay. Accepted K1-3 adds stable address/range, deeply immutable reads, exact dirty checkpoints, and two deterministic committed/session facts at baseline `7369eeac60fecea66c2c9164c04439625c2d78b0`. K1-4 implementation is in progress: Tasks 1–2 completed at `029fb5c` and `2766008`, with 110/110 tests at the Task 2 baseline; Tasks 3–6 remain pending. It adds only a startup-frozen command/selector Registry and capability gateway. General reports and migrations remain later tasks.

`ExtensionBlock` belongs to the score document/schema mechanism. It stores pure JSON-compatible data and does not create a registry, plugin runtime, capability system, or tenth mechanism.

Current boundary rules:

- Core persists WrittenPitch and Part transposition; SoundingPitch is derived.
- Core owns Fraction/NoteValue; tick, PPQ, milliseconds, playback cursors, and layout coordinates are adapter-derived.
- Core preserves score/part ExtensionBlock envelopes but never interprets guitar tuning, string/fret, or technique payloads.
- Core codec owns `unknown` to typed semantic data; physical files and original bytes remain external.
- K1-3 keeps `CommandBus` as the only public session owner. Reads return detached frozen snapshots; `markPersisted` changes only the clean checkpoint; publishing remains private.
- K1-3 exposes no mutable ScoreDocument, patch API, dynamic selector/event registration, registry, report framework, plugin lifecycle, UI/IO object, or physical save operation. Approved K1-4 may add only the frozen Registry/gateway surface in `registry-capability.md` and cannot widen K1-3 events or writes.
- Fixtures and test helpers live under `test/` and never enter production exports.

Every active type must map to the frozen K1-1 foundation, accepted K1-2/K1-3 contracts, or the approved K1-4 Registry plan. Anything else requires a new approved task.

Later-stage design is a roadmap only and must be refreshed against the reviewed `brilliant-score-1` contract before implementation. Retired boundary drafts are stored under `.trellis/archive/core-kernel/`.
