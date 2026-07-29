# GD-0 Downstream Implementation Plan

> **Status:** USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING
> **Planning base:** `064dc2bffe26022bc58f0690986b09a0c6a257aa`
> **Current authorization:** Stage 0 documentation-contract closure only
> **Rule:** each stage below is a separate Trellis task and independent acceptance gate

## 1. Purpose

Translate the user-approved GD-0 plan candidate into a safe execution sequence. This file does not authorize production implementation and deliberately avoids one broad “Guitar Domain” task. Core V1.1 mechanisms, Guitar data semantics, Guitar commands, and integration qualification remain independently reviewable.

## 2. Fixed Ordering

```text
GD-0 independent documentation acceptance
  -> CK1.1-0 hostile-input guard prerequisite
  -> CK1.1-1 official module-SDK contract foundation
  -> GD-1 GuitarExtension foundation
  -> GD-2 Core V1.1 domain-command seam
  -> GD-3 Guitar semantic commands
  -> GD-4 Guitar/Core integration gate
  -> stop review before Editor/Layout/Renderer
```

Dependencies are contractual, not implied by parent/child placement:

- CK1.1-1 begins after CK1.1-0 and establishes the approved module issue/error/descriptor authoring surface without a command runtime.
- GD-1 begins after CK1.1-1 because its strict codecs/guards and derived domain errors require the hardened Core and official module SDK.
- GD-2 may consume the GD-0 contracts only after independent documentation acceptance and may use a synthetic test contribution; it must not import GD-1 production code.
- GD-3 requires accepted GD-1 and GD-2 baselines.
- GD-4 requires accepted GD-3 and reruns all relevant Core gates.

## 3. Stage 0 — Prepare the GD-0 Documentation Review Candidate

### Deliverables

- Final convergence pass over `prd.md`, `design.md`, and `implement.md`.
- Independent review of D001-D005 and technical derivations.
- Sync the user-approved plan candidate into the active product documents without changing production source:
  - product `design.md` and `implement.md`;
  - `SPEC-003-command-system.md`;
  - `SPEC-005-guitar-techniques.md`;
  - `SPEC-009-extension-api.md`;
  - `SPEC-014-kernel-snapshot-events.md`;
  - `SPEC-015-kernel-registry-capability.md`;
  - `SPEC-016-kernel-errors-diagnostics-reports.md`;
  - `technical/microkernel-architecture.md` and `technical/modular-plugin-architecture.md`.
- Add an active Core V1.1 domain-integration specification or an explicitly linked additive section under `.trellis/spec/core-kernel/backend/`.
- Synchronize `pure-kernel-boundary.md` so K1-1 through K1-6 remain the closed Core-only baseline and GD-0 is explicitly additive.
- Fix exact schema-version compatibility, write/validation availability facts, and the minimum integrated factory/bus/gateway/replay signatures for independent review.
- Stop at a clean documentation review candidate. Accepted-baseline recording, archive, and downstream activation require a later explicit independent `ACCEPT` governance action.

### Gate

```powershell
python .trellis/scripts/task.py validate 07-28-gd-0-guitar-domain-core-transaction-contract
git diff --check
```

No `src/**`, `test/**`, package, build, or physical format file belongs to Stage 0.

## 4. Stage 1 — CK1.1-0 Hostile-Input Guard Prerequisite

### Scope

- Specify and implement descriptor-first, no-getter, no-throw behavior for public `unknown` guards, including `isJsonValue`, `isWrittenPitch`, and `isTransposition`.
- Centralize reusable exact-data descriptor helpers without exporting mutable/internal codecs.
- Preserve valid plain-object behavior and current domain types.
- Reject accessors, hostile Proxies, cycles, invalid prototypes, sparse arrays, oversized sparse length tricks, and post-call mutation attempts safely.

### Likely files

- `src/core-kernel/domain/extensions.ts`
- `src/core-kernel/domain/pitch.ts`
- a narrow internal strict-data helper if duplication warrants it
- focused hostile-input tests
- active Core boundary/quality specification

### Acceptance

- Every public `unknown` guard returns a boolean and throws zero raw exceptions for the hostile matrix.
- Getter/Proxy trap counters remain zero for inputs the descriptor-first contract rejects before value access.
- Core V1 public exports remain unchanged unless the approved spec explicitly adds type-only contracts.
- Full Core suite remains green.

### Rollback

The change is isolated to guards/helpers/tests. Revert the candidate if valid plain objects or Core codec behavior drift.

## 5. Stage 2 — CK1.1-1 Official Module-SDK Contract Foundation

### Scope

