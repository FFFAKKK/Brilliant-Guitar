# CVN-1 Command / Transaction / Registry Spine Design

## 1. Status and Design Authority

- Lifecycle: `CVN-1 ACCEPTED 2026-08-04 / ARCHIVE PENDING`.
- Parent observable authority: CVN-FC-010, CVN-FC-011 and CVN-FC-040.
- Compatibility baseline: clean CVN-0-derived HEAD `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5`.
- This design fixes private organization for CVN-1. It does not add public behavior and does not import unaccepted GD-0 contracts.
- A private symbol may vary only when the implementation records the mapping and proves the same field meaning, ordering, ownership and characterization trace.

## 2. Design Objective

Replace the current hard-wired path:

```text
raw unknown
  -> one Core-only decoder switch
  -> one Core-only prepare switch producing forward + inverse mutation
  -> one-mutation candidate clone/apply
  -> Core semantic + Core profile
  -> Core-only HistoryEntry
  -> session read/event integration
```

with one package-private, assembly-bound path:

```text
raw unknown
  -> strict outer route using frozen assembly
  -> exactly one command definition decoder
  -> exactly one command definition prepare handler
  -> ordered nonempty forward effects
  -> clone candidate once
  -> derive inverse from evolving candidate + apply forward in order
  -> Core semantic pipeline -> Core classification pipeline
  -> one private history entry
  -> read/event candidate -> one atomic adoption
  -> isolated subscriber dispatch

replay --------------------------^ uses the same assembly and submit transition
undo/redo -> stored effect sets -^ enters validation/classification before adoption
```

The public Core-only factory always binds the private default assembly. CVN-1 exposes no assembly parameter or integrated factory.

## 3. Frozen and Refactorable Zones

### 3.1 Frozen public/persisted zone

The following remain byte-for-byte or deeply behaviorally compatible:

- `brilliant-score-1` types and encoded JSON behavior;
- six `CoreCommandEnvelope` members and all public command result/failure members;
- `CommandBus` public methods and construction token behavior;
- `replayCoreCommands()` signature, stop rule and detached output;
- snapshot, selector, checkpoint, dirty and public event contracts;
- default Registry manifest, public Registry/Gateway classes, summaries and failures;
- K1-5 Issue/Report and current-schema migration behavior;
- `src/core-kernel/index.ts` runtime export allowlist.

### 3.2 Compatibility-adapter zone

These existing mechanisms remain callable through adapters while the new spine is introduced:

- six command payload decoders in `commands/strict-codec.ts`;
- six target/no-op/effect preparation cases currently in `commands/mutations.ts`;
- Core semantic validator and feature classifier;
- Registry built-in command/selector descriptors;
- Core-only replay binding.

### 3.3 CVN-1 private refactor zone

- accepted-command representation;
- command definition and frozen lookup catalog;
- nonempty effect set, effect application and inverse derivation;
- private history entry and committed operation facts;
- generic transaction coordinator;
- validation/classification pipeline representation;
- event affected-address input;
- internal Registry construction/validation/state/gateway file boundaries.

## 4. Required File Layout

The operator uses the following layout unless a blocking TypeScript dependency cycle is demonstrated in `research/implementation-findings.md` and returned for planner review.

| File | Final responsibility |
|---|---|
| `src/core-kernel/commands/catalog.ts` | Existing six public-contract identities/target kinds; no handler state and no root export |
| `src/core-kernel/commands/strict-codec.ts` | Descriptor-first outer-envelope and six payload decoders; preserves accepted failure priority |
| `src/core-kernel/commands/execution-assembly.ts` | Private accepted-command, command-definition, pipeline and frozen assembly types/construction |
| `src/core-kernel/commands/core-command-adapters.ts` | Six default Core definitions: source identity, decoder binding, target/no-op preparation and affected addresses |
| `src/core-kernel/commands/effects.ts` | Five V1 effect kinds, nonempty sets, candidate clone, sequential apply and inverse derivation |
| `src/core-kernel/commands/runtime.ts` | Assembly-bound create/submit/undo/redo coordinator and private runtime/history state |
| `src/core-kernel/commands/command-bus.ts` | Public class facade, default assembly binding, session ownership and subscriber isolation |
| `src/core-kernel/commands/replay.ts` | Public replay facade over the same default assembly/runtime submit transition |
| `src/core-kernel/session/runtime.ts` | Read/checkpoint/event candidate integration and atomic adoption boundary |
| `src/core-kernel/events/runtime.ts` | Build public events from canonical committed-operation facts |
| `src/core-kernel/events/facts.ts` | Core adapter helpers for canonical affected-address construction, if still needed; no switch in generic event publication |
| `src/core-kernel/registry/strict-codec.ts` | Existing strict manifest and selector-request decoding |
| `src/core-kernel/registry/assembly.ts` | Normalized modules, compiled contribution validation, sorting, candidate state and summary construction |
| `src/core-kernel/registry/gateway.ts` | Registry/Gateway classes, private WeakMap state, authorization and delegation |
| `src/core-kernel/registry/runtime.ts` | `createKernelRegistry()`, package-private candidate seam and construction orchestration; re-export accepted public classes/types as needed |
| `src/core-kernel/registry/builtins.ts` | Frozen two-entry Core compiled table; command contributions reference the default Core definitions |

