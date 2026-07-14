# Pure Core Kernel V1 Technical Design

## Status

- Phase: staged execution; K1-1 replacement child is in review.
- Parent task: `06-29-commercial-guitar-tablature-product`.
- Implementation target: pure TypeScript Core Kernel only.
- K1-1 authority: `.trellis/tasks/07-13-k1-1-foundation-replanning/design.md` and `.trellis/spec/core-kernel/backend/score-document-model.md`.
- K1-2 and later architecture sections below remain roadmap sketches and require separate review against completed `brilliant-score-1`.

## Design Principle

Core Kernel V1 is the owner of score truth and module coordination contracts. It is not the desktop app.

The kernel must stay small, deterministic, and testable:

- no React
- no Tauri
- no VexFlow / SVG DOM / browser DOM
- no Web Audio
- no PDF/PNG generation
- no Guitar Pro parser
- no zip or physical file-system IO
- no third-party plugin runtime

## Architecture Shape

The implementation should keep the kernel as a set of explicit mechanisms under `src/core-kernel/`, with one public export surface from `src/core-kernel/index.ts`.

Recommended internal structure:

```text
src/core-kernel/
  index.ts
  domain/
    fraction.ts
    score-document.ts
    musical-time.ts
    pitch.ts
    extensions.ts
    address.ts
  codec/
    decode-score-document.ts
    score-json.ts
  profiles/
    score-feature-profile.ts
    k1-score-feature-profile.ts
  validation/
    diagnostics.ts
    validate-score-semantics.ts
    validate-score-feature-profile.ts
  commands/
    command-types.ts
    command-bus.ts
    history.ts
    internal-delta.ts
  read/
    snapshot.ts
    selectors.ts
  events/
    kernel-event.ts
    event-bus.ts
  registry/
    registry.ts
    capability.ts
    startup-registration.ts
  reports/
    errors.ts
    reports.ts
    migration.ts
```

This structure is a planning target, not a command to create every file in the first coding round. Each implementation chunk should create only the files it needs.

## Data Flow

### Write Flow

```text
CommandEnvelope
  -> command id lookup
  -> payload validation
  -> capability check
  -> target/precondition validation
  -> isolated draft
  -> internal delta
  -> hard validation
  -> commit
  -> history entry
  -> post-commit events
```

Failure at any step rolls back and must not mutate document state, dirty state, event output, undo stack, or redo stack.

### Read Flow

```text
KernelReadApi
  -> immutable DocumentSnapshot
  -> pure selector
  -> caller-derived layout/playback/export/cache data
```

No caller may receive a mutable `ScoreDocument`.

### Registration Flow

```text
KernelStartupModuleManifest
  -> CoreModuleRegistration
  -> KernelRegistry validation
  -> contribution descriptor + handler stored internally
  -> read-only registry summary exposed
```

V1 accepts only startup-time `builtin/internal-module` registrations. Runtime plugin changes are unsupported.

## Boundary Decisions

### Score Truth

`ScoreDocument` is the only score truth and contains `schemaVersion`, `id`, `metadata`, global `measureDefinitions`, `parts`, and versioned `extensions`. Core stores no guitar tuning/string/fret/technique semantics; those belong to later Part-owned Guitar Domain payloads.

### Musical Time

Musical time uses canonical exact Fraction and persisted NoteValue. Event positions are derived from sequence start plus preceding durations. Tick/PPQ, milliseconds, playback clocks, and layout positions are adapter-derived and never persisted.

### Extensions and Techniques

Core persists only versioned score/part ExtensionBlock envelopes and preserves unknown JsonValue semantically. It does not implement a technique registry in K1-1. Concrete guitar technique payloads are interpreted later by Guitar Domain.

### File Semantics

Core Kernel owns `.bgp` semantic contracts:

- `manifest.json` semantics
- `score.json` schema
- schema version
- compatibility matrix
- migration entry
- `MigrationReport`

Core Kernel does not own zip read/write, file paths, autosave recovery, or atomic saving.

