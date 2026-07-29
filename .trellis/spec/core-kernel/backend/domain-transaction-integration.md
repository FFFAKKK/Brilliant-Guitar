# Core V1.1 Domain Transaction Integration Contract

> **Status:** USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING.
> **Authority:** `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/`
> **Compatibility base:** Pure Core Kernel V1 accepted at `d92a7586536ac8757c318ae6f75aabd8698f85ac`.

## Scope

This specification defines the additive, domain-neutral seam through which trusted official notation domains may join the existing Core transaction pipeline. It does not implement Guitar data, Guitar commands, third-party plugins, runtime registration, UI, rendering, playback, or physical file I/O.

Core-only construction and all accepted K1-1 through K1-6 behavior remain unchanged. The integrated product path is implemented only by separately approved Core V1.1 and Guitar Domain tasks.

## Fixed Decisions

1. **One write port:** Core and installed official-domain commands use `CommandBus.submit(unknown)` and `KernelModuleGateway.submit(unknown)`.
2. **Modular results:** integrated construction adds a typed, data-only result envelope containing accepted Core facts plus deterministically ordered module assessments/issues. Core does not enumerate domain-owned codes.
3. **Explicit validation completeness:** Core semantics run first; every required, installed, exactly schema-compatible domain validator then runs in frozen catalog order. Support classification starts only after the candidate is semantically valid. A missing or incompatible validator is exposed as `incomplete`, never silently represented as complete domain validity.
4. **One committed fact:** each committed submit/undo/redo publishes exactly one domain-neutral `core.document.committed`, followed only by the existing dirty event when dirty changes.
5. **Lossless missing/incompatible-domain mode:** a known official extension whose exact-version requirement is unavailable or incompatible opens as a detached, lossless read-only integrated session. Incompatible handlers do not execute. Unknown opaque extensions retain Core V1 preservation behavior and do not automatically block writes.

## Dependency and Ownership Boundary

```text
Product composition root
  -> Core V1.1 integrated construction
      -> frozen official contribution catalog
          -> official domain modules

Official domain module -> public Core data / official module SDK
Core Kernel            -> zero imports from Guitar Domain
```

- `ScoreDocument` remains the only document truth.
- Core owns notation, transaction isolation, document version, history, undo/redo, replay, checkpoint/dirty state, event sequencing, and contribution assembly.
- A domain owns its extension schema, strict decoder, semantic validator, support classifier, command payloads, effect payloads, diagnostics, and affected-address facts.
- Guitar tuning, string/fret placement, and techniques remain in a Part-owned `GuitarExtension`; no Guitar field is added to Core `Note`, `Event`, metadata, or history contracts.
- No module receives a mutable document, active bus, internal history/effect, registry internals, subscriber list, clock, randomness, filesystem, network, or platform API through this ABI.

## Construction and Catalog

- `CommandBus.create(initialDocument)` and `replayCoreCommands()` retain their accepted Core V1 types and behavior.
- `CommandBus.createIntegrated(initialDocument, catalog)` binds the existing bus implementation to one immutable `KernelIntegratedCatalog`. It is not a second bus, state store, history stack, replay owner, or event system.
- The product composition root supplies statically linked official compiled entries beside a strict startup manifest. The manifest contains data only and never carries functions, paths, URLs, scripts, or dynamic imports.
- The additive registration entry is `kernel.domain-commands.v1`. It reuses approved command/read/event capabilities and adds explicit namespace ownership; it does not create a generic document-mutation capability.
- Catalog construction is all-or-nothing and validates identities, API versions, trust/runtime, capabilities, descriptor/binding parity, command IDs, effect kinds, namespace ownership, profiles, and exact-version compatibility declarations. A compiled binding must match the selected requirement identity and exact supported-version list; mismatch fails construction before any handler is callable.
- The successful catalog and every nested public data object are detached and deeply frozen. Ready catalogs have no register, unregister, replace, version, or change-event API.
- Integrated registry, gateway, bus, and replay must share one private assembly identity. Cross-assembly or Core-only/integrated pairing rejects before exposing a session.

## Minimum Public Integration Surface

The names, parameters, result fields, and discriminants below are frozen by GD-0. CK1.1-1/GD-2 may design private handlers, builders, and class layout, but may not substitute another public construction or replay contract without returning GD-0 to planning.