- Add a separate versioned official-module authoring entry point; keep the application-facing Core root data-only.
- Define namespace-qualified module issue data, source/location/details allowlists, deterministic severity/message-key derivation, and the narrow `ModuleKernelErrorBase` needed for official domain subclasses.
- Define immutable contribution descriptor, compatibility requirement, read-only validation/profile context, and restricted effect-request data contracts required by GD-0.
- Provide builders that clone, validate, and deeply freeze descriptors/issues without exposing compiled handlers, active state, history, or mutable documents.
- Update public-boundary and forbidden-dependency tests so application consumers and official module authors have distinct reviewed surfaces.

### Explicitly deferred

- Compiled catalog/runtime assembly.
- Command dispatch, effect application, history, integrated replay, events, or read-only session behavior.
- Guitar-specific namespaces, codes, schemas, or profiles.

### Acceptance

- A test-only sample domain derives a typed error and emits a detached frozen module issue with no raw Error fields.
- Invalid namespaces/codes/message keys/source/details and hostile inputs reject deterministically.
- The application Core root still omits runtime error classes and authoring builders.
- The SDK imports no UI/platform/domain package and creates no second runtime mechanism.

### Rollback

The SDK foundation is additive and unused by Core-only runtime. Revert its entry point/spec/tests if its boundary fails independent review.

## 6. Stage 3 — GD-1 GuitarExtension Foundation

### Scope

- Create a pure TypeScript Guitar Domain package/layer with an explicit dependency on the approved Core data/official-module contracts and no UI/platform dependency.
- Define the Part-owned Guitar extension namespace and schema version.
- Define ordered variable-length tuning and noteId-to-string/fret placement.
- Provide strict codec, detached encode/decode, semantic validator, product-profile classifier, namespaced module issues, and compatibility declaration.
- Initial product profile supports standard six-string tuning and schema-valid nonnegative safe-integer frets with product limits such as 22/24.
- Provide a deterministic compatibility fixture and unknown-field/version behavior.

### Explicitly deferred

- Commands/history integration.
- Slide, bend, vibrato behavior.
- UI, rendering, playback, physical file I/O, seven-string/bass product profiles, and external format compatibility.

### Package boundary

```text
Guitar Domain -> approved Core data contracts / official module SDK
Core          -> zero Guitar Domain imports
```

### Acceptance

- Guitar payload round-trips deterministically inside one Part-owned ExtensionBlock.
- Duplicate/missing note references, owner mismatch, invalid tuning, invalid string/fret, incompatible schema, accessors/Proxies, and mutated inputs yield stable frozen module issues.
- Unknown unrelated ExtensionBlocks remain deeply equal.
- The default profile object and all nested structures are deeply frozen.
- Exact pitch/placement consistency rules are captured in the GD-1 task before implementation.

### Rollback

GD-1 adds an isolated package/spec/fixture and no Core runtime seam. Revert the package if its schema is rejected without migrating persisted product documents.

## 7. Stage 4 — GD-2 Core V1.1 Domain Command Seam

### 7.1 Public/additive contracts

- Add integrated CommandBus construction while preserving `CommandBus.create()`.
- Add catalog-bound integrated result/read/event/replay data contracts.
- Add `KernelWriteAvailability` plus unavailable/incompatible failure data with one shared priority rule: any incompatible fact selects `command.required-contribution-incompatible`; otherwise a nonempty gap list selects `command.required-contribution-unavailable`; both return the full canonical facts.
- Implement the integrated Registry entry as an instance `createGateway` overload. Retain the accepted K1-4 `summary`, all typed `select` overloads, and `subscribe` while replacing only submit/undo/redo/read result types.
- Consume and, only where the approved runtime requires it, additively extend the accepted CK1.1-1 SDK entry point for contribution descriptors, restricted effects, and `ModuleKernelErrorBase`/issue conversion; do not duplicate it inside command runtime modules.
- Keep compiled functions, effects, history entries, mutable state, and error classes out of the application-facing Core root.

### 7.2 Registry and assembly

- Add startup-frozen `kernel.domain-commands.v1` compiled registration entries.
- Validate manifest/binding identity, versions, origin/runtime/trust, capabilities, namespace ownership, duplicate IDs, handler match, profiles, and compatibility requirements atomically.
- Bind registry, integrated bus, gateway, and replay to the same internal assembly identity and reject cross-assembly pairings.
- Preserve existing `createKernelRegistry()` and Core-only registry/gateway behavior.
- Summaries expose only detached metadata.

### 7.3 Command routing

- Add descriptor-first top-level routing from hostile `unknown`.
- Dispatch Core and installed official domain commands through the same `submit(unknown)` port.
- Strictly decode through exactly one catalog definition.
- Clone/freeze accepted semantic envelopes before preparation/history.

### 7.4 Effect set and history

