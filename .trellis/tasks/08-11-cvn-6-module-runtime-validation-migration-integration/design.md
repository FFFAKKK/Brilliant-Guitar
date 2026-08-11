# CVN-6 Technical Design

## 1. Design Status

`PLANNING CONTRACT / INDEPENDENT PLANNING REVIEW PENDING / PRODUCTION IMPLEMENTATION AUTHORIZATION FALSE`

This document defines the implementation boundary for `CVN-FC-112`, `CVN-FC-120`, `CVN-FC-121` and `CVN-FC-122`. It consumes accepted CVN-1 and CVN-2 behavior. Any implementation detail that changes a declaration, failure, order, cap, owner or allowlist below returns to planning.

## 2. Authority and Layer Boundary

```text
accepted CVN-2 static official entries + strict manifest
                         |
                         v
             KernelIntegratedCatalog
             - immutable public handle
             - private catalog state
             - private assemblyIdentity
                         |
           +-------------+------------------+
           |             |                  |
           v             v                  v
 integrated Registry  Integrated bus   Integrated replay
           |             |
           +------> module gateway
                         |
                         v
          existing CVN-1 session/history/event owner
```

The catalog is supplied by a composition root and is already all-or-nothing. CVN-6 never recompiles or widens its contribution ABI. It creates a session-bound consumer of that catalog. Core remains the sole document, transaction, history, replay and event authority.

The post-Core Product Host `Application Assembly` remains a separate future object. It selects Core, official-domain and service providers for a product session. CVN-6 owns only the internal catalog identity used by Core integrated runtime components.

## 3. Public Contract Closures

### 3.1 Existing GD-0 declarations

The following accepted names and fields remain authoritative:

- `KernelIntegratedCatalog`
- `ExtensionRuntimeRequirementV1`
- `KernelDomainAvailabilityFact`
- `KernelWriteAvailability`
- `KernelValidationAvailability`
- `IntegratedKernelReadState`
- `ModuleKernelIssue`
- `ModuleCommandAssessment`
- `KernelCommandAssessment`
- `KernelContributionFailure`
- `KernelCommandFailure`
- `KernelCommandBusCreationFailure`
- `KernelCommandResult`
- `IntegratedCommandBusCreationResult`
- `CommandBus.createIntegrated(initialDocument, catalog)`
- `IntegratedCommandBus`
- `IntegratedKernelModuleGatewayCreationResult`
- `KernelRegistry.createGateway(moduleId, integratedBus)`
- `IntegratedKernelModuleGateway`
- `ReplayKernelCommandsResult`
- `replayKernelCommands(initialDocument, acceptedCommands, catalog)`

Core-only constructors, results, gateway overloads and `replayCoreCommands()` remain exact.

### 3.2 Integrated Registry construction

The existing manifest overload remains available and behaviorally exact. CVN-6 adds an overload on the same runtime function:

```ts
export function createKernelRegistry(
  manifest: unknown,
): KernelRegistryCreationResult;

export function createKernelRegistry(
  catalog: KernelIntegratedCatalog,
): KernelRegistryCreationResult;
```

Runtime selection is private and deterministic:

1. an object found in the accepted CVN-2 catalog WeakMap uses integrated construction;
2. every other input follows the existing strict manifest decoder;
3. a structural catalog lookalike therefore returns `registry.invalid-startup-input`;
4. unexpected internal conditions retain `registry.internal-error`.

Integrated Registry state contains the accepted Core compiled registry state plus canonical summaries for selected official domain modules and commands. Existing selectors and their capabilities remain Core-owned. The Registry stores the catalog `assemblyIdentity` privately; it exposes no catalog or identity field.

`KernelRegistry.createGateway(moduleId, bus)` resolves overloads from private receiver/bus state:

- same authentic integrated identity: integrated gateway result;
- different authentic identity: `{ code: "registry.assembly-mismatch" }`;
- Core-only/integrated mode mismatch in either direction: `registry.assembly-mismatch`;
- structurally forged bus/receiver: existing `registry.invalid-invocation`;
- missing module or capability: existing access failures.