`commands/mutations.ts` is a migration-only compatibility path. It is removed after all five effects and six adapters use `effects.ts`, or reduced to type-preserving re-exports only when a concrete internal consumer remains. The final candidate has one executable effect application path.

## 5. Private Execution Contracts

The following shapes fix semantics. Exact private type names may differ only under the mapping rule in section 1.

```typescript
interface PrivateCommandSource {
  readonly moduleId: string;
  readonly contributionId: string;
}

interface PrivateAcceptedCommand<Envelope = unknown> {
  readonly commandVersion: 1;
  readonly commandId: string;
  readonly source: PrivateCommandSource;
  readonly envelope: Envelope; // already detached, decoded and deeply frozen
}

type PrivatePrepareResult =
  | { readonly status: "no-op" }
  | {
      readonly status: "changed";
      readonly effects: PrivateNonEmptyEffectSet;
      readonly affected: readonly ScoreAddress[];
    };

type PrivateNonEmptyEffectSet = readonly [
  PrivateKernelEffect,
  ...PrivateKernelEffect[],
];

interface PrivateHistoryEntry {
  readonly sequence: number;
  readonly command: PrivateAcceptedCommand;
  readonly forward: PrivateNonEmptyEffectSet;
  readonly inverse: PrivateNonEmptyEffectSet;
  readonly affected: readonly ScoreAddress[];
}

interface PrivateCommittedOperation {
  readonly cause: "submit" | "undo" | "redo";
  readonly commandId: string;
  readonly affected: readonly ScoreAddress[];
}
```

For the default Core assembly every accepted command uses:

```typescript
{
  moduleId: "core.commands",
  contributionId: "core.commands.v1",
}
```

This identity remains private. It is not added to the V1 envelope, result, event, history selector, Registry summary or replay output.

## 6. Command Definition and Assembly Contract

```typescript
interface PrivateCommandDefinition<Envelope = unknown> {
  readonly commandId: string;
  readonly commandVersion: 1;
  readonly targetKind: ScoreEntityTarget["kind"];
  readonly source: PrivateCommandSource;
  decode(
    outer: PrivateRoutedEnvelope,
  ): PrivateDecodeResult<PrivateAcceptedCommand<Envelope>>;
  prepare(
    document: ScoreDocument,
    accepted: PrivateAcceptedCommand<Envelope>,
  ): PrivatePrepareResult | PrivatePrepareFailure;
}

interface PrivateExecutionAssembly {
  readonly definitions: readonly PrivateCommandDefinition[];
  readonly semanticValidators: readonly [typeof validateScoreDocumentSemantics];
  readonly classifiers: readonly [typeof validateScoreFeatureProfile];
}
```

Assembly construction rules:

1. Input definitions are statically imported, not decoded from public data.
2. Copy definitions into a new array and validate commandId, version, target kind and uniqueness.
3. Preserve the existing six-command catalog order; build a private frozen null-prototype lookup keyed by commandId.
4. Freeze definition objects, definition array, pipeline arrays, lookup and assembly root.
5. No array, lookup, builder or function-binding table escapes through a public value.
6. The Core-only assembly is constructed once and reused by `CommandBus.create()`, replay and Registry built-ins.

`Object.freeze(new Map())` alone is insufficient because Map mutators remain operational. The implementation uses a frozen null-prototype record or a closure-owned Map whose mutable handle is never returned. The chosen representation is documented in the implementation evidence.

