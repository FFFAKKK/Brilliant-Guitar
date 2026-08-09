# GD-0 Downstream Implementation Plan

> **Status:** ACCEPTED DOCUMENTATION / ARCHITECTURE CONTRACT
> **Planning base:** `064dc2bffe26022bc58f0690986b09a0c6a257aa`
> **Current authorization:** archive GD-0; the next possible action is separately approved CVN-2 planning only
> **Rule:** each production gate named below has its own Trellis task and independent acceptance; satisfied, historical and deferred sections do not activate work

## 1. Purpose

Translate the user-approved GD-0 plan candidate into a safe execution sequence. This file does not authorize production implementation and deliberately avoids one broad “Guitar Domain” task. Core V1.1 mechanisms, Guitar data semantics, Guitar commands, and integration qualification remain independently reviewable.

## 2. Current Dependency Graph and Legacy-Label Ownership

```text
accepted: CVN-0 -> CVN-1 -> CVN-3 -> CVN-4
accepted: Core VNext extensibility reservation gate
current:  GD-0 independent documentation acceptance
             -> separately approved CVN-2 planning and acceptance
             -> separately approved CVN-6 planning and acceptance
CVN-2 + CVN-3 + CVN-4 + CVN-6
             -> separately approved CVN-5 planning and acceptance
CVN-0 .. CVN-6
             -> CVN-7 Core VNext qualification
CVN-7 accepted
             -> replan Guitar-owned GD-1 -> GD-3 -> GD-4
```

Dependencies are contractual, not implied by parent/child placement:

- The former CK1.1-0 label is satisfied by accepted CVN-0; no duplicate guard task is created.
- The former CK1.1-1 authoring contract is owned by CVN-2. CVN-2 also compiles the detached frozen catalog, but exposes no writable integrated bus/gateway/replay Session.
- The former generic GD-2 responsibility is split without overlap: accepted CVN-1 owns the behavior-preserving private spine; CVN-2 owns SDK/catalog assembly; CVN-6 owns writable integration, validation, compatibility, diagnostics, migration and replay; CVN-5 owns bounded cross-module batch.
- CVN-2 starts only after GD-0 acceptance and separate user approval. CVN-6 starts only after CVN-2 acceptance. CVN-5 additionally waits for accepted CVN-3 and CVN-4. CVN-7 waits for CVN-0 through CVN-6.
- GD-1, GD-3 and GD-4 remain Guitar-owned work packages and resume planning only after CVN-7. Their future tasks consume the accepted generic Core seam; they do not rebuild it or import Guitar code into Core.

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

## 4. Satisfied Prerequisite — CVN-0 Public Unknown-Guard Consistency

**Lifecycle:** accepted and archived. This section preserves the GD-0 requirement trace; it authorizes no new guard task.

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

## 5. Next Generic Gate — CVN-2 Official Module SDK and Frozen Contribution Assembly

**Entry:** GD-0 independently accepted; CVN-1 and the extensibility reservation gate accepted; separate CVN-2 planning approval recorded.

### Scope

- Add a separate versioned official-module authoring entry point; keep the application-facing Core root data-only.
- Define namespace-qualified module issue data, source/location/details allowlists, deterministic severity/message-key derivation, and the narrow `ModuleKernelErrorBase` needed for official domain subclasses.
- Define immutable contribution descriptor, compatibility requirement, read-only validation/profile context, and restricted effect-request data contracts required by GD-0.
- Provide builders that clone, validate, and deeply freeze descriptors/issues without exposing compiled handlers, active state, history, or mutable documents.
- Compile descriptor/binding pairs into one all-or-nothing detached, deeply frozen catalog with a private assembly identity and data-only public summary.
- Enforce the Core VNext fixed startup limits and exact-boundary/boundary+1 fixtures for modules, contributions, commands, effects, namespaces, and supported schema versions.
- Update public-boundary and forbidden-dependency tests so application consumers and official module authors have distinct reviewed surfaces.

### Explicitly deferred

- Writable integrated construction, command dispatch, effect application, history, integrated replay, events, validation/migration runtime, or read-only Session behavior; those belong to CVN-6.
- Cross-module batch execution; it belongs to CVN-5 after CVN-6.
- Guitar-specific namespaces, codes, schemas, or profiles.

### Acceptance

- A test-only sample domain derives a typed error and emits a detached frozen module issue with no raw Error fields.
- Invalid namespaces/codes/message keys/source/details and hostile inputs reject deterministically.
- The application Core root still omits runtime error classes and authoring builders.
- The SDK imports no UI/platform/domain package and creates no second runtime mechanism.
- Two neutral synthetic official modules prove deterministic catalog order, descriptor/binding parity, namespace/capability isolation, exact resource caps, deep freeze, private assembly identity, and all-or-nothing construction.
- No ready catalog exposes register/unregister/replace, mutable handlers, a writable Session, or a second state/history owner.

### Rollback