```typescript public-contract
declare const kernelIntegratedCatalogBrand: unique symbol;

interface KernelIntegratedCatalog {
  readonly [kernelIntegratedCatalogBrand]: true;
}

interface ExtensionRuntimeRequirementV1 {
  readonly requirementVersion: 1;
  readonly namespace: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly requiredForWrite: true;
}

type KernelDomainAvailabilityFact =
  | {
      readonly reason: "required-contribution-unavailable";
      readonly namespace: string;
      readonly owner: ExtensionOwner;
      readonly extensionSchemaVersion: number;
      readonly moduleId: string;
      readonly contributionId: string;
      readonly supportedSchemaVersions: readonly number[];
    }
  | {
      readonly reason: "required-contribution-incompatible";
      readonly namespace: string;
      readonly owner: ExtensionOwner;
      readonly extensionSchemaVersion: number;
      readonly moduleId: string;
      readonly contributionId: string;
      readonly supportedSchemaVersions: readonly number[];
    };

type KernelWriteAvailability =
  | { readonly status: "writable" }
  | {
      readonly status: "read-only";
      readonly reason: "domain-validation-incomplete";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    };

type KernelValidationAvailability =
  | { readonly status: "complete" }
  | {
      readonly status: "incomplete";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    };

interface IntegratedKernelReadState extends KernelReadState {
  readonly writeAvailability: KernelWriteAvailability;
  readonly validationAvailability: KernelValidationAvailability;
}

type ModuleIssueCode = `${string}.${string}`;

interface ModuleKernelIssue {
  readonly issueVersion: 1;
  readonly code: ModuleIssueCode;
  readonly severity: KernelSeverity;
  readonly messageKey: string;
  readonly source: {
    readonly kind: "module";
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

interface ModuleCommandAssessment {
  readonly moduleId: string;
  readonly contributionId: string;
  readonly status: "supported" | "unsupported";
  readonly issues: readonly ModuleKernelIssue[];
}

interface KernelCommandAssessment {
  readonly core: ScoreSupportResult;
  readonly modules: readonly ModuleCommandAssessment[];
}

type KernelContributionFailure =
  | {
      readonly code: "command.required-contribution-unavailable";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    }
  | {
      readonly code: "command.required-contribution-incompatible";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    }
  | {
      readonly code: "command.contribution-semantic-invalid";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly code: "command.contribution-contract-violation";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | {
      readonly code: "command.contribution-internal-error";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | { readonly code: "command.assembly-mismatch" };

type KernelCommandFailure = CommandFailure | KernelContributionFailure;

type KernelCommandBusCreationFailure =
  | CommandBusCreationFailure
  | Extract<
      KernelContributionFailure,
      {
        readonly code:
          | "command.contribution-semantic-invalid"
          | "command.contribution-contract-violation"
          | "command.contribution-internal-error"
          | "command.assembly-mismatch";
      }
    >;

type KernelCommandResult =
  | {
      readonly status: "committed" | "no-op";
      readonly documentVersion: number;
      readonly assessment: KernelCommandAssessment;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly failure: KernelCommandFailure;
      readonly undoDepth: number;
      readonly redoDepth: number;
    };

type IntegratedCommandBusCreationResult =
  | { readonly ok: true; readonly value: IntegratedCommandBus }
  | { readonly ok: false; readonly failure: KernelCommandBusCreationFailure };

declare namespace CommandBus {
  function createIntegrated(
    initialDocument: ScoreDocument,
    catalog: KernelIntegratedCatalog,
  ): IntegratedCommandBusCreationResult;
}

interface IntegratedCommandBus {
  submit(input: unknown): KernelCommandResult;
  undo(): KernelCommandResult;
  redo(): KernelCommandResult;
  read(): ReadResult<IntegratedKernelReadState>;
  markPersisted(input: unknown): MarkPersistedResult;
  subscribe(handler: unknown): EventSubscriptionResult;
}

type IntegratedKernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: IntegratedKernelModuleGateway }
  | {
      readonly ok: false;
      readonly failure:
        | KernelRegistryAccessFailure
        | { readonly code: "registry.assembly-mismatch" };
    };

interface KernelRegistry {
  createGateway(
    moduleId: string,
    commandBus: IntegratedCommandBus,
  ): IntegratedKernelModuleGatewayCreationResult;
}

type IntegratedKernelModuleGateway = Omit<
  KernelModuleGateway,
  "submit" | "undo" | "redo" | "read"
> & {
  submit(input: unknown): KernelGatewayResult<KernelCommandResult>;
  undo(): KernelGatewayResult<KernelCommandResult>;
  redo(): KernelGatewayResult<KernelCommandResult>;
  read(): KernelGatewayResult<ReadResult<IntegratedKernelReadState>>;
};

type ReplayKernelCommandsResult =
  | {
      readonly status: "replayed";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly KernelCommandResult[];
      readonly writeAvailability: KernelWriteAvailability;
      readonly validationAvailability: KernelValidationAvailability;
    }
  | {
      readonly status: "rejected";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly KernelCommandResult[];
      readonly failedCommandIndex: number;
      readonly failure: KernelCommandFailure;
      readonly writeAvailability: KernelWriteAvailability;
      readonly validationAvailability: KernelValidationAvailability;
    }
  | {
      readonly status: "invalid-initial-document";
      readonly failure: KernelCommandBusCreationFailure;
    };

declare function replayKernelCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
  catalog: KernelIntegratedCatalog,
): ReplayKernelCommandsResult;
```