## 7. Strict Route and Decode Pipeline

The generic outer router preserves the existing order exactly:

1. Verify a plain record with exactly enumerable own data fields `commandVersion`, `commandId`, `target`, `payload`.
2. Validate `commandVersion` is a safe integer; malformed values yield `command.invalid-envelope`.
3. Validate version equals `1`; other safe integers yield `command.unsupported-version`.
4. Validate commandId is a string.
5. Look up one definition; absence yields `command.unknown-id`.
6. Inspect target `kind` descriptor without invoking getters.
7. Compare target kind to the definition; mismatch yields `command.target-mismatch`.
8. Decode the exact stable-ID target record.
9. Invoke exactly that definition's payload decoder.
10. Build a detached, deeply frozen accepted command.

Proxy meta-operation exceptions, accessor descriptors, symbol keys, sparse arrays, poisoned array methods and malformed nested unions yield the same V1 failure as before. CVN-1 adds no VNext depth/property rejection to these six decoders.

Registry gateway ordering remains:

1. validate gateway private state;
2. require method-level `command:execute`;
3. inspect/decode with the same default definition catalog;
4. if decoding succeeds, require the matching compiled contribution and its capabilities;
5. delegate to the same `CommandBus` public behavior;
6. if decoding fails, delegate raw input so the accepted `CommandFailure` remains authoritative.

CVN-1 does not introduce an externally reachable submit-accepted method. Avoiding a second decode is deferred unless a private token-bound bridge proves identical hostile-input behavior in the baseline trace.

## 8. Core Adapter Preparation

Each definition performs only target/anchor resolution, no-op comparison, forward-effect construction and affected-address construction.

| Command | Forward effect | Affected order |
|---|---|---|
| set metadata | `replace-metadata(documentId, value)` | document target |
| set WrittenPitch | `replace-written-pitch(noteId, value)` | note target |
| set NoteValue | `replace-note-value(eventId, value)` | event target |
| insert notes event | `insert-event(voiceId, anchor, event)` | voice, event, notes in payload order |
| insert rest event | `insert-event(voiceId, anchor, event)` | voice, event |
| remove event | `remove-event(voiceId, eventId)` | event, owning voice, removed notes in source order |

Preparation does not derive inverse effects. It returns detached forward data only. Duplicate entity/anchor resolution remains reject-rather-than-first-match. Structural insert/remove commands remain always changed after valid preparation.

## 9. Effect Model and Candidate Algorithm

### 9.1 V1 effect union

```typescript
type PrivateKernelEffect =
  | { readonly kind: "replace-metadata"; readonly documentId: string; readonly value: ScoreMetadata }
  | { readonly kind: "replace-written-pitch"; readonly noteId: string; readonly value: WrittenPitch }
  | { readonly kind: "replace-note-value"; readonly eventId: string; readonly value: NoteValue }
  | { readonly kind: "insert-event"; readonly voiceId: string; readonly anchor: SequenceAnchor; readonly event: RhythmicEvent }
  | { readonly kind: "remove-event"; readonly voiceId: string; readonly eventId: string };
```

No whole-document, generic path or arbitrary function effect exists.

### 9.2 Exact application algorithm

1. Validate the tuple is nonempty before any clone or state change.
2. Clone the current document exactly once into `candidate`.
3. For `effects[0]` through `effects[n-1]`:
   1. validate the effect's exact private shape;
   2. resolve its target against the current candidate;
   3. read and detach the current value needed for inverse;
   4. construct the inverse effect;
   5. apply the forward effect directly to the candidate;
   6. append the inverse to a temporary list.
4. Reverse the temporary inverse list.
5. Deep-freeze detached forward/inverse sets before history storage.
6. Return candidate, forward and reversed inverse; any failure returns no candidate for adoption.

Reading inverse data from the evolving candidate is mandatory. Example: two replacements of the same pitch in one effect set must undo to the original pitch, not to the intermediate pitch. Reverse-order inverse storage supplies that behavior.

For CVN-1 built-ins, the nonempty tuple makes an empty changed result unreachable in typed code. A corrupt private call is rejected before adoption and maps to the existing Core-only internal/invariant failure. The future module-facing `command.contribution-contract-violation` mapping belongs to the module SDK/runtime gates.

## 10. Transaction Coordinator

### 10.1 Create

