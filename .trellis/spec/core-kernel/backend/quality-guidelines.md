# Core Kernel Quality Guidelines

> **Authoritative staged quality gate (2026-07-15):** K1-1 and K1-2 tests
> remain frozen regressions; the K1-3 candidate adds only the address/read/checkpoint/event groups below and awaits independent acceptance.

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

## Current K1-2 Required Tests

- Strict six-command envelope/payload decoding and public patch rejection.
- Unknown command decoding never executes accessor properties, input array methods/iterators, or coercion hooks before rejection.
- Maximum-length sparse command arrays reject from descriptor/own-key cardinality before any declared-length traversal.
- Stable target/anchor resolution without public array/tick/slot addressing.
- Atomic commit/no-op/rejection, version overflow, and privacy-safe internal failure.
- Semantic-invalid rollback versus semantic-valid/profile-unsupported commit.
- One-entry history, multi-step undo/redo, empty stacks, and redo invalidation/preservation.
- Deterministic command replay, detached ownership, and no time/random dependencies.
- Runtime-deep-frozen default ScoreFeatureProfile and replay classification stability under attempted external tampering.
- Total undo/redo exception conversion to atomic `history.invariant-violation` results.
- Deep unknown ExtensionBlock preservation across all transaction/history/replay paths.
- Public export and forbidden-dependency boundaries excluding K1-3/K1-4 APIs.

## K1-3 Required Tests

- Seven stable address kinds and strict rejection of getter/extra/index/path/tick/coordinate inputs.
- Global Measure, Part Measure, and Voice Event inclusive range normalization, order, missing endpoint, and owner mismatch.
- Version-correlated deep-frozen detached snapshots and old-snapshot stability after later commits.
- Metadata/entity/ownership/range/history/dirty selector purity and closed export boundary.
- Initial/edit/save/async-save/undo/redo/branch exact dirty checkpoint behavior.
- Exact zero/one/two event counts, document-before-dirty order, affected IDs, and payload deep freeze/privacy.
- Subscriber registration order, dispatch snapshot, duplicate subscription, idempotent unsubscribe, handler isolation, and read-during-callback. Isolation tests cover synchronous `throw`, `async` throw, direct `Promise.reject()`, custom thenables, later-handler continuation, and absence of `unhandledRejection`.
- Reentrant submit/undo/redo/markPersisted and event-sequence overflow atomic rejection.
- Replay remains detached and event/checkpoint-session-free.
- Deep unknown ExtensionBlock preservation and K1-4/K1-5/Guitar/UI/IO/internal API exclusion.

Registry/capability, general report, migration, Guitar Domain, UI, playback, and IO tests remain later tasks and must not be pulled into K1-3.

Retired aggregate V1 checklists are archived under `.trellis/archive/core-kernel/`, not a completion gate for K1-1.
