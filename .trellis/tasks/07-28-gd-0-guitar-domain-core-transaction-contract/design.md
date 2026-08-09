# GD-0 Guitar Domain / Core Transaction Integration Design

> **Status:** ACCEPTED DOCUMENTATION / ARCHITECTURE CONTRACT
> **Planning base:** `064dc2bffe26022bc58f0690986b09a0c6a257aa`
> **Production implementation:** separately gated; this accepted contract activates none

## 1. Architectural Intent

Brilliant Guitar uses a microkernel architecture. Core remains a small, domain-neutral transaction kernel; official notation domains attach through narrow, versioned, startup-frozen contracts.

The seam must support an atomic Guitar edit without making the kernel understand strings, frets, tuning, slide, bend, or vibrato. The same mechanism must remain usable by future official domains without adding domain imports or parallel transaction runtimes.

```mermaid
flowchart LR
    UI["Product / Editor module"] --> PORT["CommandBus.submit(unknown)"]
    PORT --> CAT["Frozen compiled contribution catalog"]
    CAT --> CORE["Core command contribution"]
    CAT --> GUITAR["Guitar command contribution"]
    CORE --> TX["Single Core transaction engine"]
    GUITAR --> TX
    TX --> STATE["One document version and history"]
    TX --> EVENTS["One dirty / checkpoint / event sequence"]
```

Dependency direction:

```text
Product composition root -> Core public contracts
Product composition root -> Guitar Domain
Guitar Domain            -> Core public contracts
Core                      -> no Guitar Domain import
```

## 2. Responsibility Boundary

### Kernel-owned mechanisms

- detached initial state and candidate isolation;
- immutable startup catalog binding;
- strict top-level command routing;
- atomic effect application and rollback;
- document version and history invariants;
- undo, redo, deterministic semantic-command replay;
- checkpoint and dirty-state transitions;
- ordered post-commit event publication;
- total synchronous/asynchronous exception isolation;
- public result detachment and privacy-safe failure conversion.

### Domain-contribution-owned policy

- versioned command IDs, target kinds, and payload schemas;
- strict domain envelope/payload decoding after catalog routing;
- domain target and ownership resolution;
- deterministic effect preparation through domain-neutral effect capabilities;
- GuitarExtension interpretation and domain semantic validation;
- product-profile support classification;
- stable domain diagnostics and affected-entity facts.

### Forbidden coupling

- Guitar-specific cases in Core command, mutation, event, or validation switches;
- Core imports from Guitar Domain;
- domain access to mutable kernel documents, history entries, or event sequence state;
- public JSON Patch, JSON paths, splice/index mutation, or whole-document replacement;
- a Guitar-only transaction engine, history, replay log, dirty state, or event bus;
- runtime contribution registration, unloading, or arbitrary third-party callbacks.

## 3. Decision Record

### GD0-D001 — One public command submission port

**Plan decision status:** USER APPROVED 2026-07-28; documentation acceptance pending.
**Decision:** Core and installed official domain commands are submitted through the existing `CommandBus.submit(unknown)` and `KernelModuleGateway.submit(unknown)` public entry points.

The active session binds one immutable compiled contribution catalog. The port performs safe top-level routing, then delegates strict decoding and domain policy to the matching trusted compiled contribution. All accepted commands enter the same transaction engine.

**Why this fits the product:**

- preserves one write boundary for a modular microkernel application;
- keeps UI and product modules independent of kernel-internal routing;
- prevents each domain from creating its own façade and lifecycle semantics;
- makes one history, replay, dirty, and event contract the default rather than a convention;
- gives future official notation domains the same bounded seam.

**Rejected alternative:** a public `GuitarCommandGateway.submit()` façade. Although it would reduce the visible change to the existing Core submission type, it would multiply public write ports and encourage domain-specific lifecycle behavior.

**Compatibility constraint:** the exact result and TypeScript typing strategy must keep the six accepted Core commands behaviorally compatible. GD0-D002 below fixes the modular assessment shape while preserving that Core-only surface.

### GD0-D002 — Modular result, support, and error contract

**Plan decision status:** USER APPROVED 2026-07-28; documentation acceptance pending.
**Decision:** use an extensible, domain-neutral result contract. Core does not enumerate Guitar error or support codes.

The public write method remains `submit(unknown)`, but its compile-time result is selected by the catalog-bound bus type:

- Core-only construction retains the existing `CommandResult` contract and runtime shape for the six Core commands.
- Integrated construction exposes a `KernelCommandResult` common envelope with the same status/version/history fields, Core support, and a deterministically ordered, deeply frozen module result collection.
- A Core-only command submitted through an integrated bus still returns the integrated envelope because installed validators and profiles may classify cross-domain invariants.

The following minimum public names, fields, and discriminants are frozen by GD-0. Later implementation tasks may choose private class/module layout but do not rename or widen this surface without returning GD-0 to planning:

```typescript public-contract
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
```