The SDK/catalog foundation is additive and unused by the Core-only runtime. Revert its entry point, compiler, specs and tests if its boundary fails independent review; no persisted document migration is involved.

## 6. Deferred Guitar Gate — GD-1 GuitarExtension Foundation

**Entry:** CVN-7 accepted and archived; a fresh Guitar roadmap review confirms the schema/profile scope; separate GD-1 planning and execution approvals are recorded. The contract below remains a future work-package definition, not an active task.

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

## 7. Generic Seam Delivery — Accepted CVN-1 plus CVN-2/CVN-6/CVN-5

The old GD-2 label is a requirement source, not a task that will be recreated. Ownership is exhaustive and non-overlapping:

| Contract slice | Core VNext owner | Lifecycle |
|---|---|---|
| behavior-preserving command/transaction/Registry spine and private nonempty effect-set foundation | CVN-1 | accepted and archived |
| official-module authoring SDK, descriptor/binding validation, frozen catalog and private Assembly identity | CVN-2 | next separately approved gate after GD-0 |
| integrated factory/bus/gateway/replay binding, module effects, validation/classification, availability, diagnostics, migration and unified events | CVN-6 | waits for accepted CVN-2 |
| bounded Core/module atomic batch through the same submit/history/event owner | CVN-5 | waits for accepted CVN-2/CVN-3/CVN-4/CVN-6 |

### 7.1 Public/additive contracts — CVN-2 types and CVN-6 runtime binding

- Add integrated CommandBus construction while preserving `CommandBus.create()`.
- Add catalog-bound integrated result/read/event/replay data contracts.
- Add `KernelWriteAvailability` plus unavailable/incompatible failure data with one shared priority rule: any incompatible fact selects `command.required-contribution-incompatible`; otherwise a nonempty gap list selects `command.required-contribution-unavailable`; both return the full canonical facts.
- Implement the integrated Registry entry as an instance `createGateway` overload. Retain the accepted K1-4 `summary`, all typed `select` overloads, and `subscribe` while replacing only submit/undo/redo/read result types.
- Consume and, only where the approved runtime requires it, additively extend the accepted CVN-2 SDK entry point for contribution descriptors, restricted effects, and `ModuleKernelErrorBase`/issue conversion; do not duplicate it inside command runtime modules.
- Keep compiled functions, effects, history entries, mutable state, and error classes out of the application-facing Core root.

### 7.2 Registry and assembly — CVN-2 compilation, CVN-6 same-Assembly binding

- Add startup-frozen `kernel.domain-commands.v1` compiled registration entries.
- Validate manifest/binding identity, versions, origin/runtime/trust, capabilities, namespace ownership, duplicate IDs, handler match, profiles, and compatibility requirements atomically.
- Bind registry, integrated bus, gateway, and replay to the same internal assembly identity and reject cross-assembly pairings.
- Preserve existing `createKernelRegistry()` and Core-only registry/gateway behavior.
- Summaries expose only detached metadata.

### 7.3 Command routing — CVN-6 over the accepted CVN-1 spine

- Add descriptor-first top-level routing from hostile `unknown`.
- Dispatch Core and installed official domain commands through the same `submit(unknown)` port.
- Strictly decode through exactly one catalog definition.
- Clone/freeze accepted semantic envelopes before preparation/history.

### 7.4 Effect set and history — CVN-1 foundation, CVN-6 integration, CVN-5 batch

- Reuse the accepted CVN-1 private nonempty effect-set foundation; do not create a parallel mutation engine.
- Keep all existing Core effects and make six Core commands one-effect transactions.
- Add the minimum Core effect request needed for `WrittenPitch` replacement.
- Add module-owned extension effect envelopes with strict effect kind/payload/namespace/owner checks.
- Derive inverse effects from current candidate state, reverse inverse ordering, and store one history entry per committed semantic command.
- Preserve no-op and redo invalidation behavior.

### 7.5 Validation and classification — CVN-6

- Core semantics first; every installed exactly schema-compatible domain validator afterward in frozen order.
- Build a detached contribution view from Core score read data plus only that contribution's exactly compatible blocks in canonical owner order. A contribution with zero compatible blocks receives `validate/classify = 0/0`. A contribution with one or more compatible blocks receives exactly one `validate` call in every applicable pass; only after every applicable validator succeeds and classification begins does it receive exactly one `classify` call with the same filtered view. Any semantic issue, throw, or contract violation yields classifier count `0` for the pass.
- Collect deterministic semantic issues.
- Core profile first; every domain profile afterward.
- Finish all classification before visible commit.
- Use the same order for creation, submit, undo, redo, and integrated replay; missing/incompatible validators produce explicit incomplete availability rather than a partial “valid” result.

### 7.6 Read-only degradation — CVN-6