- Generalize the private single mutation to a private nonempty effect set.
- Keep all existing Core effects and make six Core commands one-effect transactions.
- Add the minimum Core effect request needed for `WrittenPitch` replacement.
- Add module-owned extension effect envelopes with strict effect kind/payload/namespace/owner checks.
- Derive inverse effects from current candidate state, reverse inverse ordering, and store one history entry per committed semantic command.
- Preserve no-op and redo invalidation behavior.

### 7.5 Validation and classification

- Core semantics first; every installed exactly schema-compatible domain validator afterward in frozen order.
- Build a detached contribution view from Core score read data plus only that contribution's exactly compatible blocks in canonical owner order. A contribution with zero compatible blocks receives `validate/classify = 0/0`. A contribution with one or more compatible blocks receives exactly one `validate` call in every applicable pass; only after every applicable validator succeeds and classification begins does it receive exactly one `classify` call with the same filtered view. Any semantic issue, throw, or contract violation yields classifier count `0` for the pass.
- Collect deterministic semantic issues.
- Core profile first; every domain profile afterward.
- Finish all classification before visible commit.
- Use the same order for creation, submit, undo, redo, and integrated replay; missing/incompatible validators produce explicit incomplete availability rather than a partial “valid” result.

### 7.6 Read-only degradation

- Validate finite exact `supportedSchemaVersions`, compare each known target block and compiled contribution during integrated construction, and classify absent/compatible/incompatible/future-schema cases before any handler call.
- Expose sorted frozen write and validation availability with stable unavailable/incompatible facts.
- Permit detached reads/codec preservation/checkpoint bookkeeping.
- Reject submit/undo/redo and each attempted replay command through the same availability preflight before command decoding or history checks. Mixed gaps select the incompatible code but return every unavailable and incompatible fact.
- Never expose incompatible/future blocks to decoder, validator, classifier, command, effect, or fact handlers. Initial construction/explicit validation, changed candidates, undo, redo, and replay candidate passes use the same `0/0`, `1/1`, or validation-failure `1/0` rule over the compatible filtered view. Read-only submit/undo/redo/first replay write stops at availability preflight with operation-phase validator/classifier/write counts `0/0/0`; the session remains read-only/incomplete and the excluded payload remains unchanged.
- Preserve undeclared opaque-extension Core V1 behavior.

### 7.7 Unified events

- Generalize integrated command identity without changing Core-only events.
- Accept prepared affected-address facts, validate/canonicalize/deduplicate/freeze them, and store sufficient history facts for undo/redo.
- Publish one committed event plus optional dirty event.
- Preserve event overflow atomicity and sync/async subscriber isolation.

### 7.8 Integrated replay

- Add catalog-bound semantic-command replay.
- Reuse live decode/preparation/effect/validation/classification behavior.
- Return detached final document/results/failure index.
- Exclude internal effects and undo/redo session logs from replay input.

### Likely affected Core files

- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/mutations.ts` or a replacement private effect module
- `src/core-kernel/commands/strict-codec.ts`
- `src/core-kernel/commands/replay.ts`
- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/events/contracts.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`
- `src/core-kernel/read/contracts.ts`
- `src/core-kernel/registry/contracts.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/registry/runtime.ts`
- `src/core-kernel/registry/strict-codec.ts`
- `src/core-kernel/reports/contracts.ts`
- `src/core-kernel/errors/kernel-error.ts`
- `src/core-kernel/index.ts`
- new private contribution/effect modules and runtime integration of the accepted official module-SDK entry point

The implementer must adjust this list after `trellis-before-dev`; it is an impact map, not permission for broad refactoring.

### GD-2 synthetic contribution tests

GD-2 uses a test-only neutral domain contribution rather than importing Guitar Domain. It must prove:

- two effects across Core-owned pitch and one owned extension commit once;
- one history entry, one version increment, one committed event, and correct dirty transition;
- inverse/forward round-trip for multi-effect undo/redo;
- strict routing and namespace/capability/handler mismatch rejection;
- all installed validators/classifiers run in deterministic order;
- semantic invalid rejects while unsupported commits;
- contribution/effect/validator/classifier/fact throws preserve full state;
- read-only known-missing/incompatible/future-schema behavior, explicit validation completeness, and unknown opaque-extension compatibility;
- exact supported-schema negotiation, future/incompatible schema handler suppression, incomplete validation facts, and lossless payload preservation;
- mixed unavailable+incompatible facts with identical priority/full-fact behavior for submit, undo, redo, and first replay write;
- mixed-owner/version table fixtures proving: no compatible block gives validator/classifier `0/0`; compatible blocks plus total validation success gives exactly `1/1` over the identical canonical-owner-ordered filtered view; semantic issues, throws, or contract violations give exactly `1/0`; read-only submit/undo/redo/first replay write gives operation-phase validator/classifier/write `0/0/0`; incompatible blocks reach zero handlers; and excluded payload is preserved exactly;
- live/replay deep equality;
- existing six Core commands retain exact Core-only results/events.

