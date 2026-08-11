# Core V1.1 Domain Transaction Integration Contract

> **Status:** ACCEPTED DOCUMENTATION / ARCHITECTURE CONTRACT; PRODUCTION IMPLEMENTATION SEPARATELY GATED.
> **Authority:** `.trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/`
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
- The accepted `compileOfficialModuleCatalogV1`, its catalog-private state and unselected-entry behavior remain exact. After CVN-6 planning acceptance, additive integrated Registry/bus/replay overloads may accept one strict data-only known-requirement inventory beside the authentic catalog; catalog-only forms remain exact and derive an installed-only inventory.
- The product composition root supplies statically linked official compiled entries beside a strict startup manifest. The manifest contains data only and never carries functions, paths, URLs, scripts, or dynamic imports.
- The additive registration entry is `kernel.domain-commands.v1`. It reuses approved command/read/event capabilities and adds explicit namespace ownership; it does not create a generic document-mutation capability.
- Catalog construction is all-or-nothing and validates identities, API versions, trust/runtime, capabilities, descriptor/binding parity, command IDs, effect kinds, namespace ownership, profiles, and exact-version compatibility declarations. A compiled binding must match the selected requirement identity and exact supported-version list; mismatch fails construction before any handler is callable.
- The successful catalog and every nested public data object are detached and deeply frozen. Ready catalogs have no register, unregister, replace, version, or change-event API.
- Integrated registry, gateway, bus, and replay must share one private runtime assembly identity derived from authentic catalog identity plus canonical known-requirement inventory data. Catalog/inventory cross-assembly or Core-only/integrated pairing rejects before exposing a session.

## Minimum Public Integration Surface

The names, parameters, result fields, and discriminants below are frozen by GD-0. CVN-2 may design private SDK/catalog handlers and builders, and CVN-6 may design private runtime binding/class layout, but neither may substitute another public construction or replay contract without returning GD-0 to planning.

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

## CVN-6 Accepted Contract Closure

The formal CVN-6 child is archived at `.trellis/tasks/archive/2026-08/08-11-cvn-6-module-runtime-validation-migration-integration/`. Its accepted source/test candidate is `8da50f90c9c05d87a8e1aa7a4e65b30e6ab82c7f`; final independent implementation rereview passed P0/P1/P2=`0/0/0` after closing five bounded findings. The following code block is the accepted CVN-6 implementation authority that closes construction, event, resource and detached-migration details around the accepted GD-0 declarations above. The archived GD-0 `public-contract` fence remains its prerequisite.