The check occurs before a gateway is published. An integrated gateway keeps existing `summary`, all six typed `select` overloads and `subscribe`; only submit/undo/redo/read return integrated result types.

### 3.3 Integrated event contract

```ts
export interface KernelCommandIdentity {
  readonly commandId: string;
  readonly source:
    | { readonly kind: "core" }
    | {
        readonly kind: "module";
        readonly moduleId: string;
        readonly contributionId: string;
      };
}

export type IntegratedKernelEvent =
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
```

Core-only `KernelEvent` stays exact. Integrated committed events retain `eventVersion`, `eventSequence`, `documentId`, `documentVersion`, event type, cause and affected entities. Core commands use `{kind:"core"}`. Module commands use the frozen module/contribution identity from the route. Undo/redo carry the identity stored with the original semantic command. Dirty-state events retain the existing exact shape.

### 3.4 Integrated resource failure

CVN-6 extends `KernelCommandFailure` additively while preserving `CommandFailure` for Core-only callers:

```ts
type KernelCommandFailure =
  | CommandFailure
  | KernelContributionFailure
  | {
      readonly code: "command.resource-limit-exceeded";
      readonly limitKind:
        | "effects"
        | "affected-addresses"
        | "compatibility-facts"
        | "module-issues";
      readonly limit: number;
      readonly actual: number;
    };
```

`KernelCommandBusCreationFailure` additionally accepts the identical resource shape limited to `compatibility-facts | module-issues`, because initial compatibility and domain validation run before session publication. The Core-only `CommandBusCreationFailure` remains exact. CVN-5 later owns `batch-children`.

The exact construction union after CVN-6 is:

```ts
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
    >
  | {
      readonly code: "command.resource-limit-exceeded";
      readonly limitKind: "compatibility-facts" | "module-issues";
      readonly limit: number;
      readonly actual: number;
    };
```

### 3.5 Detached migration contract

```ts
export interface KernelExtensionMigrationRequestV1 {
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

export type KernelExtensionMigrationFailure =
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

export type KernelExtensionMigrationResult =
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

export function migrateKernelExtension(
  input: unknown,
  request: unknown,
  catalog: KernelIntegratedCatalog,
): KernelExtensionMigrationResult;
```

The new migration codes are added to `MigrationFailureCode` so `MigrationReport` can expose one stable mechanism issue. Granular module semantic issues remain in the failure's `issues` field and are deeply frozen. Application-facing error classes remain absent.

### 3.6 Application export allowlist

Runtime additions are exactly:

1. `replayKernelCommands`;
2. `migrateKernelExtension`.

Expected application runtime exports: 51, from the accepted 49 baseline. `CommandBus.createIntegrated` and the `createKernelRegistry` overload add behavior to existing runtime exports rather than new names.

New application type exports are exactly:

- all GD-0 integrated types listed in section 3.1 that are not already exported;
- `KernelCommandIdentity`;
- `IntegratedKernelEvent`;
- `KernelExtensionMigrationRequestV1`;
- `KernelExtensionMigrationFailure`;
- `KernelExtensionMigrationResult`.

The resource branch is part of exported `KernelCommandFailure` / `KernelCommandBusCreationFailure`; no separate public resource-helper name is added.

The Module SDK remains exactly 8 runtime and 34 type exports. It receives no new migration registration field or public runtime object.

## 4. Private Assembly and Runtime State

### 4.1 Authenticity

CVN-2's private `WeakMap<KernelIntegratedCatalog, KernelIntegratedCatalogState>` remains the sole authenticity source. CVN-6 reads state through the accepted internal accessor. A brand property alone never grants authority.

Private state for every integrated component contains the same `assemblyIdentity` object. Registry, bus and gateway instances use WeakMap-backed state; public object properties carry no identity. Replay obtains the same identity from its catalog and constructs one ephemeral integrated session.

