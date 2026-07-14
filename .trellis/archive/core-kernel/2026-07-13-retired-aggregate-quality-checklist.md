# ARCHIVED Core Kernel Aggregate Quality Checklist

> **ARCHIVED — NOT AN IMPLEMENTATION CONTRACT.** This mixed aggregate checklist
> was removed from the active specification on 2026-07-14.

> **Authoritative K1-1 quality gate (2026-07-13):** Only the test groups below
> are completion requirements for the current score-foundation task.

## Current K1-1 Required Tests

- Fraction canonicalization, exact arithmetic/comparison, triplets, and safe-integer overflow.
- NoteValue base/dot/time-modification conversion and derived event starts.
- General ScoreDocument construction for single Part, piano two-Staff, multi-Part, chord, and future rhythm cases.
- WrittenPitch/transposition/SoundingPitch derivation, including written E3 to sounding E2.
- Strict unknown decoding, malformed JSON safety, future version, and semantic JSON round-trip.
- Semantic ids/references/ownership/measure coverage/sequence/ExtensionBlock validation.
- ScoreFeatureProfile supported versus semantic-valid-but-unsupported behavior.
- Deep unknown extension payload round-trip and public-export/forbidden-dependency boundaries.

Every production behavior starts with a compiling behavioral RED test. Compiler/import errors do not count as RED. Implementation is the minimum GREEN change, followed by target regression, `npm run typecheck`, and full `npm test`. Tests never weaken validation or assert only implementation call counts.

Command/history, snapshot/event, registry/capability, report, and migration tests belong to later K1 tasks.

---

## Superseded Aggregate V1 Checklist

<details>
<summary>Retained for later-task planning; not the K1-1 completion gate</summary>

## Test Environment

Core Kernel tests must run in a pure TypeScript environment without:

- Browser DOM.
- React.
- Tauri.
- VexFlow.
- Web Audio.
- PDF/PNG libraries.
- Guitar Pro parsers.
- Physical file-system IO dependencies.
- Third-party plugin runtimes.

## Required Test Groups

- Fixture validation for the 4-measure standard 6-string guitar riff.
- Schema round-trip for semantic `score.json` data.
- Migration entry point and migration report behavior.
- Command submit, rollback, undo, redo, and replay.
- Hard validation for supported and unsupported MVP boundaries.
- Snapshot immutability and selector purity.
- Post-commit event ordering and failure isolation.
- Registry duplicate ID, unsupported runtime, incompatible API version, and capability denied behavior.
- Error, diagnostic, and report privacy boundaries.
- Unsupported PDF/PNG/Guitar Pro/physical `.bgp` IO contribution behavior.

## Forbidden Test Shortcuts

- Do not assert only that a function was called when the score state is the real contract.
- Do not use UI snapshots or browser rendering to validate kernel semantics.
- Do not depend on current wall-clock time without injectable time or stable test helpers.
- Do not make tests pass by weakening hard validation.
- Do not skip unsupported-feature tests because the feature is "future work".
- Do not use mutable shared fixtures across tests.

## Review Checklist

Before completing a kernel implementation chunk, answer:

- Does any public API expose mutable `ScoreDocument`?
- Can every write path be traced to a semantic command, import result, or migration entry?
- Does every failed operation leave document state and history unchanged unless explicitly documented?
- Are all user-visible messages represented by i18n keys?
- Are new error codes documented and tested?
- Are future extension points descriptor-only where implementation is out of scope?
- Are old fixtures, command replays, and schema round-trips still valid?

</details>