1. Clone initial document.
2. Run Core semantic validation.
3. On success create version `0`, next history sequence `1`, empty undo/redo and bind the default assembly.
4. Preserve the existing invalid-initial-document failure and diagnostics.

### 10.2 Submit

1. Route/decode through bound assembly.
2. Prepare through the selected definition.
3. On prepare failure, return original state.
4. On no-op, classify unchanged document and return original state.
5. Preflight documentVersion and nextHistorySequence.
6. Apply the nonempty effect set to one isolated candidate and derive inverse.
7. Run Core semantic validation; preserve semantic diagnostics.
8. Run Core feature classification.
9. Create one private history entry and one private committed operation.
10. Return a command-state candidate to the session coordinator.
11. Session coordinator builds read and event candidates; only then adopt all state.

### 10.3 Undo/redo

- Select exactly one history entry; empty stacks retain existing failures.
- Preflight version before effect work.
- Undo applies stored inverse; redo applies stored forward.
- Re-run Core semantic validation and Core classification.
- Move one unchanged history entry between stacks.
- Reuse stored commandId and affected addresses for events.
- Preserve nextHistorySequence; only a new committed submit allocates a new sequence.
- Any apply/validation/classification/history corruption maps to `history.invariant-violation` with original state.

### 10.4 No-op and rejection invariants

No-op/rejection preserve the exact `CommandRuntimeState` object identity where the current internal tests require it. They also preserve read state, snapshot cache, event sequence and subscriber state through the session layer.

## 11. History, Dirty and Checkpoint Identity

The content identity remains the latest undo entry sequence or `0` when the undo stack is empty. Therefore:

- submit commit creates a new identity;
- undo moves to the previous entry's sequence or `0`;
- redo restores the same entry sequence;
- markPersisted associates documentVersion with the current identity;
- no-op/rejection never create an identity;
- the new multi-effect shape still represents one semantic transaction and one identity.

No effect index, module identity or assembly identity enters the public history selector.

## 12. Validation and Classification Pipeline

CVN-1 introduces the pipeline container, not module callbacks.

```text
changed candidate
  -> validator[0] = validateScoreDocumentSemantics
  -> classifier[0] = validateScoreFeatureProfile
  -> history/read/event candidate
```

Rules:

- semantic failure prevents classifier invocation and adoption;
- classification may return unsupported while the semantic transaction commits;
- no-op classifies the unchanged document and emits no event;
- pipeline arrays and entries are frozen;
- unexpected submit pipeline failures map to `command.internal-error`;
- unexpected undo/redo pipeline failures map to `history.invariant-violation`;
- exact diagnostics and support ordering remain characterization-controlled.

## 13. Event Integration

Generic event publication consumes only:

```typescript
{
  cause,
  commandId,
  affected,
  documentId,
  documentVersion,
  dirtyBefore,
  dirtyAfter,
}
```

It does not switch on Core command payload or private effect kind. The adapter supplies affected facts at submit time and history stores them for undo/redo. Event generation still reserves all required event sequences before adoption. Subscriber invocation remains after adoption and retains snapshot iteration, synchronous exception isolation, Promise/thenable rejection isolation and reentrant-write rejection.

## 14. Live/Replay Binding

`CommandBus.create()` and `replayCoreCommands()` both call the same private runtime factory with `DEFAULT_CORE_EXECUTION_ASSEMBLY`. Replay loops over raw input and calls the same `submitCommand` transition as live submit. It does not construct a second decoder, handler table or transaction coordinator.

Replay output remains detached. Replaying an accepted sequence twice from fresh initial documents must produce deeply equal status/version/support arrays and encoded final documents.

## 15. Registry Internal Split

### 15.1 `strict-codec.ts`

Keeps public unknown-input inspection: manifest exact records, dense arrays, safe IDs and selector requests. It has no Registry class state.

### 15.2 `assembly.ts`

Owns:

- `NormalizedRegistryModule`;
- compiled entry lookup and validation;
- duplicate module/contribution detection;
- command descriptor/default definition parity;
- selector binding validation;
- canonical sorting;
- frozen candidate state and public summary construction.

It receives explicit compiled entries in the private test seam and defaults to `CORE_COMPILED_REGISTRATION_ENTRIES` only in factory orchestration.

### 15.3 `gateway.ts`

Owns:

