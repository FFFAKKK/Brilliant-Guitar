# Pure Kernel Boundary

## Purpose

Keep Core Kernel V1 small, deterministic, testable, and independent from application shell concerns.

The kernel owns score truth and the module coordination contracts. It does not own UI, rendering, playback audio, desktop shell integration, or physical file IO.

## Required Kernel Mechanisms

Pure Core Kernel V1 contains exactly these mechanism groups:

- Score document model, including the musical time model.
- Semantic command boundary.
- Transaction history, undo, redo, and replay.
- Score address and range model.
- Hard validation.
- `.bgp` semantic schema and migration entry point.
- Snapshot, selector, and post-commit event protocol.
- Registry and capability boundary.
- Error, diagnostic, and report shells.

## Allowed Dependencies

- TypeScript standard language/runtime features.
- Pure data validation helpers.
- Pure test utilities.
- Small deterministic utilities for IDs, timestamps, cloning, freezing, and schema validation.

Any new dependency must be justified by a kernel mechanism and must not pull in browser, desktop, rendering, audio, file-system, network, PDF, image, or Guitar Pro parsing behavior.

## Forbidden Dependencies

Do not import or depend on:

- React or component state.
- Tauri APIs or Rust commands.
- VexFlow, SVG DOM, Canvas, browser DOM, or hit-testing APIs.
- Web Audio, AudioWorklet, MIDI, or sample playback libraries.
- PDF/PNG/SVG export libraries.
- Guitar Pro, MusicXML, MIDI, text-tab, PDF, or image import parsers.
- Zip, file picker, platform file-system, autosave, recent-files, or shell APIs.
- Third-party TypeScript plugin runtime, compiled plugin execution, Lua, native dynamic libraries, or Extension Host runtime.

## Boundary Rules

- Core Kernel may define import/export descriptor types, capability checks, and report shells, but it must not register real PDF, PNG, Guitar Pro, or physical `.bgp` IO handlers in V1.
- Core Kernel owns musical logical time, including tick units, duration values, measure lengths, and rhythm validation. It does not own wall-clock playback scheduling, Web Audio time, metronome sound, playback cursor tick events, UI timelines, or rendered coordinate systems.
- `.bgp` schema, manifest semantics, score JSON semantics, schema version, compatibility matrix, and migration entry points belong to the kernel.
- Physical zip reading/writing, file paths, atomic save, autosave recovery, and recent files belong to future persistence modules.
- UI cursor, selection, mouse drag state, playback cursor tick, layout coordinates, and rendered page coordinates are external session or layout state.
- External modules may derive read models from snapshots, but they cannot own or write back mutable `ScoreDocument` copies.
