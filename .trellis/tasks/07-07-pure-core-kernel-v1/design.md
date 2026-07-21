# Pure Core Kernel V1 Technical Design

## Status

- Phase: staged execution; K1-1 through K1-5 are accepted/archived. K1-6 implementation candidate `3dffa71c44d0eacb81d391714b855799f9e5cae9` passes 8/8 focused and 169/169 full tests; independent acceptance is pending.
- Parent task: `06-29-commercial-guitar-tablature-product`.
- Implementation target: pure TypeScript Core Kernel only.
- K1-1 authority: `.trellis/tasks/archive/2026-07/07-13-k1-1-foundation-replanning/design.md` and `.trellis/spec/core-kernel/backend/score-document-model.md`.
- K1-2 authority: `.trellis/tasks/archive/2026-07/07-15-k1-2-commands-transactions-history/design.md` and `.trellis/spec/core-kernel/backend/command-transaction.md`.
- K1-3 authority: `.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`, accepted at `7369eeac60fecea66c2c9164c04439625c2d78b0`.
- K1-4 authority: `.trellis/tasks/archive/2026-07/07-16-k1-4-registry-capability-startup-registration/` and `.trellis/spec/core-kernel/backend/registry-capability.md`.
- K1-5 authority: `.trellis/tasks/archive/2026-07/07-19-k1-5-errors-diagnostics-reports-migration/` and `.trellis/spec/core-kernel/backend/errors-reports.md`; implementation baseline `51fa2177cbd25dea53f1ebaf23bd8b8426471589` was independently accepted at documentation baseline `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` with 161/161 tests passing. K1-6 candidate authority is `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/` and `.trellis/spec/core-kernel/backend/integration-gate.md`; it is not yet accepted.

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
K1-2 CommandEnvelope
  -> command id lookup
  -> payload validation
  -> target/precondition validation
  -> isolated draft
  -> internal typed mutation
  -> hard validation
  -> commit
  -> history entry
```

Failure at any K1-2 step preserves document, version, undo stack, and redo stack. K1-3 composes accepted K1-2 transitions with private read/checkpoint/event session state; Capability checks remain K1-4 work.

### Read Flow

```text
CommandBus.read()
  -> immutable DocumentSnapshot + history depths + dirty
  -> pure selector
  -> caller-derived layout/playback/export/cache data
```

No caller may receive a mutable `ScoreDocument`.

### Registration Flow

```text
KernelStartupModuleManifest
  -> strict decode + compiled binding lookup
  -> isolated candidate validation
  -> frozen ready KernelRegistry or stable failure
  -> capability-scoped gateway
  -> existing CommandBus / selector / read / subscribe
```

K1-4 accepts only manifest-bound official, system-trusted `builtin/internal-module` registrations. It binds exactly six command and six selector adapters; runtime plugin changes and arbitrary handlers are unsupported.

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

- strict `submit(unknown)` envelope/payload decoder with stable entity IDs and Voice anchors
- a closed static catalog containing exactly the six approved general-score commands
- internal typed forward/inverse mutations with isolated candidate commit/rollback
- documentVersion plus fine-grained history and atomic undo/redo
- deterministic command replay through the live submit path
- runtime-deep-frozen default ScoreFeatureProfile and bounded hostile sparse-array rejection
- unknown ExtensionBlock and caller-ownership preservation across every command/history/replay path
- no address/range, dirty/events, Registry/Capability, Guitar command, UI, or IO API

### K1-3: Snapshot, Selectors, Events

Why after commands: snapshots and events need document version and transaction boundaries.

Deliverables:

- seven stable addresses and three hierarchical range variants
- deeply immutable versioned snapshots and six built-in pure selectors
- exact asynchronous persisted checkpoint and dirty identity
- two event envelopes with private publishing through `CommandBus.subscribe()`
- event handler failure isolation, reentrancy guard, and atomic sequence overflow rejection

### K1-4: Registry and Capability

Why after command/read contracts exist: K1-4 authorizes and delegates to proven K1-2/K1-3 behavior instead of inventing a second execution path.

Deliverables:

- atomic startup-only frozen Registry
- independent module identity dimensions and seven non-implying capabilities
- exactly `command | selector` contributions for the existing six commands and six selectors
- capability-scoped gateway with trusted-host parity
- deterministic, detached, minimal Registry summary
- closed K1-4 startup/access failures and total exception boundaries
- no Registry version/event, history/event attribution, third-party runtime, technique, validator, migration, format, template, Guitar, or K1-5 report contribution

### K1-5: Errors, Reports, Migration Shell

Why before final integration: all failure paths need stable codes, diagnostics, reports, and privacy boundaries.

Deliverables:

- internal sealed error families with public data-only `KernelIssue` projections
- additive adapters for K1-1 diagnostics and K1-2/K1-3/K1-4 failure unions, explicitly including K1-2 CommandBus creation/replay failures
- derived deeply frozen `KernelReport<"validation" | "migration">`
- `createKernelValidationReport` without changing K1-1 `ValidationReport`
- current `brilliant-score-1` `not-required | rejected` migration entry without physical IO or session effects
- empty private migration step catalog; no dynamic registration, fictional schema, IDs/time, global issue bus, or import/export/recovery aliases

### K1-6: Integration Gate

Why last: verifies the whole kernel behaves as one system.

Deliverables:

- general four-measure score fixture across codec, validation/profile, migration, command/history, snapshot/selectors, events, approved Registry/gateway, replay, and report paths
- Guitar Domain excluded because no independently accepted prerequisite exists
- representative atomic failure, capability, unsupported, extension-preservation, and privacy tests
- unchanged public export and forbidden dependency gates
- full `npm run typecheck`, `npm run build`, and 169/169 `npm test`

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

- K1-1 is the accepted frozen foundation at `30894e2`.
- K1-2 passed focused P1 repair and independent re-acceptance and is archived under `.trellis/tasks/archive/2026-07/07-15-k1-2-commands-transactions-history/`.
- K1-3 passed independent acceptance at `7369eeac60fecea66c2c9164c04439625c2d78b0`, is archived, and has 102/102 passing tests.
- K1-4 passed independent acceptance at `94766a0930c05e5339c44f667deaf02116af1c0c` and is archived. K1-5 was independently accepted at `ed801a9fa1a69222188c3ca04ee243b48d7a92d2`. K1-6 candidate `3dffa71c44d0eacb81d391714b855799f9e5cae9` passes 8/8 focused and 169/169 full tests and awaits independent acceptance; Pure Core Kernel V1 is not yet formally closed.
- Guitar Domain Block 2 is independent from Core K1-2 and must define its Part-owned extension before guitar commands or technique semantics are implemented.
- Before any later implementation, load `trellis-before-dev`, re-read the relevant active specs, and confirm the task is approved; archived drafts are never execution sources.