## Large Feature Order

### K1-0: Boundary and Harness

Why first: prevents accidental dependency drift before domain work grows.

Deliverables:

- keep package scripts working
- keep boundary smoke test
- ensure future tests run without UI or desktop dependencies

### K1-1: Score Model, Schema, Validation

Why second: every other mechanism depends on stable domain truth.

Deliverables:

- minimal Part/Staff/Voice/Event domain types
- exact Fraction/NoteValue helpers
- WrittenPitch/transposition/SoundingPitch derivation
- strict codec and semantic round-trip
- semantic and ScoreFeatureProfile validators
- stable diagnostics
- test-only fixtures and public-boundary checks

### K1-2: Commands and History

Why after K1-1: commands need stable domain entities and validation.

Deliverables:

- refreshed command specification against measure/part/staff/voice/event/note IDs
- command definitions for general score facts only; GuitarExtension commands remain Guitar Domain work
- command bus
- internal delta
- rollback
- undo/redo
- replay tests
- unknown ExtensionBlock preservation across every command/history path

### K1-3: Snapshot, Selectors, Events

Why after commands: snapshots and events need document version and transaction boundaries.

Deliverables:

- immutable snapshots
- built-in selectors
- event envelope
- event bus
- event handler failure isolation
- reentrancy guard

### K1-4: Registry and Capability

Why after command/read contracts exist: only proven cross-module contributions may enter registry; the exact contribution set must be justified against completed command/read contracts.

Deliverables:

- registry
- module identity
- capability checks
- startup manifest
- core module registration
- registry summary
- explicit proof for every retained contribution kind
- no default Core technique-definition contribution and no retired test-technique registration

### K1-5: Errors, Reports, Migration Shell

Why before final integration: all failure paths need stable codes, diagnostics, reports, and privacy boundaries.

Deliverables:

- `KernelError`
- operation-level `KernelError` integrated with the existing K1-1 Diagnostic contract
- `KernelReport`
- `ValidationReport`
- `MigrationReport`
- abstract import/export report shells
- migration entry without physical IO

### K1-6: Integration Gate

Why last: verifies the whole kernel behaves as one system.

Deliverables:

- general 4-measure score fixture across model, command, snapshot, approved registry, and report paths
- separately reviewed GuitarExtension fixture only if Guitar Domain is complete
- unsupported boundary tests
- no forbidden dependency checks
- full `npm run typecheck`
- full `npm test`

## Compatibility and Migration

K1 should introduce the first semantic schema version for `score.json`. It should be treated as a compatibility contract even before physical `.bgp` IO exists.

Migration V1 can be thin:

- current version pass-through
- future version safe failure
- old version hook shape
- `MigrationReport` output

Unknown score/part ExtensionBlock JsonValue preservation is a K1-1 compatibility requirement and must survive every later K1 path. Core does not interpret unknown payload semantics and does not promise physical resource or byte-level preservation.

## Rollback Strategy

Each large feature must be independently revertible:

- K1-1 rollback: remove newly added domain/validation files and tests; boundary metadata remains.
- K1-2 rollback: remove command/history files and command tests; domain model remains.
- K1-3 rollback: remove read/event files and tests; command model remains.
- K1-4 rollback: remove registry/capability files and tests; domain/command/read remain.
- K1-5 rollback: remove report/migration shell files and tests; diagnostics used by validation may need fallback to the last stable error shape.

No implementation chunk should change unrelated future UI, renderer, playback, persistence, or export files.

## Current Review Gate

- K1-1 child code and documentation are in review; no further implementation chunk starts now.
- K1-2 through K1-5 each require a new or refreshed task/spec review against `brilliant-score-1`.
- Guitar Domain Block 2 is independent from Core K1-2 and must define its Part-owned extension before guitar commands or technique semantics are implemented.
- Before any later implementation, load `trellis-before-dev`, re-read the relevant active specs, and confirm the task is approved; archived drafts are never execution sources.