The `CommandBus` namespace declaration represents an additive static factory on the accepted class. The `KernelRegistry` interface merge represents an additive **instance overload** on the accepted Registry instance; no static Registry factory is introduced. The integrated gateway replaces only `submit`, `undo`, `redo`, and `read`, so K1-4 `summary`, every typed `select` overload, and `subscribe` remain present with their accepted capability gates and result types. Existing Core-only constructors, results, gateway overload, and `replayCoreCommands()` remain unchanged.

## Submission and Transaction Pipeline

For live submit and integrated replay, routing and execution are identical:

1. Read the top-level command identity from exact own enumerable data descriptors.
2. Resolve exactly one frozen command definition by namespaced ID and version.
3. Strictly decode, detach, and freeze the complete target and payload.
4. Resolve stable targets and prove ownership.
5. Prepare a nonempty private effect set and affected `ScoreAddress` facts.
6. Derive fine-grained inverse effects from the current isolated candidate.
7. Apply every effect to one isolated candidate; any failure discards it.
8. Detect no-op before changing visible state.
9. Run Core semantics, all installed exactly schema-compatible domain semantics, Core profile, then all compatible domain profiles. Missing/incompatible availability rejects writes before this step.
10. Validate/canonicalize event facts and reserve event sequences.
11. Adopt document, version, history, dirty/read state, and event state once.
12. Publish one committed event and the optional dirty event; subscriber failures remain isolated.

Rejected and no-op operations leave document state, version, history, redo depth, checkpoint/dirty identity, write availability, validation availability, and event sequence unchanged. Unsupported profile results may commit; semantic invalidity never commits.

## Private Effect and History Boundary

- The existing private single mutation becomes a private nonempty effect set only inside the integrated implementation.
- Existing Core commands remain one-effect transactions and retain their public behavior.
- The first domain-to-Core request surface is limited to the Core-owned `WrittenPitch` replacement required by Guitar placement.
- Module effects may replace only an extension namespace and owner declared by their compiled contribution. They are strict, versioned internal data—not JSON Patch, JSON path, splice, callback, or whole-document replacement.
- One semantic command creates one history entry with its frozen semantic command, command/contribution identity, fine-grained forward and reverse-ordered inverse effects, and frozen affected-address facts.
- History stores no whole-document snapshot, timestamp, random ID, mutable handler, raw error, path, registry object, or public patch.
- Undo and redo apply the complete inverse/forward set to an isolated candidate and rerun the full validation/classification/fact pipeline before moving history entries.

## Results, Issues, and Failures

- Core-only results and codes remain unchanged.
- Integrated results add deterministically ordered module assessments. Order is Core first, then module catalog order, then validator-return order.
- Domain codes are namespace-qualified and owned by the contribution; they are not added to the closed Core V1 `KernelIssueCode` union.
- Stable mechanism failures cover required contribution unavailable, required contribution incompatible, domain semantic invalidity, contribution contract violation, internal contribution failure, and assembly mismatch.
- Public results contain deeply frozen allowlisted data only. Error instances, stacks, handler identity, internal effects, document payloads, tokens, and local paths never cross the boundary.
- The official module authoring SDK is a separately reviewed entry point. Its narrow error base converts domain errors to frozen issue data; application-facing Core exports no error classes or internal builders.