### 4.2 Core-only default assembly

`DEFAULT_CORE_EXECUTION_ASSEMBLY` remains the default for existing `CommandBus.create`, Core Registry and Core replay. Integrated construction supplies a catalog-bound execution adapter explicitly. There is no global active catalog, mutable default or registration-time switch.

### 4.3 One owner

The integrated path extends the existing `KernelSessionState`/CommandBus coordination. It may use a private mode or generic state wrapper, but it must not introduce a second document cell, history stack, dirty/checkpoint identity, event sequence or subscriber store. One successful semantic operation calls one CVN-1 adoption owner.

## 5. Module Routing and Effects

### 5.1 Route

The top-level envelope is captured using the accepted descriptor-first primitives. A route resolves exactly one Core command definition or one module command definition from the bound catalog. A module command ID is globally unique from CVN-2 compilation. The route freezes:

- command ID/version;
- Core or module source identity;
- target kind and strict target;
- detached payload;
- owning contribution;
- allowed effects and namespaces.

The module decoder receives only the accepted `target` and `payload` input. The preparer receives the detached owner-scoped view and restricted effect-request surface accepted by CVN-2.

### 5.2 Effect authorization

For each request, the runtime verifies the request came from the routed contribution and then resolves:

- `core.note.replace-written-pitch`: Core-owned, target must be an existing Note and payload must decode to accepted WrittenPitch;
- `module.extension`: effect kind must resolve to that contribution; namespace must be declared; owner kind must be in the effect descriptor; owner must resolve to score or an existing Part.

A contribution cannot call another contribution's effect even if it knows the string identifier. Generic mutation, full document replacement and module-supplied inverse remain structurally unrepresentable.

### 5.3 Candidate and inverse

The runtime allocates one isolated candidate for the semantic operation. Effects apply sequentially. Before each effective change, the Core or owned-effect adapter captures the current candidate value and derives an inverse. If an effect is observationally equal, it contributes no effective forward/inverse entry. Effective inverses are stored globally in reverse order.

Any route, decode, target, owner, prepare, effect, semantic, validation, classification, fact or capacity failure discards the candidate and leaves every visible pre-call field equal.

## 6. Validation, Classification and Failure Priority

### 6.1 Write preflight

Integrated session construction computes canonical availability. Submit, undo, redo and each replay write first inspect cached facts:

1. any incompatible fact -> `command.required-contribution-incompatible`;
2. otherwise any unavailable fact -> `command.required-contribution-unavailable`;
3. returned facts are the complete canonical mixed list;
4. operation decoder, preparer, effects, validators and classifiers remain uncalled.

### 6.2 Changed-candidate order

For a writable operation:

1. strict route/decode/resolve;
2. ordered effect preparation;
3. one candidate application;
4. Core semantic validation;
5. compatibility and availability;
6. module validators;
7. Core feature profile;
8. module classifiers;
9. canonical issue/fact/event preparation and capacity reservation;
10. CVN-1 adoption and isolated dispatch.

### 6.3 Callback counts and failures

Each contribution receives at most one validation view and one classification view per applicable pass. The view contains detached Core read data and its exact-compatible blocks in canonical owner order.

- zero compatible blocks: `0/0`;
- successful validation and classification: `1/1`;
- semantic issues: validator `1`, classifier `0`; remaining applicable validators continue;
- validator throw/Promise-like/malformed result: first failure in catalog order wins, later validators and all classifiers stay at zero;
- classifier throw/Promise-like/malformed result: first failure in catalog order wins, later classifiers stop;
- read-only write attempt: operation callback/write counts `0/0/0`.

Semantic issues aggregate by catalog order then callback-return order. A callback with 1,025 issues is a contract violation. Aggregate 4,097 is the resource failure. A mechanism failure encountered after earlier semantic issues takes precedence because the semantic aggregate has not yet completed.

### 6.4 No-op