The integrated failure union extends accepted Core `CommandFailure` only with the six exact domain-neutral mechanism codes fixed in section 7.3. Domain-specific meaning is carried by frozen module issues whose source includes `moduleId` and `contributionId` and whose codes belong to that module's registered namespace.

The object-oriented construction model is:

```text
Error
└─ KernelErrorBase<Code>
   ├─ CoreOperationError<Code>
   ├─ KernelInfrastructureError<Code>
   └─ ModuleKernelErrorBase<ModuleId, Code>
      └─ GuitarDomainError<Code>
```

- Core V1.1 exports only the narrow base contract needed by trusted official modules.
- Guitar Domain derives its typed internal errors without requiring Core to import Guitar codes.
- Every error converts through `toIssue()` to detached, deeply frozen data.
- Public command APIs return result data and never expose or throw these instances.
- Module issue codes and message keys are namespace-qualified and validated when the contribution catalog is compiled.

**Compatibility strategy:** preserve the existing Core-only constructor/factory and `CommandResult`; introduce an additive catalog-bound integrated bus/factory using the same class and submit method rather than widening every Core-only caller to an open module union.

**Rejected alternatives:**

- adding every `guitar.*` code to Core-owned `CommandFailure`/`KernelIssueCode`, which couples Core releases to domain policy;
- collapsing all domain failures into `module.internal-error`, which loses actionable semantic diagnostics and support classification;
- returning live `Error` subclasses publicly, which leaks runtime behavior and undermines deterministic detached results.

### GD0-D003 — Complete installed-domain validation

**Plan decision status:** USER APPROVED 2026-07-28; documentation acceptance pending.
**Decision:** after Core semantic validation succeeds, run every installed domain semantic validator in the deeply frozen catalog order for every changed candidate.

The authoritative lifecycle is:

| Path | Semantic validation | Support classification | State effect |
|---|---|---|---|
| Initial construction | Core, then every installed exactly compatible domain; missing/incompatible requirements are explicit `incomplete` facts | Core, then compatible domains only | Create writable only when complete and semantic-valid; otherwise create lossless read-only when Core-valid but incomplete |
| Changed submit | Core, then all installed domains | Core, then all installed domains | Commit once only after all phases finish |
| No-op submit | Current state is already invariant-valid | Core, then all installed domains | No version/history/redo/dirty/event change |
| Undo | Apply full inverse to candidate; Core, then all installed domains | Core, then all installed domains | Move history atomically |
| Redo | Apply full forward to candidate; Core, then all installed domains | Core, then all installed domains | Move history atomically |
| Replay | Same catalog and submit lifecycle | Same catalog order | Deterministic detached result |

Rules:

- Domain validators receive only a detached read view plus their versioned contribution context; they receive no mutable candidate reference.
- If Core semantics fail, domain validators are skipped because their precondition is a coherent Core score.
- If Core passes and validation availability is complete, all installed compatible domain validators run and their returned semantic issues are collected in catalog order before rejection, so callers receive a complete deterministic report.
- A thrown/rejected validator is not a semantic diagnostic. It becomes a stable contribution-internal failure at that catalog position and the complete pre-operation state is retained.
- Support classifiers run only for a semantically valid state. Core profile classification runs first, followed by every installed compatible domain profile in catalog order. An incomplete read-only session may expose available Core facts but never labels the combined domain assessment complete.
- `unsupported` is reportable and committable; `invalid` is a transaction rejection.
- Classification completes before the commit becomes externally visible. A classifier failure therefore leaves document, version, history, dirty state, and event sequence unchanged.
- Direct Core pitch edits are checked by Guitar validation whenever Guitar is installed, which prevents stale placement from surviving a generic pitch-only command.
- If a required domain validator is absent or schema-incompatible, it is not silently skipped: construction produces a lossless read-only integrated session whose public validation availability is `incomplete` with stable facts. Only a complete validation result may be described as domain-semantically valid.
- Optimization by declared invalidation triggers is deferred. A later optimization must prove result equivalence against the all-validator model and cannot change ordering or visible classifications.

**Rejected alternative:** trigger-selected validators. It could reduce work but introduces a second correctness contract for dependency declarations; a missed trigger could commit cross-domain inconsistency.

### GD0-D004 — One unified committed event per transaction

**Plan decision status:** USER APPROVED 2026-07-28; documentation acceptance pending.
**Decision:** every committed submit/undo/redo produces one domain-neutral `core.document.committed` fact, regardless of how many Core-owned or domain-owned effects the transaction contains.

Integrated sessions use this exact public domain-neutral identity:

```typescript
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
```

The integrated committed event retains the accepted event version, event sequence, document ID/version, cause, and affected `ScoreAddress` facts, while replacing the closed `CoreCommandId` identity with the catalog-validated modular identity. Core-only sessions retain the existing `KernelEvent` runtime and compile-time shape; integrated sessions expose an additive modular event type.

Affected-fact rules:

