# ARCHIVED Snapshot and Events Draft

> **ARCHIVED — NOT A K1-3 IMPLEMENTATION CONTRACT.** Transaction and entity
> boundaries must be redesigned against `brilliant-score-1`.

## Core Rule

Reading is snapshot or selector based. Writing is command based. Events are post-commit facts.

Snapshot, selector, and event APIs must never become write channels.

## Snapshot Rules

- Core Kernel must expose a read-only `KernelReadApi`.
- `DocumentSnapshot` must include `documentId`, `schemaVersion`, `documentVersion`, `snapshotId`, and creation timestamp.
- Snapshot data must be immutable from the caller perspective.
- External snapshot mutation attempts must not affect kernel state.
- A full snapshot implementation is acceptable for V1 if it preserves the read-only contract.

## Selector Rules

- Selectors must be pure reads.
- Selector results must include source `documentVersion`.
- Selectors must not modify document, history, diagnostics, registry, dirty state, or module caches.
- Built-in selectors must cover serializable score data, measure ranges, entity lookup, diagnostics, history state, dirty state, and registry summary.

## Event Rules

- Kernel events are emitted only after a transaction commits.
- Failed, rejected, rolled-back, or unsupported commands must not publish `kernel.document.changed`.
- Event payloads must not include mutable `ScoreDocument`, internal deltas, React components, SVG/VexFlow objects, Web Audio nodes, Tauri file objects, or file-system handles.
- Event handlers must be isolated. Handler exceptions must produce diagnostics or module reports and must not roll back committed score transactions.
- Event dispatch must not allow synchronous reentrant command submission.

## External State Boundary

These do not belong to Core Kernel events:

- UI cursor.
- Selection highlight.
- Mouse drag state.
- Playback cursor tick.
- SVG DOM events.
- VexFlow object lifecycle.
- Web Audio node events.

External modules may derive layout primitives, hit areas, playback events, export page models, thumbnails, analysis reports, or import intermediate models from snapshots. These derived models are not `ScoreDocument` copies and cannot be written back as authoritative score state.