After effects produce an unchanged candidate, the same semantic/compatibility/validation/profile/classification pipeline still runs. The returned assessment is current, while version, history, redo, checkpoint, dirty state and event sequence stay unchanged.

### 6.5 Undo/redo

Availability preflight precedes empty-history handling. Undo/redo uses stored private effects and source identity; decoder/preparer callbacks stay at zero. The candidate reruns Core semantics, compatibility, validators, Core profile, classifiers, facts and event preparation before moving a history entry.

### 6.6 Replay

Replay accepts semantic envelopes and an authentic catalog. It creates an ephemeral integrated session, re-routes each input through the same runtime and returns detached results/final document/availability. It accepts no stored effects or history snapshots. Empty replay succeeds unchanged even when availability is read-only; the first attempted write rejects at its exact index. Replay creates no public subscription surface.

## 7. Compatibility and Canonical Facts

Compatibility is evaluated for every persisted block covered by a catalog requirement:

| Block | Contribution | Result |
|---|---|---|
| exact listed version | present | compatible |
| exact listed version | absent | unavailable fact |
| unlisted/future version | present or absent | incompatible fact |
| undeclared namespace | any | opaque Core V1 preservation |

A declared namespace with no persisted block creates no fact. A contribution owning compatible and incompatible blocks receives only the compatible block-scoped view; the excluded payload remains untouched. Unrelated incompatible blocks do not receive callbacks.

Canonical comparison keys are:

1. namespace by captured string code-unit order;
2. owner kind, score before part;
3. part ID, with score represented by the empty comparison key;
4. extension schema version numerically;
5. module ID;
6. contribution ID;
7. reason, incompatible before unavailable.

The complete public fact tuple is the deduplication key. Catalog construction already guarantees that an identical ownership identity cannot declare conflicting supported-version lists.

## 8. Resource and Privacy Boundaries

| Resource | Inclusive limit | Boundary+1 result |
|---|---:|---|
| forward effects | 131,072 | resource/effects |
| canonical affected addresses | 131,072 | resource/affected-addresses |
| compatibility facts | 131,072 | resource/compatibility-facts |
| issues from one callback | 1,024 | contribution-contract-violation |
| aggregate module issues | 4,096 | resource/module-issues |

`actual` is the first observed count exceeding the limit, so exact boundary+1 tests assert 131,073 or 4,097. CVN-2 startup limits remain 64 modules, 256 contributions, 4,096 command descriptors, 4,096 effect definitions, 1,024 namespaces and 256 supported versions per requirement.

Public data may contain only stable failure code, module/contribution identity, canonical address/path, numeric limit, canonical fact and frozen diagnostic/issue fields. It contains no stack, absolute path, thrown value, callback, internal effect, catalog handle, assembly object, full document or extension/command payload.

## 9. Detached Migration Pipeline

### 9.1 Failure precedence

1. invalid document shape -> `migration.invalid-input`;
2. invalid request shape -> `migration.invalid-request`;
3. Core-semantic-invalid document -> `migration.semantic-invalid`;
4. unauthentic catalog or request identity/effect/ownership absent from that catalog -> `migration.assembly-mismatch`;
5. target namespace+owner block absent -> `migration.target-not-found`;
6. current block differs from both source and target, or source is outside the effect's declared versions -> `migration.unsupported-source-version`;
7. target is outside the effect's declared versions -> `migration.unsupported-target-version`;
8. payload decode/transform output violation -> contribution contract violation;
9. callback throw -> contribution internal error;
10. transformed Core semantic invalidity -> `migration.semantic-invalid`;
11. applicable module semantic issues -> contribution semantic invalidity;
12. unexpected internal condition -> `migration.internal-error`.

### 9.2 Idempotence and callback count

If the exact target block already has `targetSchemaVersion`, return `not-required` before payload decode and transformer invocation. Otherwise the current version must equal `sourceSchemaVersion`, and both source/target versions must appear in the effect descriptor's exact supported version list. Payload decode and transform each execute once.