```typescript cvn6-planning-contract
interface KernelKnownRequirementInventoryV1 {
  readonly inventoryVersion: 1;
  readonly requirements: readonly ExtensionRuntimeRequirementV1[];
}

declare namespace CommandBus {
  function createIntegrated(
    initialDocument: ScoreDocument,
    catalog: KernelIntegratedCatalog,
    knownRequirements: unknown,
  ): IntegratedCommandBusCreationResult;
}

declare function createKernelRegistry(
  catalog: KernelIntegratedCatalog,
): KernelRegistryCreationResult;

declare function createKernelRegistry(
  catalog: KernelIntegratedCatalog,
  knownRequirements: unknown,
): KernelRegistryCreationResult;

declare function replayKernelCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
  catalog: KernelIntegratedCatalog,
  knownRequirements: unknown,
): ReplayKernelCommandsResult;

interface KernelCommandIdentity {
  readonly commandId: string;
  readonly source:
    | { readonly kind: "core" }
    | {
        readonly kind: "module";
        readonly moduleId: string;
        readonly contributionId: string;
      };
}

type IntegratedKernelEvent =
  | (
      Omit<
        Extract<KernelEvent, { readonly eventType: "core.document.committed" }>,
        "commandId"
      > &
      KernelCommandIdentity
    )
  | Extract<
      KernelEvent,
      { readonly eventType: "core.session.dirty-state-changed" }
    >;

// Planning notation only; this helper name is not a public export. Its shape is
// inserted directly into KernelCommandFailure. The construction union uses the
// same shape with limitKind limited to compatibility-facts | module-issues.
type CVN6KernelIntegratedResourceFailureAddition = {
  readonly code: "command.resource-limit-exceeded";
  readonly limitKind:
    | "effects"
    | "affected-addresses"
    | "compatibility-facts"
    | "module-issues";
  readonly limit: number;
  readonly actual: number;
};

// Planning notation only; inserted into KernelCommandBusCreationFailure.
type CVN6KernelCommandBusCreationFailureAddition =
  | { readonly code: "command.invalid-requirement-inventory" }
  | {
      readonly code: "command.resource-limit-exceeded";
      readonly limitKind: "compatibility-facts" | "module-issues";
      readonly limit: number;
      readonly actual: number;
    };

interface KernelExtensionMigrationRequestV1 {
  readonly migrationVersion: 1;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly effectKind: string;
  readonly namespace: string;
  readonly owner: ExtensionOwner;
  readonly sourceSchemaVersion: number;
  readonly targetSchemaVersion: number;
  readonly payload: JsonObject;
}

type KernelExtensionMigrationFailure =
  | MigrationFailure
  | { readonly code: "migration.invalid-request" }
  | { readonly code: "migration.target-not-found" }
  | { readonly code: "migration.unsupported-target-version" }
  | {
      readonly code: "migration.contribution-semantic-invalid";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly code: "migration.contribution-contract-violation";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | {
      readonly code: "migration.contribution-internal-error";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | { readonly code: "migration.assembly-mismatch" };

type KernelExtensionMigrationResult =
  | {
      readonly status: "migrated";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "not-required";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "rejected";
      readonly failure: KernelExtensionMigrationFailure;
      readonly report: MigrationReport;
    };

declare function migrateKernelExtension(
  input: unknown,
  request: unknown,
  catalog: KernelIntegratedCatalog,
): KernelExtensionMigrationResult;
```

The accepted catalog compiler, catalog-only integrated signatures and existing manifest overload of `createKernelRegistry` remain exact. The explicit inventory form accepts an exact `inventoryVersion: 1` record with at most 1,024 requirement rows and at most 256 versions per row; shared strict-capture budgets remain depth 64 and 1,048,576 own properties. It is normalized outside CVN-2 catalog state, must contain every installed requirement exactly once with identical data, and may add absent requirements only under an absent module/contribution identity. Any row reusing an installed module/contribution identity must equal that contribution's real requirement, so a forged extra namespace cannot borrow installed authority. Malformed, duplicate, over-limit or catalog-parity failure returns `command.invalid-requirement-inventory` from bus/replay construction and `registry.invalid-startup-input` from Registry construction; no runtime object or callback activity escapes. A private CVN-6 cache combines authentic catalog identity with a collision-free canonical inventory key so Registry, bus, gateway and replay share one runtime assembly identity; catalog or inventory mismatch remains `registry.assembly-mismatch` or `command.assembly-mismatch` at the receiving boundary. Initial compatibility-fact/module-issue overflow is included in `KernelCommandBusCreationFailure`; effects and affected-address failures apply only after an integrated command begins.

Construction priority is global and fixed. CommandBus/replay preserve initial document strict-decode/Core-semantic failure first, then catalog authenticity, inventory decode/caps, installed-requirement parity, runtime assembly resolution, compatibility facts/caps and applicable installed callbacks. Registry has no document stage: catalog authenticity precedes inventory inspection, then parity, assembly resolution and publication. Gateway compares runtime assembly identity before module/capability lookup. Unknown classification occurs only after a valid inventory miss; neither a forged catalog nor an ignored CVN-2 entry can create unavailable authority.