## Read, Replay, Compatibility, and Completeness

- `supportedSchemaVersions` is nonempty, strictly ascending, duplicate-free, positive safe integers. Compatibility uses exact equality with each target `ExtensionBlock.schemaVersion`; no range, “latest”, downgrade, guess, or implicit migration exists.
- A declared namespace with no block produces no availability fact. A block with a listed version and absent contribution produces `required-contribution-unavailable`. A block with an unlisted version—including a future version—produces `required-contribution-incompatible` whether or not a contribution is present.
- Compatibility is resolved per persisted `ExtensionBlock`. If one contribution owns an exactly compatible block and an incompatible/future block, only the compatible block enters a detached block-scoped view in canonical owner order. The incompatible block is never passed to that contribution's decoder, validator, classifier, command/effect handler, or fact generator.
- During each validation pass, `validate` runs at most once per contribution over Core score read data plus that filtered compatible view. After Core and compatible validators pass, `classify` runs at most once with the same filtered view. The session remains read-only and validation-incomplete because the excluded block is not domain-validated; the private handler-input type remains for CK1.1-1/GD-2.
- The full excluded extension envelope and nested JSON data remain unchanged. Writes reject at availability preflight, so command/effect/fact handlers receive zero calls in the degraded session.
- Integrated reads expose both `KernelWriteAvailability` and `KernelValidationAvailability`. Facts are canonical, deduplicated, sorted, detached, and deeply frozen. A Core-valid result with any missing/incompatible fact is `incomplete`; callers cannot label it complete installed-domain semantic validity.
- Read-only sessions retain decode, encode, snapshot, selection, inspection, checkpoint bookkeeping, incomplete validation reporting, and exact opaque payload preservation. Submit, undo, redo, and each attempted replay command use one preflight rule before command decoding or empty-history checks: if any canonical fact is incompatible, return `command.required-contribution-incompatible`; otherwise return `command.required-contribution-unavailable`. The returned `facts` always contain the full canonical list, including both reasons in a mixed state, and equal the read/replay availability facts. All four paths preserve the complete pre-call state; empty replay is the only no-write path and may return `replayed` unchanged with the same availability values.
- Truly unknown undeclared ExtensionBlocks remain writable under accepted Core V1 semantics and are outside the known official-domain completeness claim.
- Integrated replay consumes semantic command envelopes only and uses the same frozen catalog and execution pipeline as live submit. It returns detached results and final document; internal effects, undo/redo logs, events, and history snapshots are not replay input. Empty replay may succeed unchanged in read-only mode; the first write rejects at its exact index.
- Unknown and non-target extension subtrees remain deeply equal through success, rejection, no-op, undo, redo, replay, missing/incompatible-domain degradation, and codec round-trip.

## Event Contract

- Core-only event types and shapes remain unchanged.
- Integrated sessions use an additive modular event type while preserving the event names and ordering accepted by K1-3.
- The committed fact carries a namespaced command identity and the canonical, deduplicated union of Core/domain affected `ScoreAddress` facts.
- Submit and redo use forward facts; undo uses the same stable entity identities with cause `undo`.
- Event construction and sequence reservation remain pre-commit atomic. Synchronous throws and asynchronous subscriber rejection cannot roll back a commit or stop later subscribers.

## Hostile Input and Determinism

- Every public `unknown` guard/decoder used by the seam is descriptor-first, no-getter, and no-throw.
- Accessors, hostile Proxies, invalid prototypes, extra fields, sparse arrays, cycles, Promise-like synchronous hooks, and mutable caller aliases reject with stable data-only failures.
- IDs, effect order, validation order, classification, events, results, and replay never depend on wall clock, randomness, object identity, object enumeration, registration timing, or mutable global profiles.
- The accepted guard behavior is implemented first by CK1.1-0; the module SDK follows in CK1.1-1. This document does not authorize either implementation.

## Validation and Error Matrix