- The command contribution returns detached affected-address facts as part of deterministic command preparation; event derivation does not reopen or reinterpret private domain payloads after commit.
- The kernel validates every fact against the previous or committed document as appropriate for insert/remove/undo/redo.
- The kernel canonicalizes, deduplicates, clones, and deeply freezes the complete address set before state becomes externally visible.
- A Guitar placement command reports at least the affected note and the Part that owns the mutated GuitarExtension.
- Unknown address kinds, duplicate-identity ambiguity, ownership mismatch, getter execution, contribution failure, or event-sequence overflow rejects the complete session transition with the stable integration failure and preserves the prior state.
- No-op and rejected commands publish no committed event.
- If dirty state changes, one `core.session.dirty-state-changed` event follows the committed event at the next sequence number.
- Handler exceptions remain post-commit isolated as established by K1-3; they neither roll back the commit nor interrupt later handlers.

**Rejected alternative:** separate Core and Guitar committed events. Multiple commit facts for one transaction would make subscribers reconstruct atomic grouping and would complicate sequence reservation, rollback, undo/redo, and replay equivalence.

### GD0-D005 — Lossless read-only degradation for a missing or schema-incompatible required domain

**Plan decision status:** USER APPROVED 2026-07-28; documentation acceptance pending.
**Decision:** when a document contains a known official extension and the immutable requirement cannot be satisfied by an exactly schema-compatible contribution, create a detached, lossless read-only integrated session rather than allowing unvalidated writes or rejecting all access.

The composition root supplies this frozen public compatibility declaration:

```typescript public-contract
interface ExtensionRuntimeRequirementV1 {
  readonly requirementVersion: 1;
  readonly namespace: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly requiredForWrite: true;
}
```

`supportedSchemaVersions` is a non-empty, strictly ascending, duplicate-free list of positive safe integers. Compatibility is exact: an `ExtensionBlock.schemaVersion` is compatible only when it equals one listed value. The declaration is metadata; Core contains no Guitar namespace or module ID. Session construction compares each declared namespace in the document with the immutable requirements and compiled catalog without executing contribution code.

Compatibility resolution is deterministic:

| Document/requirement state | Executable contribution | Result |
|---|---|---|
| No block for the declared namespace | absent or present | No availability gap for that namespace. |
| Block version is listed | absent | `required-contribution-unavailable`; integrated read succeeds but validation is incomplete and writes are read-only. |
| Block version is listed | present and identity-compatible | The contribution enters the exact call-count matrix; command/effect handlers execute only for an accepted writable operation, and validation becomes complete only after the required validator pass succeeds. |
| Block version is not listed | absent or present | `required-contribution-incompatible`; integrated read succeeds but validation is incomplete and writes are read-only. No handler for that contribution may execute against the block. |
| Block uses a future schema version | absent or present | The same incompatible result; the kernel does not guess, downgrade, or implicitly migrate it. |

Schema compatibility is evaluated before executable availability, so an unsupported/future version always yields the stable incompatible fact even when the declared contribution is also absent. Every missing or incompatible required contribution places the session in lossless read-only mode. The complete uninterpreted target `ExtensionBlock`, including namespace, `schemaVersion`, owner, and nested payload, remains deeply equal in JSON-value semantics through decode/encode/read/replay rejection; physical byte identity is outside Core.

Compatibility is resolved per persisted `ExtensionBlock`, not once per namespace or contribution. When one contribution faces both an exactly compatible block and an incompatible/future block, GD-0 fixes a **block-scoped compatible view**:

- the incompatible/future block is never passed to that contribution's decoder, validator, classifier, command handler, effect handler, or affected-fact handler;
- an installed contribution with zero exactly compatible blocks receives zero validator and zero classifier calls during that pass;
- an installed contribution with one or more exactly compatible blocks receives exactly one validator call during every applicable pass, using a detached input containing Core score read data plus only those blocks in canonical extension-owner order;
- after every applicable validator succeeds and the classification phase begins, each such contribution receives exactly one classifier call with the same filtered view; if any validator returns semantic issues, throws, or violates its contract, the classification phase does not begin and every classifier receives zero calls;
- the integrated session is still read-only and its validation availability remains `incomplete`, because the incompatible fact describes semantics that were not validated;
- submit, undo, redo, and non-empty replay reject at availability preflight, so no command/effect/fact handler runs in this degraded session;
- the excluded block's namespace, owner, `schemaVersion`, and complete nested payload remain JSON-semantically unchanged. CVN-2/CVN-6 finalize the private handler-input type name and class layout, but an unfiltered document or incompatible block may not be exposed as a substitute.

The exact call-count matrix is frozen for every applicable pass:

| Pass/state | Compatible blocks for the contribution | Validator calls | Classifier calls | Input and stop rule |
|---|---:|---:|---:|---|
| Initial construction or explicit validation | `0` | `0` | `0` | no contribution view is built |
| Initial construction, explicit validation, changed candidate, undo, redo, or replay candidate | `>= 1` | exactly `1` | exactly `1` only after all applicable validators succeed and classification begins | both calls receive the same canonical-owner-ordered filtered compatible view |
| Any applicable pass where a validator returns semantic issues, throws, or violates its contract | `>= 1` | exactly `1` per applicable contribution | `0` for every contribution | classification does not begin; state remains unchanged |
| Read-only submit, undo, redo, or first replay write | any | operation-phase `0` | operation-phase `0` | availability preflight rejects before validation/classification; write handlers also receive `0` calls |

Read-only degraded behavior:

- decode, encode, snapshots, selectors, ownership/range reads, incomplete validation reports, and opaque extension round-trip remain available;
- integrated reads expose both stable write availability and stable validation availability facts;
- submit, undo, and redo reject at the same availability preflight before command decoding, history checks, or effect processing, using the deterministic mixed-gap failure rule in section 7.4 and leaving state unchanged;
- no incompatible decoder, validator, classifier, command handler, effect handler, or fact generator executes;
- checkpoint marking remains available because it changes session bookkeeping rather than document content;
- integrated replay applies the same availability preflight to each attempted command; an empty sequence may replay unchanged, while the first attempted write rejects with the deterministic mixed-gap failure code, detached unchanged initial document, and the same complete fact list;
- installing an exactly compatible contribution and reopening permits complete validation and may restore writability;
- the kernel never deletes, rewrites, guesses, or implicitly migrates unavailable or incompatible extension data.

Unknown extension compatibility remains unchanged: an undeclared opaque namespace is preserved under Core V1 rules and does not automatically trigger read-only mode. This avoids converting existing forward-compatible documents into write-blocked documents. Official domains that require invariant enforcement must ship an immutable versioned requirement even when their executable contribution is absent.
**Rejected alternatives:**

- allowing Core writes while the required validator is absent, which can create contradictory Core pitch and Guitar placement state;
- rejecting document opening entirely, which prevents inspection and lossless preservation during a missing/corrupt module installation.

## 4. Startup Composition Shape

The intended lifecycle is:

1. The product composition root selects trusted, version-compatible official contributions.
2. Core compiles and validates the contribution manifests once.
3. Duplicate IDs, unsupported contract versions, malformed manifests, invalid namespaces, or capability conflicts fail session construction with stable errors.
4. The compiled catalog and all nested records are deeply frozen.
5. `CommandBus`, replay, undo/redo validation, and the module gateway bind the same catalog identity for that session.
6. No registration, replacement, or removal occurs after session construction.

The catalog is configuration data plus statically linked official behavior. It is not a general plugin runtime and does not accept network code, scripts, or arbitrary late-bound handlers.

## 5. Unified Submission Flow

The stable integrated flow is:

1. Inspect the hostile `unknown` envelope descriptor-first without invoking getters.
2. Read the versioned command ID and resolve exactly one frozen contribution.
3. Strictly decode the complete command through that contribution; reject extra fields and malformed targets/payloads.
4. Resolve targets and prove ownership against a detached current state.
5. Prepare deterministic domain-neutral forward effect requests and affected-address facts.
6. Let the kernel validate each request, derive its inverse from the current candidate, and apply the complete forward effect set to one isolated candidate.
7. Run Core validation and every installed domain validator in the approved order.
8. Classify Core and domain product-profile support.
9. Commit once, increment the document version once, create one history entry, update dirty/checkpoint state, and publish one ordered post-commit event sequence.

Any failure before step 9 preserves the complete pre-submit state.

## 6. Product Decision Status

GD0-D001 through GD0-D005 are user-approved plan decisions. This synchronized document remains a review candidate until independent acceptance; the remaining sections derive repository-answerable technical mechanics without claiming an accepted baseline.

## 7. Public Integration Contracts

### 7.1 Core-only and integrated construction

`CommandBus.create(initialDocument)` and `replayCoreCommands()` retain their accepted Core V1 types and runtime behavior.

GD-0 freezes the following minimum public construction surface. `KernelIntegratedCatalog` is an opaque, deeply frozen handle produced only by the separately approved official-catalog compiler; application callers cannot construct or mutate its bindings.

```typescript public-contract
declare const kernelIntegratedCatalogBrand: unique symbol;

interface KernelIntegratedCatalog {
  readonly [kernelIntegratedCatalogBrand]: true;
}

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
```

`IntegratedCommandBus` is a catalog-bound view of the existing bus implementation. It exposes the same method names—`submit`, `undo`, `redo`, `read`, `markPersisted`, and `subscribe`—with integrated result/read/event types. It is not a second runtime, state object, or history owner.

The root API exposes application-facing integrated data contracts and construction. Official module authoring helpers live in a separate versioned module-SDK entry point so application consumers do not receive internal effect/error builders.

### 7.2 Command identity and routing

The catalog owns a unique mapping from command ID to one compiled definition:

```typescript
interface KernelCommandDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly commandId: string;
  readonly commandVersion: 1;
  readonly source: KernelCommandIdentity["source"];
  readonly targetKind: ScoreEntityTarget["kind"];
  readonly requiredCapabilities: readonly KernelCapability[];
  readonly titleKey: string;
}
```

- IDs use the existing dotted lowercase namespace grammar and are globally unique within the assembly.
- The six existing `core.*` IDs remain unchanged.
- Guitar IDs use a domain namespace owned by the Guitar contribution.
- Top-level routing reads only exact data descriptors for `commandVersion` and `commandId`; accessors, Proxies, sparse arrays, extra fields, invalid prototypes, and cycles produce stable rejection without executing user code.
- Unknown ID and unsupported version remain distinct failures.
- The matched contribution strictly decodes the full target and payload from `unknown`; decoded commands and payloads are cloned and deeply frozen before preparation/history use.

### 7.3 Modular result and issue data

The integrated result uses the D002 assessment model. The closed additional mechanism failures are:

- `command.required-contribution-unavailable`;
- `command.required-contribution-incompatible`;
- `command.contribution-semantic-invalid` with frozen module issues;
- `command.contribution-contract-violation` for malformed prepared effects/facts;
- `command.contribution-internal-error` for unexpected contribution exceptions or Promise-like returns from synchronous transaction hooks;
- `command.assembly-mismatch` for a forged/cross-catalog integrated invocation.

Existing Core failures keep their codes and facts. Domain-specific meaning stays inside namespace-qualified `ModuleKernelIssue` values. Ordering is Core issues first, then module assessments/issues in frozen catalog order and validator-return order.

The official module SDK exposes a narrow `ModuleKernelErrorBase` derived from the internal object-oriented error foundation. Domain subclasses may add only allowlisted detached code/source/location/details data and must convert through `toIssue()`. The application-facing Core root continues to omit runtime error classes and returns data-only results.

### 7.4 Write and validation availability

Integrated reads add detached, deeply frozen write and validation availability using these exact public discriminants:

```typescript public-contract
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
```

Facts are deduplicated and sorted by namespace, owner identity, extension schema version, module, contribution, and reason. `supportedSchemaVersions` is copied from the canonical requirement. Facts contain no extension payload, filesystem path, stack, handler, or raw error. `complete` means every known required official-domain block has an installed exactly compatible validator and all of those validators completed; Core-only semantic validation with any fact above is always exposed as `incomplete`, never as complete domain-semantic validity.

Availability failure selection is one deterministic preflight shared by `submit`, `undo`, `redo`, and every attempted integrated replay command:

1. Canonicalize the complete availability fact list without dropping either reason.
2. If at least one fact has reason `required-contribution-incompatible`, return `command.required-contribution-incompatible`.
3. Otherwise, because the list is nonempty, return `command.required-contribution-unavailable`.
4. In both branches, `failure.facts` is the full canonical list and is deeply equal to the facts exposed by the read/replay availability values; the failure code summarizes the highest-priority reason and does not filter the facts.

| Canonical availability facts | submit / undo / redo / first replay write | Facts returned |
|---|---|---|
| unavailable only | `command.required-contribution-unavailable` | full unavailable list |
| incompatible only | `command.required-contribution-incompatible` | full incompatible list |
| unavailable + incompatible, in any input order | `command.required-contribution-incompatible` | full mixed canonical list |

This availability guard runs before command decoding and before empty-history checks, so all four write paths use the same code/facts relation and preserve the complete pre-call state. Empty integrated replay remains the sole no-write case and may return `replayed` unchanged with read-only/incomplete availability.

The same two availability values appear on integrated replay results and every public integrated validation report/read. Unknown undeclared opaque extensions remain outside this official-domain completeness claim and retain Core V1 preservation behavior.

### 7.5 Registry gateway surface

The existing Core overload/result remains unchanged. An integrated bus uses this additive overload and exact result discriminants:

```typescript public-contract
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
```

The interface merge above is an additive **instance overload** on `KernelRegistry`; it does not create a static factory. `Omit` replaces only the four state/result-bearing methods, so the accepted K1-4 `summary`, every typed `select` overload, and `subscribe` remain present with their existing capability gates and result types. Both factory and gateway reject cross-catalog/Core-only pairings with stable data-only failures before exposing a writable session.

## 8. Compiled Domain Contribution ABI

### 8.1 Assembly boundary

The product composition root imports statically linked official compiled entries and passes them beside the strict startup manifest. The manifest selects descriptors; it never carries functions. A compiled entry must match the selected official/system-trusted module identity and registration entry ID before binding.

The additive registration entry is `kernel.domain-commands.v1`. It reuses the accepted `command:register`, `command:execute`, `score:read`, and `event:subscribe` capabilities; GD-0 adds namespace ownership metadata rather than a generic document-mutation capability.

The official module SDK candidate uses this minimum versioned contribution shape; CVN-2 finalizes SDK/catalog handler signatures and private builders, while CVN-6 finalizes writable runtime binding without changing the public application-facing contracts fixed in section 7:

```typescript
interface CompiledDomainCommandContributionV1 {
  readonly apiVersion: 1;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly extensionNamespaces: readonly string[];
  readonly extensionRequirements: readonly ExtensionRuntimeRequirementV1[];
  readonly commands: readonly CompiledDomainCommandDefinitionV1[];
  readonly validate: DomainSemanticValidatorV1;
  readonly classify: DomainSupportClassifierV1;
  readonly effects: readonly CompiledModuleEffectDefinitionV1[];
}
```

The functions are direct, trusted, official code bindings supplied at startup, not values decoded from an untrusted manifest. They remain inside the compiled catalog and never appear in registry summaries, reads, events, reports, or public history.

### 8.2 Catalog compilation

Catalog construction is isolated and all-or-nothing. It validates:

- exact descriptor/manifest fields and API versions;
- official origin, allowed runtime, system trust, and required capabilities;
- unique module, contribution, command, effect-kind, and extension-namespace ownership;
- command ID namespace ownership and target kind;
- matching compiled handler/descriptor counts and identities;
- frozen profiles, compatibility requirements, and effect definitions. Each compiled binding must match its selected `ExtensionRuntimeRequirementV1` identity and exact supported-version list; mismatch fails catalog construction before any handler is callable;
- absence of runtime mutation APIs.

The successful catalog, nested arrays/records/profiles/descriptors, and compatibility declarations are deeply frozen. Construction failures expose only stable registry facts. Function closure purity is enforced through design review and deterministic/hostile-state tests; mutable global profiles are forbidden.

The integrated registry, bus, gateway, and replay runtime must share the same internal assembly identity. An integrated gateway cannot be paired with a Core-only bus or a bus created from another catalog; construction rejects with a stable assembly-mismatch failure. This identity is process-local invariant state, not a public/persisted/random catalog ID.

### 8.3 Domain reads

Decoder, preparation, validator, classifier, effect, and affected-fact code receive detached read-only inputs. They do not receive `CommandRuntimeState`, `KernelSessionState`, mutable `ScoreDocument`, history entries, subscribers, registry state, or the active `CommandBus`.

## 9. Atomic Effect-Set and History Design

### 9.1 Private effect algebra

Core V1.1 replaces the private single `CoreMutation` slot with a private nonempty `KernelEffectSet`. This type remains absent from every public root, event, result, report, snapshot, codec, and persisted format.

The initial effect algebra is deliberately narrow:

```typescript
type KernelEffect =
  | ReplaceWrittenPitchEffect
  | ExistingCoreEffect
  | ModuleExtensionEffectEnvelope;

interface ModuleExtensionEffectEnvelope {
  readonly effectVersion: 1;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly namespace: string;
  readonly owner: ExtensionOwner;
  readonly effectKind: string;
  readonly payload: JsonObject;
}
```

- Existing Core commands compile to one-element effect sets.
- The first domain-to-Core request surface exposes only the Core-owned `WrittenPitch` replacement needed by Guitar placement; broader Core mutation requests require later approval.
- Module effects may address only an extension namespace owned by their compiled contribution and only the declared score/Part owner.
- Module effect payloads are strict versioned internal data, not JSON Patch or JSON path instructions.
- The module effect implementation transforms only its owned ExtensionBlock and returns a detached replacement; the kernel installs it into the isolated candidate while preserving every other block and subtree.

### 9.2 Inverse derivation

The contribution prepares forward requests only. For every accepted request, the kernel or owning compiled effect definition derives the inverse from the current candidate before forward application:

- Core effects derive inverse values by resolving the current stable entity.
- Module effects derive a fine-grained inverse payload from the current owned extension through the same compiled effect definition.
- Inverse effects are stored in reverse application order.
- No full-document before/after snapshot is stored.
- A Guitar placement history entry therefore holds one Core pitch delta plus one Guitar placement delta, not a complete score or generic extension patch.

Effect preparation rejects empty changed sets, duplicate/conflicting targets, wrong namespace owners, missing targets, unsafe IDs, malformed payloads, non-detached results, invalid inverses, and effect/application exceptions before visible commit.

### 9.3 Candidate application and no-op

Effects apply sequentially to one isolated candidate. Any failure discards the candidate. After all effects apply:

- if the candidate is deeply equal to current state, the result is no-op;
- no-op leaves version, history, redo, dirty, checkpoint, and events unchanged and returns current integrated support classification;
- otherwise the complete validation/classification/event-candidate pipeline runs before the state reference is adopted.

### 9.4 History entry

One committed semantic command creates one internal history entry containing:

- deterministic history sequence;
- cloned/frozen decoded semantic command;
- frozen command identity and contribution identity/version;
- nonempty forward effect set;
- inverse effect set in reverse application order;
- frozen affected-address facts sufficient for submit/undo/redo event derivation.

It contains no timestamp, random ID, whole-document snapshot, mutable handler, stack, file path, registry object, or public patch.