- Validate finite exact `supportedSchemaVersions`, compare each known target block and compiled contribution during integrated construction, and classify absent/compatible/incompatible/future-schema cases before any handler call.
- Expose sorted frozen write and validation availability with stable unavailable/incompatible facts.
- Permit detached reads/codec preservation/checkpoint bookkeeping.
- Reject submit/undo/redo and each attempted replay command through the same availability preflight before command decoding or history checks. Mixed gaps select the incompatible code but return every unavailable and incompatible fact.
- Never expose incompatible/future blocks to decoder, validator, classifier, command, effect, or fact handlers. Initial construction/explicit validation, changed candidates, undo, redo, and replay candidate passes use the same `0/0`, `1/1`, or validation-failure `1/0` rule over the compatible filtered view. Read-only submit/undo/redo/first replay write stops at availability preflight with operation-phase validator/classifier/write counts `0/0/0`; the session remains read-only/incomplete and the excluded payload remains unchanged.
- Preserve undeclared opaque-extension Core V1 behavior.

### 7.7 Unified events — CVN-6

- Generalize integrated command identity without changing Core-only events.
- Accept prepared affected-address facts, validate/canonicalize/deduplicate/freeze them, and store sufficient history facts for undo/redo.
- Publish one committed event plus optional dirty event.
- Preserve event overflow atomicity and sync/async subscriber isolation.

### 7.8 Integrated replay — CVN-6

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

The CVN-6 planner must reconcile this historical impact map against the then-current accepted source after `trellis-before-dev`; it is not permission for broad refactoring or for CVN-2 to expose a writable Session.

### CVN-6 synthetic contribution tests

CVN-6 uses test-only neutral domain contributions rather than importing Guitar Domain. It must prove:

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

All writable integrated behavior is behind CVN-6 construction. Removing the integrated factory/binding/effect modules must restore the accepted Core-only source behavior while leaving the separately accepted CVN-2 SDK/catalog contracts inert; no persisted schema migration may be required.

## 8. Core Completion Gate — CVN-7 Compatibility, Reliability and Scale

**Entry:** CVN-0 through CVN-6 independently accepted and archived.

CVN-7 is the required stop-and-review boundary before Guitar implementation resumes. It must rerun Core V1 characterization, every Core VNext command and module-integration matrix, public export/forbidden-dependency checks, persisted-schema and unknown-extension preservation, representative/stress resource gates, and the GD-0 Layer A/Layer B contract checks against the final Core root. It accepts one product-ready Core VNext baseline or returns the owning failed capability to its child gate; it does not add new commands or module capabilities.

## 9. Deferred Guitar Gate — GD-3 Guitar Semantic Commands

**Entry:** CVN-7 accepted; GD-1 accepted; the future Guitar command task has separately approved exact IDs, payloads, technique units and limits.

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

Commands are additive catalog entries. Remove the Guitar command contribution while retaining GD-1 codec/preservation and the accepted CVN-2/CVN-6 generic seam.

## 10. Deferred Guitar Gate — GD-4 Guitar/Core Integration Gate

**Entry:** CVN-7, GD-1 and GD-3 accepted and archived; the exact Guitar fixture/profile/schema versions are frozen by the future GD-4 task.

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

## 11. Stop Conditions

Pause the active downstream task and return to planning if implementation requires any of the following:

- a Core import from Guitar Domain;
- a second document/history/replay/dirty/event owner;
- generic public patch/JSON-path/mutable-document APIs;
- runtime contribution register/unregister/hot reload;
- whole-document history snapshots;
- a change to persisted Core schema solely to support command integration;
- UI, rendering, playback, physical file I/O, external Guitar format, third-party plugin execution, or additional Guitar techniques;
- weakening an accepted Core V1 public contract rather than adding a separately reviewed compatible surface.

## 12. Final Review Gate

Before any downstream task starts:

1. User approves final `prd.md`, `design.md`, and `implement.md`.
2. Independent reviewer checks microkernel dependency direction, Core compatibility, atomicity, deterministic failure boundaries, and data preservation.
3. Independent acceptance is recorded before GD-0 is assigned a fixed baseline or archived.
4. A separate user-authorized governance/activation action may create only CVN-2 as the next dependency-satisfied task. CVN-5/CVN-6/CVN-7 and all Guitar tasks remain inactive until their explicit dependencies and approvals are satisfied.

## 13. Stage 0 Execution Record

- [x] Existing GD-0 task activated on 2026-07-28; no duplicate task created.
- [x] `prd.md`, `design.md`, and `implement.md` converged on D001-D005 and the fixed downstream order.
- [x] Product design/implementation, command, Guitar, extension, event, Registry, report, and architecture documents synchronized.
- [x] Active Core V1.1 domain-integration specification added and linked from the Core indexes.
- [x] Documentation synchronization matrix added for independent review.
- [x] Core VNext legacy ownership mapping synchronized without changing any GD-0 public-contract fence or creating a duplicate CK1.1/GD-2 task.
- [x] Independent documentation/architecture review accepts reconciled candidate `451627e` with final P0/P1/P2=`0/0/0`.
- [x] Accepted documentation baseline recorded; GD-0 archive follows this acceptance commit.

Production implementation and downstream task activation remain outside this execution record.