| Condition | Public availability/result | State and execution rule |
|---|---|---|
| Core-semantic invalid initial document | `invalid-initial-document` | no live session |
| Known block version exactly supported and contribution present | `writable` + validation `complete` after all validators succeed | compatible handlers may execute |
| Known block version exactly supported but contribution absent | read-only + validation `incomplete`; fact reason `required-contribution-unavailable` | no write handler executes; full block preserved |
| Known block version unlisted, including a future version | read-only + validation `incomplete`; fact reason `required-contribution-incompatible` | no contribution handler for that block executes; full block preserved |
| Unavailable and incompatible facts coexist | read-only + validation `incomplete`; every write path returns `command.required-contribution-incompatible` | full mixed canonical fact list returned; no state or handler activity |
| Same contribution owns one compatible and one incompatible/future block | read-only + validation `incomplete`; compatible subset may be validated/classified once | incompatible block reaches no handler; full payload remains unchanged |
| Compatible domain validator returns semantic issues | `command.contribution-semantic-invalid` with ordered module issues | complete pre-operation state retained |
| Contribution violates its data contract or throws/returns a Promise-like value in a synchronous hook | `command.contribution-contract-violation` or `command.contribution-internal-error` | complete pre-operation state retained |
| Integrated component uses a different/forged catalog identity | `command.assembly-mismatch` or `registry.assembly-mismatch` | reject before session/gateway exposure |
| Undeclared opaque extension namespace | accepted Core V1 preservation behavior | writable unless another declared requirement creates a fact; no claim that opaque payload semantics were domain-validated |

## Good / Base / Bad Cases

- **Good:** a compatible official contribution validates one Part-owned extension, then one placement command atomically changes Core pitch and owned extension data with one version/history/event fact.
- **Base:** a mixed-owner/version document gives one contribution an exactly compatible block and an incompatible/future block. It opens lossless read-only, exposes the full canonical facts, validates/classifies only the compatible block-scoped view at most once, performs zero incompatible-block and write-handler calls, and round-trips the full excluded extension JSON value unchanged.
- **Bad:** silently skipping an absent validator and returning “complete/valid”, invoking a handler before exact-version negotiation, or replacing the integrated path with a second command/history owner.

## Tests Required by Downstream Gates

- The docs-only contract compiler at `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/verify-public-contracts.mjs` must report zero parse or type diagnostics for every tagged authoritative `typescript public-contract` fence. Downstream compile-time/public-boundary assertions cover the same exact factory, instance gateway overload/full retained gateway surface, availability, issue/failure, and replay discriminants; Core-only signatures remain unchanged.
- Table-driven absent/compatible/incompatible/future-schema cases with sorted/deduplicated facts, read-only rejection, validation completeness, zero incompatible handler calls, deep freeze, and input isolation. Include a mixed unavailable+incompatible fixture and assert identical code/full facts for submit, undo, redo, and first replay write.
- Include a mixed-owner/version fixture for one contribution with both a compatible block and an incompatible/future block. Assert one filtered validator call and at most one filtered classifier call in canonical owner order, zero incompatible-block decoder/validator/classifier calls, zero command/effect/fact calls, and full excluded-payload preservation.
- Atomic multi-effect submit/no-op/reject/undo/redo, full rollback at every failure phase, one history entry/version/event, checkpoint/dirty parity, and live/replay deep equality.
- Unknown/non-target extension preservation across codec, success, rejection, no-op, undo, redo, replay, and degraded reads.
- Hostile accessor/Proxy/sparse/cyclic inputs, synchronous throws, Promise-like synchronous hooks, subscriber rejection, overflow, privacy allowlists, forbidden dependencies, and public export boundaries.

## Wrong vs Correct

```typescript
// Wrong: Core-only validation is labeled complete while a required validator is absent.
return { status: "writable", validationAvailability: { status: "complete" } };

// Correct: preserve the document and expose the canonical degradation fact.
return {
  writeAvailability: {
    status: "read-only",
    reason: "domain-validation-incomplete",
    facts,
  },
  validationAvailability: { status: "incomplete", facts },
};
```

## Downstream Gates

Implementation order is fixed and independently reviewed:

1. CK1.1-0 hostile-input guard prerequisite.
2. CK1.1-1 official module-SDK contract foundation.
3. GD-1 GuitarExtension foundation and validation/profile, without commands.
4. GD-2 generic Core V1.1 domain-command seam, using a neutral synthetic test contribution.
5. GD-3 Guitar semantic commands for placement, slide, bend, and vibrato.
6. GD-4 Core/Guitar integration and compatibility gate.

Any requirement for a Core-to-Guitar import, second transaction/history/event owner, public patch API, runtime registration/unload, whole-document history snapshot, persisted Core schema change, or UI/render/playback/physical-I/O behavior stops the active downstream task and returns it to planning.