- `KernelRegistry` and `KernelModuleGateway` construction tokens;
- private WeakMap state;
- module lookup and capability checks;
- summary/read/select/submit/undo/redo/subscribe delegation;
- access failure containment.

It owns no manifest decoder and no compiled contribution normalization.

### 15.4 `runtime.ts`

Owns only:

- public creation result types or their re-exports;
- `buildRegistryCandidate()` private test seam re-export where existing tests require it;
- `createKernelRegistry(manifest)` orchestration;
- construction from an accepted frozen state.

### 15.5 Compatibility rules

- Keep class names, construction rejection, `instanceof`, own-key shape and deep-freeze behavior.
- Keep summary modules/contributions and order exactly.
- Keep all startup/access failure priority and data fields exactly.
- Keep the public `index.ts` export statements compatible even if they re-export from new files.
- Keep two startup registration entry IDs. No domain entry is added.
- Keep gateway denial before mutation and preserve direct CommandBus result/event parity.

## 16. Characterization Trace Design

Create these test artifacts before production edits:

- `test/core-kernel/fixtures/cvn-1-characterization.ts` — deterministic fixture builders and `collectCvn1CharacterizationTrace()`;
- `test/core-kernel/fixtures/cvn-1-characterization.expected.json` — checked-in output from `a8c7404`;
- `test/core-kernel/command-spine-characterization.test.ts` — deep-equality and private-spine structural cases.

The JSON root is fixed:

```typescript
interface Cvn1CharacterizationTraceV1 {
  readonly traceVersion: 1;
  readonly baselineCommit: "a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5";
  readonly runtimeExports: readonly string[];
  readonly catalog: readonly { commandId: string; targetKind: string }[];
  readonly commandCases: readonly Cvn1CommandCaseTrace[];
  readonly historyReplayCase: unknown;
  readonly unknownExtensionCase: unknown;
  readonly registryCase: unknown;
}
```

Each operation record contains operation kind, public result, post-operation read state and newly observed events. The trace excludes private runtime objects and normalizes only values already defined as public/deterministic. It does not include wall-clock time, absolute paths, stack text, object identity hashes or environment-specific values.

Required case IDs:

1. `metadata-change-noop-reject`;
2. `pitch-change-noop-missing`;
3. `note-value-supported-unsupported-semantic-reject`;
4. `insert-notes-valid-invalid-anchor`;
5. `insert-rest-valid-wrong-owner-anchor`;
6. `remove-event-valid-missing`;
7. `multi-step-undo-redo-redo-preservation-invalidation`;
8. `replay-success-noop-first-rejection`;
9. `unknown-extension-roundtrip`;
10. `registry-summary-gateway-parity-denial`.

The test compares the collected post-refactor trace directly with the checked-in baseline JSON. Production changes do not update expected values to make the test pass.

## 17. Test-Seam Rules

Internal tests may import package-private files directly, as existing Core tests do. Test seams must:

- remain absent from root exports;
- accept explicit dependencies rather than global mutable flags;
- avoid test-only behavior in public factories;
- be deterministic and reset-free;
- prove effect order, inverse order, frozen assembly and failure atomicity.

`applyCoreEffectSet()` owns its root candidate clone and exposes no injectable clone dependency. The direct internal regression temporarily wraps and restores `globalThis.structuredClone` to count the one root-document clone, then proves a later effect failure leaves the caller document deeply unchanged.

## 18. Compatibility and Rollback

- Characterization is committed before refactor code and serves as the rollback oracle.
- Existing adapters remain until each new path passes the trace.
- Each stage is independently revertible; no persisted migration is required.
- A mismatch in result, failure, documentVersion, history depths, dirty/checkpoint, event trace, replay, Registry summary or root export stops the task and returns to the last green commit.
- Removing the CVN-1 commits restores the accepted CVN-0-derived Core without data conversion.

## 19. Stop Conditions Requiring Planner Review

Return to planning when implementation evidence suggests any of the following:

- a seventh command, a new public failure or a root export is needed;
- a V1 target/payload/failure priority or accepted input size would change;
- a persisted schema or public event field would change;
- effect application needs a whole-document public replacement or caller inverse;
- Registry splitting changes summary order, class identity, capability priority or startup failure data;
- GD-0/module SDK contracts are needed to finish CVN-1;
- a pre-existing compatibility test would be deleted, weakened or regenerated rather than satisfied;
- the final tree contains two executable transaction/effect paths.