Undo and redo apply the full inverse/forward set to an isolated candidate, validate/classify all installed domains, reserve event facts, and only then move the history entry between stacks. Any effect, validation, classification, fact, or sequence failure returns `history.invariant-violation` with the entire previous state retained.

## 10. Validation, Classification, and Failure Boundary

Each contribution call has its own total sync/async exception boundary. Async return values are permitted only for post-commit event handlers; command decode, preparation, effects, validation, classification, and fact generation are synchronous pure functions so submit/undo/redo remain deterministic and atomic.

Changed-candidate order:

1. Core semantic validation.
2. Every installed exactly schema-compatible domain semantic validator in catalog order; collect returned issues. Missing/incompatible requirements never enter this write pipeline because availability rejects first.
3. Reject when any semantic issue exists.
4. Core feature-profile classification.
5. Every installed domain profile classifier in catalog order.
6. Prepare and validate unified event facts and reserve event sequences.
7. Adopt document/version/history/read/event state once.
8. Publish the deeply frozen events; handler failures stay isolated post-commit.

The transaction remains invisible until step 7. Unsupported profile issues are warnings and do not block step 7. Invalid or thrown classifier results reject before step 7.

## 11. Replay Contract

`replayCoreCommands()` stays unchanged. GD-0 freezes this additive public replay signature and result discriminants:

```typescript public-contract
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

- It binds the same `KernelIntegratedCatalog` contract used by live integrated construction.
- It replays decoded semantic commands only; internal effects, undo/redo session logs, events, timestamps, and history snapshots are not replay input.
- The same initial document, catalog, and accepted command sequence produce deeply equal final documents, result/status/version sequences, module assessments, availability facts, and failure index.
- Results/final document are detached from the catalog and any live bus.
- A required unavailable or schema-incompatible contribution produces read-only/incomplete availability. An empty sequence may return `replayed` with the detached unchanged document; the first attempted write returns `rejected` at its exact index using the same mixed-gap priority and full fact list as submit/undo/redo, without executing an incompatible handler.
- Input commands and catalog/profile objects are cloned/frozen or safely read so later caller mutation cannot change results.

## 12. Event Fact Design

The command preparation result includes affected `ScoreAddress` facts rather than a callback that reinterprets the committed document. The kernel validates facts against the previous/committed candidates, applies canonical ordering/deduplication, and stores the frozen facts with history.

- Submit and redo use the forward fact set.
- Undo uses the same entity identities and cause `undo`; inserted/removed identities remain available from the stored semantic command/facts.
- Guitar placement includes `note` and owning `part`.
- One `core.document.committed` precedes an optional dirty-state event.
- Event building remains inside the atomic session-integration boundary established by K1-3.

## 13. Compatibility and Public Boundary

- Core-only construction remains available and installs only the six accepted Core built-ins.
- Existing Core command results, no-op behavior, version increments, history depth, replay results, public events, root exports, and ordering remain behaviorally equal.
- Integrated construction is additive and binds official domain contributions before the session begins.
- The exact minimum public names and discriminants are `KernelIntegratedCatalog`, `CommandBus.createIntegrated`, `IntegratedCommandBusCreationResult`, `IntegratedCommandBus`, `IntegratedKernelReadState`, `KernelWriteAvailability`, `KernelValidationAvailability`, the integrated `KernelRegistry.createGateway` overload/result, and `replayKernelCommands`/`ReplayKernelCommandsResult`. Later tasks design private handlers/builders, not substitutes for this surface.
- Persisted documents retain opaque extension preservation whether or not an interpreting contribution is installed.
- The application-facing root exports integrated factories/data contracts but omits compiled handlers, private effects, history entries, module effect payload decoders, mutable catalog objects, and error classes.
- The official module SDK is a separate reviewed entry point. It exposes only descriptor/building types, restricted effect requests, issue/error construction, and read-only contribution contexts required by official modules.
- Existing forbidden-dependency and public-boundary tests are extended rather than weakened.
- Every authoritative public declaration fence is tagged `typescript public-contract` and compiled by the Layer A docs-only fixture at `contract-fixtures/verify-public-contracts.mjs`, which uses only a syntax/name-resolution prelude and must report zero parse/type diagnostics. The independent Layer B no-emit assertion at `contract-fixtures/real-core-drift-assertions.ts` imports the accepted Core root and must prove the real `KernelGatewayResult` discriminants, Registry instance gateway method, full typed selector surface, `summary`/`subscribe`, shared `CommandBus` methods, `MarkPersistedResult`, and `EventSubscriptionResult` have not drifted. Neither layer alters product `tsconfig` or production tests.
- CVN-6 downstream fixtures must include (a) mixed unavailable+incompatible facts and equal failure selection/full facts across submit, undo, redo, and first replay write, and (b) one contribution with compatible and incompatible/future blocks at different owners. For (b), assert `0/0` validator/classifier calls when no compatible block exists; exactly `1/1` over the same canonical filtered view after total validator success; exactly `1/0` when validation returns issues, throws, or violates its contract; operation-phase `0/0/0` validator/classifier/write calls on read-only submit/undo/redo/first replay write; zero incompatible-block calls; and lossless excluded payload.
- The Core V1.1 domain runtime seam is isolated across accepted CVN-1 plus CVN-2/CVN-6/CVN-5; no legacy label owns a duplicate path. CVN-6 and final CVN-7 qualification rerun every relevant K1-2 through K1-6 and accepted Core VNext gate.

The Brilliant Guitar product composition root always uses integrated construction for product documents. The retained Core-only constructor is the compatible low-level Core API for generic Core consumers/tests; it is not the product path for a document whose official domain compatibility requirements are known.

## 14. Security, Privacy, and Determinism

- All public `unknown` inputs use descriptor-first, no-getter, no-throw decoding; the accepted P3 guard repair is a Core V1.1 prerequisite.
- No contribution can obtain the active bus, mutable candidate, registry internals, history, subscribers, filesystem, clock, randomness, network, or platform APIs through the ABI.
- Stable public failures contain only allowlisted module/contribution/namespace IDs, codes, locations, and JSON details.
- Profiles, descriptors, compatibility declarations, issues, assessments, results, events, reads, and replay output are detached and deeply frozen.
- Catalog order is explicit and deterministic; object enumeration order, registration timing, wall clock, random values, and handler identity never determine observable output.
- Unknown/non-target extension data preserves exact JSON-value semantics through submit, reject, no-op, undo, redo, replay, read-only degradation, and codec round-trip; physical byte identity remains outside Core.

## 15. Forward-Evolution Boundary

The six `typescript public-contract` fences above define the exact GD-0 V1 application-facing construction, result, availability, gateway and replay contract. CVN-2 and CVN-6 implement that V1 contract through separately reviewed gates; this section adds no declaration, field, export, command, effect kind or persisted-schema behavior to those fences.

Later module capabilities use additive and explicitly versioned lanes rather than widening the published V1 shape in place:

- a module that must orchestrate multiple Core structure operations uses a future typed, bounded operation-expansion registration/API version; CVN-5 batch remains the current cross-boundary composition path;
- domain-specific reads use a future detached, deeply frozen and bounded Selector contribution contract;
- finer Extension owner granularity or block identity uses a new Score schema version and explicit pure-data migration; `brilliant-score-1` and score/Part ownership remain unchanged here;
- installation, upgrade, disable and rollback belong to a future Module Package Host that builds a new immutable Assembly generation for new Sessions; an active Session stays pinned to its creation generation;
- Renderer, Playback, Import/Export, Analysis and UI integrations use dedicated Product Host/Adapter contracts, Snapshot/Selector reads and Command/Gateway writes.

Every future lane requires its own owner, contract/registration ID, version, capability, failure, compatibility, migration, Session lifecycle, resource caps, fixtures, tests, user approval and independent acceptance. The single Core document and transaction/history/replay/event owner, frozen Session Assembly, exact compatibility model, detached module views and data-only failures remain binding across lanes. Generic patch, mutable document access, whole-document replacement, second transaction owner and ready-Assembly register/unregister/replace remain excluded.

These reservations are outside GD-0 acceptance and outside CVN-2/CVN-6 V1 implementation. Their purpose is to keep a known additive route open without turning speculative signatures into current API.

## 16. Rollout and Rollback

GD-0 itself produces contract documents only. The approved Core-first roadmap delivers the generic mechanism before Guitar-owned implementation, with every gate independently reviewed:

1. CVN-0, already accepted and archived, owns the former CK1.1-0 hostile-input guard prerequisite.
2. CVN-1, already accepted and archived, owns the behavior-preserving command/transaction/Registry spine and private effect-set foundation.
3. CVN-2, after GD-0 acceptance and separate planning approval, owns the official module SDK plus all-or-nothing frozen contribution assembly; it exposes no writable integrated Session.
4. CVN-6, after CVN-2 acceptance, owns the assembly-bound integrated factory/bus/gateway/replay path, domain validation/classification, diagnostics, compatibility, migration, read-only degradation and unified event behavior fixed by GD-0.
5. CVN-5, after CVN-2/CVN-3/CVN-4/CVN-6 acceptance, owns the bounded cross-module batch extension through the same transaction owner.
6. CVN-7 qualifies the complete Core VNext baseline. Only then are GD-1, GD-3 and GD-4 replanned for Guitar-owned schema, commands and conformance. The former generic GD-2 label is fully consumed by CVN-1/CVN-2/CVN-6/CVN-5 and is not recreated as a second Core seam.

GD-0 produces contracts only. If a later Core V1.1 candidate violates accepted Core behavior, rollback removes the additive seam and integrated factory while retaining Core-only V1 behavior and persisted extension preservation. No persisted document migration may depend on an unaccepted seam candidate.