### Rollback

All new behavior is behind integrated construction. Removing the integrated factory/catalog/effect modules must restore the accepted Core-only source behavior with no persisted schema migration.

## 8. Stage 5 — GD-3 Guitar Semantic Commands

### Initial command scope

- set string/fret placement and atomic `WrittenPitch` synchronization;
- clear/replace placement explicitly;
- slide;
- bend;
- vibrato.

Exact command IDs, targets, payload versions, technique reference rules, bend units, slide endpoints, vibrato parameters, and no-op behavior are planned and approved inside GD-3 before implementation.

### Required invariants

- Caller supplies stable IDs; no wall-clock/random/array-index identity.
- Setting placement changes Core pitch plus GuitarExtension in one transaction/history entry.
- Generic Core pitch edit never guesses placement and rejects when installed Guitar validation detects inconsistency.
- Every command supports deterministic submit/no-op/reject/undo/redo/replay and unified event facts.
- Unknown/non-target extensions remain deeply equal.

### Rollback

Commands are additive catalog entries. Remove the Guitar command contribution while retaining GD-1 codec/preservation and GD-2 generic seam.

## 9. Stage 6 — GD-4 Guitar/Core Integration Gate

### Fixture

Use one deterministic four-measure standard-six-string Guitar document containing:

- Part-owned GuitarExtension and standard tuning;
- multiple placed notes across measures;
- at least one slide, bend, and vibrato case;
- one unknown unrelated ExtensionBlock;
- a sequence that exercises checkpoint, dirty, undo, redo, encode/decode, and replay.

### Gate matrix

- Core semantic valid / Guitar semantic valid / product supported.
- Core valid / Guitar invalid.
- Core valid / Guitar valid / Guitar profile unsupported.
- Atomic placement success and rollback failures at every pre-commit phase.
- Multi-step undo/redo and redo invalidation.
- Live versus replay document/result/version/classification equality.
- One event per transaction plus optional dirty event.
- Missing or schema-incompatible Guitar contribution opens read-only with incomplete validation facts and exact preservation; incompatible handlers are not executed.
- Unknown extension remains writable under Core V1 opaque behavior.
- Original documents, payloads, profiles, results, reads, and events are detached/frozen.
- Hostile `unknown`, mutable globals, sync throws, async handler rejection, version/event overflow, and privacy checks.

### Final validation commands

```powershell
node .trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/verify-public-contracts.mjs
npx tsc -p .trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/tsconfig.real-core.json --noEmit
npm run typecheck
npm run build
npm test
git diff --check
python .trellis/scripts/task.py validate <active-task>
```

Also rerun forbidden dependency/public export checks and the accepted K1-2 through K1-6 focused suites. Environment-only `spawn EPERM` results are rerun through the previously approved execution path without weakening assertions.

## 10. Stop Conditions

Pause the active downstream task and return to planning if implementation requires any of the following:

- a Core import from Guitar Domain;
- a second document/history/replay/dirty/event owner;
- generic public patch/JSON-path/mutable-document APIs;
- runtime contribution register/unregister/hot reload;
- whole-document history snapshots;
- a change to persisted Core schema solely to support command integration;
- UI, rendering, playback, physical file I/O, external Guitar format, third-party plugin execution, or additional Guitar techniques;
- weakening an accepted Core V1 public contract rather than adding a separately reviewed compatible surface.

## 11. Final Review Gate

Before any downstream task starts:

1. User approves final `prd.md`, `design.md`, and `implement.md`.
2. Independent reviewer checks microkernel dependency direction, Core compatibility, atomicity, deterministic failure boundaries, and data preservation.
3. Independent acceptance is recorded before GD-0 is assigned a fixed baseline or archived.
4. A separate user-authorized governance/activation action creates or activates only the next single downstream task; this documentation candidate activates none.

## 12. Stage 0 Execution Record

- [x] Existing GD-0 task activated on 2026-07-28; no duplicate task created.
- [x] `prd.md`, `design.md`, and `implement.md` converged on D001-D005 and the fixed downstream order.
- [x] Product design/implementation, command, Guitar, extension, event, Registry, report, and architecture documents synchronized.
- [x] Active Core V1.1 domain-integration specification added and linked from the Core indexes.
- [x] Documentation synchronization matrix added for independent review.
- [ ] Independent documentation/architecture review accepts the synchronized candidate.
- [ ] Accepted documentation baseline recorded and GD-0 archived.

Production implementation and downstream task activation remain outside this execution record.