Application runtime exports add exactly `replayKernelCommands` and `migrateKernelExtension`, moving the accepted 49-name baseline to 51. `KernelKnownRequirementInventoryV1` is one application type export only. Module SDK runtime/type exports remain `8/34`, `compileOfficialModuleCatalogV1` remains exact, and `CompiledDomainCommandContributionV1` remains the accepted nine-field shape. The private kernel runtime assembly identity here is distinct from the post-Core Product Host `Application Assembly`.

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
- "Known" is determined only by the frozen CVN-6 runtime inventory; contribution presence is determined independently by the installed CVN-2 namespace index. A catalog-only integrated call derives an installed-only inventory, preserving accepted behavior. A known namespace with no block produces no availability fact. A block with a listed version and absent contribution produces `required-contribution-unavailable`. A block with an unlisted version—including a future version—produces `required-contribution-incompatible` whether or not a contribution is present. An inventory miss remains unknown opaque Core V1 data.
- Compatibility is resolved per persisted `ExtensionBlock`. If one contribution owns an exactly compatible block and an incompatible/future block, only the compatible block enters a detached block-scoped view in canonical owner order. The incompatible block is never passed to that contribution's decoder, validator, classifier, command/effect handler, or fact generator.
- During every applicable pass, an installed contribution with zero compatible blocks receives validator/classifier calls `0/0`. With one or more compatible blocks it receives exactly one `validate` call over Core score read data plus the canonical-owner-ordered filtered compatible view. Only after every applicable validator succeeds and classification begins does each such contribution receive exactly one `classify` call over that same view. If any validator returns semantic issues, throws, or violates its contract, classification does not begin and all classifiers receive zero calls. Initial construction/explicit validation, changed candidates, undo, redo, and replay candidate passes use this same rule. The session remains read-only and validation-incomplete when an excluded block exists; the private handler-input type remains for CVN-2/CVN-6.
- The full excluded extension envelope and nested JSON data remain unchanged. Writes reject at availability preflight, so command/effect/fact handlers receive zero calls in the degraded session.
- Integrated reads expose both `KernelWriteAvailability` and `KernelValidationAvailability`. Facts are canonical, deduplicated, sorted, detached, and deeply frozen. A Core-valid result with any missing/incompatible fact is `incomplete`; callers cannot label it complete installed-domain semantic validity.
- Read-only sessions retain decode, encode, snapshot, selection, inspection, checkpoint bookkeeping, incomplete validation reporting, and exact opaque payload preservation. Submit, undo, redo, and each attempted replay command use one preflight rule before command decoding or empty-history checks: if any canonical fact is incompatible, return `command.required-contribution-incompatible`; otherwise return `command.required-contribution-unavailable`. The returned `facts` always contain the full canonical list, including both reasons in a mixed state, and equal the read/replay availability facts. All four paths preserve the complete pre-call state; empty replay is the only no-write path and may return `replayed` unchanged with the same availability values.
- Truly unknown undeclared ExtensionBlocks remain writable under accepted Core V1 semantics and are outside the known official-domain completeness claim.
- Integrated replay strictly captures and detaches the complete dense command-sequence container before reading any command index, then consumes semantic command envelopes through the same frozen catalog and execution pipeline as live submit. It returns detached results and final document; internal effects, undo/redo logs, events, and history snapshots are not replay input. Empty replay may succeed unchanged in read-only mode; the first write rejects at its exact index.
- Unknown and non-target extension subtrees remain deeply equal through success, rejection, no-op, undo, redo, replay, missing/incompatible-domain degradation, and codec round-trip.

## Event Contract

- Core-only event types and shapes remain unchanged.
- Integrated sessions use an additive modular event type while preserving the event names and ordering accepted by K1-3.
- The committed fact carries a namespaced command identity and the canonical, deduplicated union of Core/domain affected `ScoreAddress` facts. Strict decoding and full-address deduplication occur before the 131,072 unique-address cap and lexical canonical sort.
- Submit and redo use forward facts; undo uses the same stable entity identities with cause `undo`.
- Event construction and sequence reservation remain pre-commit atomic. Synchronous throws and asynchronous subscriber rejection cannot roll back a commit or stop later subscribers.

## Hostile Input and Determinism

