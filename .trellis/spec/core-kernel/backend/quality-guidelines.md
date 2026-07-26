# Core Kernel Quality Guidelines

> **Authoritative staged quality gate (2026-07-20):** K1-1 through K1-4 tests
> are frozen regressions. K1-4 acceptance at `94766a0930c05e5339c44f667deaf02116af1c0c` passed 125/125 tests.
> K1-5 implementation baseline `51fa2177cbd25dea53f1ebaf23bd8b8426471589` was independently accepted at documentation baseline `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` on 2026-07-21. K1-6 test baseline `355512aba4a8057d2d75aa665d74df49cdd2e23c` was independently accepted at review baseline `989c1f7a4056b14d3d59918c9b96874ad71591a8` after 8/8 focused and 169/169 full tests.

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

Registry/capability, general report, migration, Guitar Domain, UI, playback, and IO tests must not be backported into K1-3 or used to rewrite its accepted contracts.

## K1-5 Required Tests

- Closed Issue classification and zero-leak internal/module/report/migration error conversion.
- Descriptor-first diagnostic and failure adapters covering every K1-1 through K1-4 code and exact details allowlists, including actual `CommandBus.create()`/replay `CommandBusCreationFailure` results.
- Compiler-exhaustive code maps for diagnostic, command, CommandBus creation, checkpoint, read, event and both Registry failure families; a newly added union code must fail typecheck until its table and fixture are updated.
- Extra-field, getter, Proxy, cyclic JsonValue, sparse array, and post-call mutation boundaries.
- Deterministic deeply frozen validation/migration reports with status and counts derived exclusively from issues.
- Current `brilliant-score-1` not-required migration, future/malformed/semantic-invalid/internal rejection, and preserved concrete diagnostics.
- Deep unknown ExtensionBlock preservation, repeated-result equality, and no generated ID/time fields.
- CommandBus document/history/dirty/event isolation and no migration physical IO or dynamic step registration.
- Explicit public exports for approved data APIs only; error classes, builders, strict codecs, dependency injection seams, and migration steps stay private.
- Focused K1-5 tests, full K1-1 through K1-5 regression, Trellis validation, `git diff --check`, and clean scoped commit review.

Retired aggregate V1 checklists are archived under `.trellis/archive/core-kernel/`, not a completion gate for K1-1.
