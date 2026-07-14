# Core Kernel Quality Guidelines

> **Authoritative K1-1 quality gate (2026-07-13):** Only the test groups below
> are completion requirements for the current score-foundation task.

## Current K1-1 Required Tests

- Fraction canonicalization, exact arithmetic/comparison, triplets, and safe-integer overflow.
- NoteValue base/dot/time-modification conversion and derived event starts.
- General ScoreDocument construction for single Part, piano two-Staff, multi-Part, chord, and future rhythm cases.
- WrittenPitch/transposition/SoundingPitch derivation, including written E3 to sounding E2.
- Strict unknown decoding, malformed JSON safety, future version, and semantic JSON round-trip.
- Semantic ids/references/ownership/measure coverage/sequence/ExtensionBlock validation.
- ScoreFeatureProfile three-state result: supported, semantic-valid-but-unsupported, and semantic-invalid.
- Multi-Voice, unsupported meter/note-base/sequence-start/sequence-duration profile boundaries.
- Two-measure order-independent `measureContents[]` semantics and cross-entity global ID collisions.
- Deep unknown extension payload round-trip and public-export/forbidden-dependency boundaries.

Every production behavior starts with a compiling behavioral RED test. Compiler/import errors do not count as RED. Implementation is the minimum GREEN change, followed by target regression, `npm run typecheck`, and full `npm test`. Tests never weaken validation or assert only implementation call counts.

Command/history, snapshot/event, registry/capability, report, and migration tests belong to later K1 tasks and require refreshed task-level contracts before implementation.

Retired aggregate V1 checklists are archived under `.trellis/archive/core-kernel/`, not a completion gate for K1-1.