- Every public `unknown` guard/decoder used by the seam is descriptor-first, no-getter, and no-throw.
- Validation and detached migration use module-initialized stable primordial call chains across callback boundaries. Migration publishes only after a captured JSON round-trip proves complete candidate equality, including all non-target subtrees.
- Accessors, hostile Proxies, invalid prototypes, extra fields, sparse arrays, cycles, Promise-like synchronous hooks, and mutable caller aliases reject with stable data-only failures.
- IDs, effect order, validation order, classification, events, results, and replay never depend on wall clock, randomness, object identity, object enumeration, registration timing, or mutable global profiles.
- Accepted CVN-0 supplies the guard prerequisite; CVN-2 supplies the module SDK/frozen assembly only after GD-0 acceptance and separate approval. This document does not activate CVN-2 or later runtime work.

## Validation and Error Matrix

| Condition | Public availability/result | State and execution rule |
|---|---|---|
| Core-semantic invalid initial document | `invalid-initial-document` | no live session |
| Known block version exactly supported and contribution present | `writable` + validation `complete` after all validators succeed | exact validator/classifier matrix applies; write handlers execute only for an accepted writable operation |
| Known block version exactly supported but contribution absent | read-only + validation `incomplete`; fact reason `required-contribution-unavailable` | no write handler executes; full block preserved |
| Known block version unlisted, including a future version | read-only + validation `incomplete`; fact reason `required-contribution-incompatible` | no contribution handler for that block executes; full block preserved |
| Unavailable and incompatible facts coexist | read-only + validation `incomplete`; every write path returns `command.required-contribution-incompatible` | full mixed canonical fact list returned; no state or handler activity |
| Same contribution owns one compatible and one incompatible/future block; applicable pass succeeds | read-only + validation `incomplete`; validator/classifier exactly `1/1` over the same canonical filtered view | incompatible block reaches no handler; full payload remains unchanged |
| Contribution has zero compatible blocks | read-only + validation `incomplete`; validator/classifier `0/0` | no contribution view or handler call |
| Compatible domain validator returns semantic issues | `command.contribution-semantic-invalid`; validator/classifier exactly `1/0` | remaining applicable validators still run once for deterministic collection; no classifier runs; complete pre-operation state retained |
| Compatible domain validator throws or violates its validator output contract | `command.contribution-internal-error` or `command.contribution-contract-violation`; validator/classifier exactly `1/0` | no classifier runs; complete pre-operation state retained |
| Read-only submit, undo, redo, or first replay write | deterministic availability failure; operation validator/classifier/write `0/0/0` | preflight rejects before operation validation or handler activity |
| A later classifier/effect/fact hook violates its data contract or throws/returns a Promise-like value | `command.contribution-contract-violation` or `command.contribution-internal-error` | complete pre-operation state retained; the attempted hook's own call is counted once |
| Integrated component uses a different/forged catalog or inventory runtime identity | `command.assembly-mismatch` or `registry.assembly-mismatch` | reject before session/gateway exposure |
| Undeclared opaque extension namespace | accepted Core V1 preservation behavior | writable unless another declared requirement creates a fact; no claim that opaque payload semantics were domain-validated |

## Good / Base / Bad Cases

- **Good:** a compatible official contribution validates one Part-owned extension, then one placement command atomically changes Core pitch and owned extension data with one version/history/event fact.
- **Base:** a mixed-owner/version document gives one contribution an exactly compatible block and an incompatible/future block. It opens lossless read-only and exposes the full canonical facts. An applicable successful pass calls its validator/classifier exactly `1/1` over the same compatible block-scoped view; a validation issue/throw/contract violation gives `1/0`; read-only writes give operation-phase `0/0/0`. The incompatible block reaches zero handlers and the full excluded extension JSON value round-trips unchanged.
- **Bad:** silently skipping an absent validator and returning “complete/valid”, invoking a handler before exact-version negotiation, or replacing the integrated path with a second command/history owner.

## Tests Required by Downstream Gates