The transformer receives a detached view, the exact owner, current block and decoded payload. Only `{status:"replace", schemaVersion: targetSchemaVersion, payload}` succeeds. Remove, rejected, wrong version, malformed, Promise-like or alias-leaking output follows the fixed failure map.

### 9.3 Validation and preservation

The transformed document passes strict encode/decode, Core semantic validation and all exact-compatible module validators in catalog order. Unrelated missing/incompatible blocks remain excluded and deeply equal, allowing targeted migration to repair a document incrementally. Every non-target Core field and ExtensionBlock is deep-equal before/after. Output document and report are detached and deeply frozen.

The function receives no active bus or Registry and mutates no ready catalog. Physical file replacement, persistence transaction, autosave and crash recovery remain future service work.

## 10. Synthetic Evidence Model

The fixture installs two neutral official modules:

| Module | Contribution | Namespace | Owner | Command/effects |
|---|---|---|---|---|
| `fixture.score-domain` | `fixture.score-domain.commands` | `fixture.score.extension` | score | WrittenPitch + score block |
| `fixture.part-domain` | `fixture.part-domain.commands` | `fixture.part.extension` | part | WrittenPitch + Part block |

Each command is one semantic operation owned by one contribution and contains two ordered effects. Both modules are installed together so every candidate proves catalog-order validation/classification and canonical fact ordering. A single submit never combines commands owned by both modules; that aggregate shape belongs to CVN-5.

## 11. Production File Allowlist

### New private files

- `src/core-kernel/commands/integrated-runtime.ts`
- `src/core-kernel/registry/domain-availability.ts`
- `src/core-kernel/migration/migrate-kernel-extension.ts`

### Existing files eligible for modification

- `src/core-kernel/index.ts`
- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/replay.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/commands/effects.ts`
- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/registry/integrated-contracts.ts`
- `src/core-kernel/registry/domain-catalog.ts`
- `src/core-kernel/registry/assembly.ts`
- `src/core-kernel/registry/runtime.ts`
- `src/core-kernel/registry/gateway.ts`
- `src/core-kernel/events/contracts.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`
- `src/core-kernel/read/contracts.ts`
- `src/core-kernel/read/session-state.ts`
- `src/core-kernel/read/snapshot.ts`
- `src/core-kernel/migration/contracts.ts`
- `src/core-kernel/reports/contracts.ts`
- `src/core-kernel/reports/adapters.ts`
- `src/core-kernel/reports/build-report.ts`
- `src/core-kernel/errors/kernel-error.ts`

Any source addition outside this list is a planning-review event. `src/core-kernel/module-sdk/**`, `migrate-score-document.ts`, Score schema, physical IO and product-layer directories remain protected.

## 12. Planned Test Allowlist

- `test/core-kernel/cvn-6-public-contracts.test.ts`
- `test/core-kernel/integrated-assembly-identity.test.ts`
- `test/core-kernel/domain-availability.test.ts`
- `test/core-kernel/module-transaction-atomicity.test.ts`
- `test/core-kernel/module-validation-classification.test.ts`
- `test/core-kernel/integrated-replay-events-history.test.ts`
- `test/core-kernel/extension-migration.test.ts`
- `test/core-kernel/integrated-hostile-input-resource.test.ts`
- `test/core-kernel/integrated-public-boundary.test.ts`
- `test/core-kernel/core-only-regression.test.ts`
- `test/core-kernel/fixtures/cvn-6-synthetic-official-modules.ts`

Existing CVN-0, CVN-1, CVN-2, CVN-3 and CVN-4 regression files remain accepted characterization inputs.

## 13. Rollback

CVN-6 changes no persisted format. A runtime rollout can select the existing Core-only construction path at startup and preserve every document, including opaque extension data. Rejected integrated construction exposes no partial Registry, bus or gateway. During development, rollback is bounded to the CVN-6 source/test allowlist and leaves the accepted CVN-2 catalog compiler intact. Active ready assemblies are immutable; a later product session may choose a different frozen assembly generation only through the future Product Host.