- Layer A, `.trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/verify-public-contracts.mjs`, extracts every tagged authoritative `typescript public-contract` fence and must report zero parse/type diagnostics using a syntax/name-resolution-only prelude. Layer B compiles `real-core-drift-assertions.ts` with the archived `tsconfig.real-core.json` against the real accepted Core public root and must prove `KernelGatewayResult` uses `authorized/rejected`, `createGateway` is an instance method, all six typed `select` overloads plus `summary`/`subscribe` remain, shared `CommandBus` methods retain their types, and `MarkPersistedResult`/`EventSubscriptionResult` retain their discriminants. Both are mandatory; no copied prelude is accepted as Core compatibility evidence.
- Table-driven absent/compatible/incompatible/future-schema cases with sorted/deduplicated facts, read-only rejection, validation completeness, zero incompatible handler calls, deep freeze, and input isolation. Construct unavailable-only through the public explicit-inventory integrated constructors by omitting the contribution from the authentic catalog while retaining its inventory item; construct incompatible-only, mixed and unknown through the same public path, never by private-state fabrication. Include a mixed unavailable+incompatible fixture and assert identical code/full facts for submit, undo, redo, and first replay write.
- Inventory tests cover catalog-only overload parity, exact installed superset, absent contribution, forged namespace under an installed module/contribution identity, malformed/duplicate/parity conflict, 1,024/1,025 rows, 256/257 versions, hostile descriptor/Proxy/alias inputs, canonical order/deep freeze, catalog/inventory identity mismatch and six callback families remaining at zero.
- Include table-driven mixed-owner/version fixtures. Assert compatible count `0` gives validator/classifier `0/0`; compatible count `>= 1` gives exactly one validator call per applicable pass over the canonical-owner-ordered filtered view; total validator success plus classification gives classifier count `1` with the identical view; semantic issues, throws, or contract violations give classifier count `0`; and read-only submit/undo/redo/first replay write gives operation validator/classifier/write `0/0/0`. Also assert zero incompatible-block decoder/validator/classifier/command/effect/fact calls and full excluded-payload preservation.
- Atomic multi-effect submit/no-op/reject/undo/redo, full rollback at every failure phase, one history entry/version/event, checkpoint/dirty parity, and live/replay deep equality.
- Unknown/non-target extension preservation across codec, success, rejection, no-op, undo, redo, replay, and degraded reads.
- Hostile accessor/Proxy/sparse/cyclic inputs, callback-time primordial replacement, replay sequence-container aliasing, synchronous throws, Promise-like synchronous hooks, subscriber rejection, overflow, privacy allowlists, forbidden dependencies, and public export boundaries.

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

The approved Core-first ownership graph is fixed and independently reviewed:

1. CVN-0 (accepted) owns the former CK1.1-0 hostile-input prerequisite; CVN-1 (accepted) owns the behavior-preserving command/transaction/Registry spine.
2. CVN-2, after GD-0 acceptance and separate planning approval, owns the official-module SDK plus detached frozen contribution assembly, without a writable integrated Session.
3. CVN-6, after CVN-2, owns the same-Assembly integrated factory/bus/gateway/replay path, module effects, validation/classification, availability, diagnostics, migration and events defined here.
4. CVN-5, after CVN-2/CVN-3/CVN-4/CVN-6, owns bounded Core/module batch through the same transaction owner.
5. CVN-7 qualifies the complete Core VNext baseline. GD-1/GD-3/GD-4 Guitar-owned schema, command and conformance work is replanned only after CVN-7.

The former generic GD-2 label is fully mapped to CVN-1/CVN-2/CVN-6/CVN-5 and does not authorize a duplicate Core seam. This ownership mapping changes no public declaration in this specification.

Any requirement for a Core-to-Guitar import, second transaction/history/event owner, public patch API, runtime registration/unload, whole-document history snapshot, persisted Core schema change, or UI/render/playback/physical-I/O behavior stops the active downstream task and returns it to planning.

## CVN-5 Integrated Batch Consumer Projection (Not Active)

CVN-5 consumes, but does not redesign, the eventual accepted CVN-6 integrated assembly. A mixed batch routes each raw child through that one assembly, applies accepted Core or contribution-owned effects to one candidate, and invokes applicable module validators/classifiers once for the final candidate in frozen catalog order. Child index orders route/preparation/effects/affected facts/failure attribution; it does not create per-child assessments. Undo/redo use stored owned effects, replay reroutes semantic child envelopes through the current compatible assembly, and the aggregate event source remains Core. CVN-2's nine-field ABI, SDK `8/34`, catalog compiler and installed-only catalog state remain exact.
