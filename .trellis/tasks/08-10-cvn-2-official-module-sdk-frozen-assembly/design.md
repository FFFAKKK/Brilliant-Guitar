# CVN-2 Detailed Design — Official Module SDK and Frozen Contribution Assembly

> **Status:** planning candidate. This document fixes the implementation target; it is not production code and does not activate the task.

## 1. Design outcome

CVN-2 adds one inert, versioned authoring layer and one immutable catalog compiler:

```text
Product composition root
  -> full strict startup manifest (data only)
  -> statically imported official registration entries (functions allowed here)
  -> compileOfficialModuleCatalogV1(...)
       |- validate accepted Core registrations unchanged
       |- validate official domain descriptors/bindings
       |- normalize and freeze private catalog state
       `- return one opaque KernelIntegratedCatalog handle

CVN-2 stops here.

CVN-6 later consumes the private catalog state
  -> existing CommandBus / Registry / Gateway / Replay owner
```

No CVN-2 function opens a Session, submits a command, applies an effect, validates a document, classifies support, writes history, replays, or publishes an event.

## 2. Public entry separation

### 2.1 Application-facing Core root

`src/core-kernel/index.ts` adds only these type exports during CVN-2:

```typescript
export type {
  ExtensionRuntimeRequirementV1,
  KernelIntegratedCatalog,
  ModuleIssueCode,
  ModuleKernelIssue,
} from "./registry/integrated-contracts";
```

There is no new runtime key in `Object.keys(coreKernel)`. The accepted runtime key fixture remains exact.

### 2.2 Official module SDK entry

The sole authoring entry is:

```text
src/core-kernel/module-sdk/index.ts
```

It uses explicit named exports. It does not use `export *`.

Exact runtime export allowlist:

1. `OFFICIAL_MODULE_SDK_V1_LIMITS`
2. `ModuleKernelErrorBase`
3. `createModuleKernelIssueV1`
4. `defineDomainCommandV1`
5. `defineModuleEffectV1`
6. `defineDomainCommandContributionV1`
7. `defineDomainCommandRegistrationEntryV1`
8. `compileOfficialModuleCatalogV1`

Exact type export allowlist:

1. `CompiledDomainCommandContributionV1`
2. `CompiledDomainCommandDefinitionV1`
3. `CompiledDomainCommandRegistrationEntryV1`
4. `CompiledModuleEffectDefinitionV1`
5. `CoreWrittenPitchEffectRequestV1`
6. `DomainCommandDecodeInputV1`
7. `DomainCommandDecodeResultV1`
8. `DomainCommandDecoderV1`
9. `DomainCommandDefinitionInputV1`
10. `DomainCommandDescriptorV1`
11. `DomainCommandPreparationResultV1`
12. `DomainCommandPreparerV1`
13. `DomainContributionReadViewV1`
14. `DomainEffectRequestV1`
15. `DomainSemanticValidatorV1`
16. `DomainSupportClassificationV1`
17. `DomainSupportClassifierV1`
18. `ExtensionRuntimeRequirementV1`
19. `KernelIntegratedCatalog`
20. `ModuleEffectApplyInputV1`
21. `ModuleEffectApplyResultV1`
22. `ModuleEffectDefinitionInputV1`
23. `ModuleEffectDescriptorV1`
24. `ModuleEffectPayloadDecodeResultV1`
25. `ModuleEffectPayloadDecoderV1`
26. `ModuleEffectTransformerV1`
27. `ModuleIssueCode`
28. `ModuleIssueCreationResultV1`
29. `ModuleIssueInputV1`
30. `ModuleKernelIssue`
31. `ModuleOwnedEffectRequestV1`
32. `OfficialModuleCatalogCompilationResultV1`
33. `OfficialModuleDefinitionResultV1`
34. `OfficialModuleSdkV1Limits`

No Registry private state type, catalog accessor, internal brand symbol, mutable builder, active bus, history/effect algebra, or raw error type appears here.

## 3. Shared application data contracts

The following declarations live in `src/core-kernel/registry/integrated-contracts.ts`. The public fields match GD-0; the brand symbol is exported only from this internal module and is omitted by both public entry allowlists.

```typescript
export const kernelIntegratedCatalogBrand: unique symbol;

export interface KernelIntegratedCatalog {
  readonly [kernelIntegratedCatalogBrand]: true;
}

export interface ExtensionRuntimeRequirementV1 {
  readonly requirementVersion: 1;
  readonly namespace: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly requiredForWrite: true;
}

export type ModuleIssueCode = `${string}.${string}`;

export interface ModuleKernelIssue {
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
```

The runtime handle is a frozen object containing the internal brand property. A private `WeakMap<KernelIntegratedCatalog, KernelIntegratedCatalogState>` is the authority for authenticity and state. Structural lookalikes with a copied plain object are absent from the WeakMap and remain unusable by later CVN-6 construction.

## 4. Module issue construction

### 4.1 Input and result

```typescript
export interface ModuleIssueInputV1<
  ModuleId extends string = string,
  Code extends ModuleIssueCode & `${ModuleId}.${string}` =
    ModuleIssueCode & `${ModuleId}.${string}`,
> {
  readonly code: Code;
  readonly source: {
    readonly kind: "module";
    readonly moduleId: ModuleId;
    readonly contributionId: string;
  };
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

export type ModuleIssueCreationResultV1 =
  | { readonly status: "created"; readonly issue: ModuleKernelIssue }
  | { readonly status: "invalid" };

export function createModuleKernelIssueV1(
  input: unknown,
): ModuleIssueCreationResultV1;
```

The input record accepts exactly `code`, `source`, optional `location`, and optional `details`. `issueVersion`, `severity`, and `messageKey` are outputs only; supplying any of them is an extra-field rejection.

Validation:

1. Capture/inspect without ordinary property reads.
2. Require Registry safe-ID grammar `^[a-z0-9]+(?:[.-][a-z0-9]+)*$` and length `1..128` for module ID, contribution ID, and code.
3. Require `code.startsWith(moduleId + ".")`.
4. Require exact module source shape.
5. Decode `KernelIssueLocation` through its existing canonical address/range/path decoders.
6. Capture `details` as finite JSON data and require an object root.
7. Derive `messageKey = "module." + code`.
8. Derive severity:
   - `warning` when code contains `.unsupported.` or ends `.unsupported`;
   - `fatal` when code ends `.internal-error` or `.invariant-violation`;
   - otherwise `error`.
9. Return a fresh deeply frozen issue.

Failure is the single frozen `{ status: "invalid" }`; no failing path, input fragment, getter error, or thrown value is returned.

### 4.2 Error base

```typescript
export abstract class ModuleKernelErrorBase<
  ModuleId extends string,
  Code extends ModuleIssueCode & `${ModuleId}.${string}`,
> extends Error {
  protected constructor(input: ModuleIssueInputV1<ModuleId, Code>);
  toIssue(): ModuleKernelIssue & {
    readonly code: Code;
    readonly source: {
      readonly kind: "module";
      readonly moduleId: ModuleId;
      readonly contributionId: string;
    };
  };
}
```

The generic parameters and constructor data are one compile-time relation: a subclass claiming module `fixture.score` and code `fixture.score.problem` cannot pass another module/code pair to `super()`. The protected constructor runs the same runtime validator once and stores only the frozen issue in a private field. Invalid trusted subclass construction throws a local `TypeError`; public Core operations never expose or throw the instance. `toIssue()` returns the stored data object and no `name`, `message`, `stack`, `cause`, prototype, or class identity.

## 5. Read-only callback data

CVN-2 freezes the signature; CVN-6 constructs and passes the value.

```typescript
export interface DomainContributionReadViewV1 {
  readonly viewVersion: 1;
  readonly documentId: string;
  readonly schemaVersion: ScoreDocumentSchemaVersion;
  readonly documentVersion: number;
  readonly coreDocument: Omit<ScoreDocument, "extensions">;
  readonly compatibleExtensions: readonly ExtensionBlock[];
}
```

Rules consumed later by CVN-6:

- `coreDocument` is detached and contains no `extensions` property.
- `compatibleExtensions` contains only blocks owned by this contribution, with an exact listed schema version.
- Blocks are ordered by canonical owner order: score first, then Part order from `coreDocument.parts`; within one owner, namespace lexical order.
- The view has no bus, Registry, history, event, subscriber, clock, randomness, filesystem, network, mutable document, or candidate reference.

CVN-2 stores callback references and never constructs this view.

## 6. Command authoring contracts

### 6.1 Descriptor

```typescript
export interface DomainCommandDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly commandId: string;
  readonly commandVersion: 1;
  readonly source: {
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly targetKind: ScoreEntityTarget["kind"];
  readonly requiredCapabilities: readonly [
    "command:execute",
    "score:read",
  ];
  readonly titleKey: string;
}
```

`commandId`, both source IDs, and `titleKey` use safe-ID grammar and length `1..128`. The command ID must begin with one owned extension namespace plus `.`. The capability tuple is exact in value and order; arbitrary per-command capability expansion is not a V1 variation.

### 6.2 Decode and preparation

```typescript
export interface DomainCommandDecodeInputV1 {
  readonly target: unknown;
  readonly payload: unknown;
}

export type DomainCommandDecodeResultV1<Command> =
  | { readonly status: "decoded"; readonly command: Command }
  | { readonly status: "invalid" };

export type DomainCommandDecoderV1<Command> = (
  input: DomainCommandDecodeInputV1,
) => DomainCommandDecodeResultV1<Command>;

export interface CoreWrittenPitchEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.note.replace-written-pitch";
  readonly target: Extract<
    ScoreEntityTarget,
    { readonly kind: "note" }
  >;
  readonly writtenPitch: WrittenPitch;
}

export interface ModuleOwnedEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "module.extension";
  readonly effectKind: string;
  readonly namespace: string;
  readonly owner: ExtensionOwner;
  readonly payload: JsonObject;
}

export type DomainEffectRequestV1 =
  | CoreWrittenPitchEffectRequestV1
  | ModuleOwnedEffectRequestV1;

export type DomainCommandPreparationResultV1 =
  | { readonly status: "no-op" }
  | {
      readonly status: "rejected";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly status: "changed";
      readonly effectRequests: readonly [
        DomainEffectRequestV1,
        ...DomainEffectRequestV1[],
      ];
      readonly affected: readonly ScoreAddress[];
    };

export type DomainCommandPreparerV1<Command> = (
  view: DomainContributionReadViewV1,
  command: Command,
) => DomainCommandPreparationResultV1;

export interface DomainCommandDefinitionInputV1<Command> {
  readonly descriptor: DomainCommandDescriptorV1;
  readonly decode: DomainCommandDecoderV1<Command>;
  readonly prepare: DomainCommandPreparerV1<Command>;
}

export const compiledDomainCommandDefinitionBrand: unique symbol = Symbol(
  "brilliant-guitar.module-sdk.v1.domain-command-definition",
);

export interface CompiledDomainCommandDefinitionV1 {
  readonly descriptor: DomainCommandDescriptorV1;
  readonly [compiledDomainCommandDefinitionBrand]: true;
}
```

`compiledDomainCommandDefinitionBrand` is exported only from the internal
`module-sdk/contracts.ts` module and is omitted by the SDK entry. Its handle
property is non-enumerable. The public handle therefore has exactly one
enumerable string key, `descriptor`; its callback pair is retained by one
private SDK `WeakMap`. A structural lookalike, a handle from another SDK
instance, or a copied brand is absent from that `WeakMap` and is invalid.

The CVN-6 invocation value is fixed now even though CVN-2 never constructs it:

1. after strict top-level envelope routing captures the own data values `target` and `payload`, CVN-6 creates a fresh ordinary object with exactly those two enumerable keys;
2. the shell is shallow-frozen; the captured unknown values are not traversed, cloned, or frozen before trusted decoder inspection;
3. `commandVersion`, `commandId`, the original envelope object, its prototype, and any extra field are not passed to the decoder;
4. the matched decoder strictly decodes both target and payload and returns one command value containing every value needed by preparation;
5. CVN-6 captures, clones, and deeply freezes the decoded command before passing it to the `prepare` callback from the same private definition binding;
6. a decoded value is never handed to another definition's preparer.

CVN-2 checks descriptor shape, source parity, command uniqueness, target kind, exact capability tuple, handle authenticity, and that `decode`/`prepare` are permitted synchronous callable slots when the handle is defined. It does not call either function. CVN-6 later maps throws, Promise-like values, malformed issues/effects/facts, and resource overflow to accepted runtime failures.

## 7. Validator and classifier contracts

```typescript
export type DomainSemanticValidatorV1 = (
  view: DomainContributionReadViewV1,
) => readonly ModuleKernelIssue[];

export interface DomainSupportClassificationV1 {
  readonly status: "supported" | "unsupported";
  readonly issues: readonly ModuleKernelIssue[];
}

export type DomainSupportClassifierV1 = (
  view: DomainContributionReadViewV1,
) => DomainSupportClassificationV1;
```

These are required slots on every contribution. CVN-2 does not call them. `1,024` issues per callback and `4,096` aggregate issues per transaction are exported constants; their runtime enforcement belongs to CVN-6.

## 8. Module-owned effect contracts

### 8.1 Descriptor

```typescript
export interface ModuleEffectDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly effectKind: string;
  readonly source: {
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly namespace: string;
  readonly ownerKinds:
    | readonly ["score"]
    | readonly ["part"]
    | readonly ["score", "part"];
  readonly supportedSchemaVersions: readonly number[];
}
```

`effectKind` begins with `namespace + "."`. Namespace is owned by the contribution. Source matches the contribution. Supported versions are exactly equal, element by element, to the unique matching `ExtensionRuntimeRequirementV1`. Owner kinds are already canonical and contain only score/Part.

### 8.2 Decode and transform

```typescript
export type ModuleEffectPayloadDecodeResultV1<Payload> =
  | { readonly status: "decoded"; readonly payload: Payload }
  | { readonly status: "invalid" };

export type ModuleEffectPayloadDecoderV1<Payload> = (
  input: unknown,
) => ModuleEffectPayloadDecodeResultV1<Payload>;

export interface ModuleEffectApplyInputV1<Payload> {
  readonly view: DomainContributionReadViewV1;
  readonly owner: ExtensionOwner;
  readonly currentBlock: ExtensionBlock | undefined;
  readonly payload: Payload;
}

export type ModuleEffectApplyResultV1 =
  | { readonly status: "remove" }
  | {
      readonly status: "replace";
      readonly schemaVersion: number;
      readonly payload: JsonObject;
    }
  | {
      readonly status: "rejected";
      readonly issues: readonly ModuleKernelIssue[];
    };

export type ModuleEffectTransformerV1<Payload> = (
  input: ModuleEffectApplyInputV1<Payload>,
) => ModuleEffectApplyResultV1;

export interface ModuleEffectDefinitionInputV1<Payload> {
  readonly descriptor: ModuleEffectDescriptorV1;
  readonly decode: ModuleEffectPayloadDecoderV1<Payload>;
  readonly transform: ModuleEffectTransformerV1<Payload>;
}

export const compiledModuleEffectDefinitionBrand: unique symbol = Symbol(
  "brilliant-guitar.module-sdk.v1.module-effect-definition",
);

export interface CompiledModuleEffectDefinitionV1 {
  readonly descriptor: ModuleEffectDescriptorV1;
  readonly [compiledModuleEffectDefinitionBrand]: true;
}
```

`compiledModuleEffectDefinitionBrand` is likewise exported only from the
internal contracts module and omitted by the SDK entry; the handle property is
non-enumerable. The handle has exactly one enumerable string key, `descriptor`;
its decoder/transformer pair lives in a private SDK `WeakMap`. The transformer
cannot choose a namespace or owner in its return value. CVN-6 later
constructs/replaces/removes only the descriptor-bound block, passes a
successfully decoded payload only to the transformer from the same binding, and
derives the inverse from current candidate state. CVN-2 merely validates and
stores the authentic handle.

## 9. Exact contribution and registration shapes

```typescript
export interface CompiledDomainCommandContributionV1 {
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

export interface CompiledDomainCommandRegistrationEntryV1 {
  readonly registrationEntryId: "kernel.domain-commands.v1";
  readonly ownerModuleId: string;
  readonly kind: "domain-command";
  readonly contributions: readonly CompiledDomainCommandContributionV1[];
}
```

The contribution object has exactly nine fields. The registration entry has exactly four fields. Contributions, commands, and effects may be empty arrays at the shape layer; a product module can be validation-only, command-only, or effect-free. The two qualification fixtures each contain one command and one effect.

Namespace/requirement relation is one-to-one:

- `extensionNamespaces` is nonempty, unique, and lexically sorted in the normalized output.
- Every namespace has exactly one requirement in this same contribution.
- Every requirement source matches the contribution's module/contribution IDs.
- No requirement may name an unowned namespace.
- Multiple effects may use one requirement; every effect version list equals that requirement exactly.

## 10. Definition builders

```typescript
export type OfficialModuleDefinitionResultV1<T> =
  | { readonly status: "defined"; readonly value: T }
  | { readonly status: "invalid" };

export function defineDomainCommandV1<Command>(
  input: DomainCommandDefinitionInputV1<Command>,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandDefinitionV1>;

export function defineModuleEffectV1<Payload>(
  input: ModuleEffectDefinitionInputV1<Payload>,
): OfficialModuleDefinitionResultV1<CompiledModuleEffectDefinitionV1>;

export function defineDomainCommandContributionV1(
  input: CompiledDomainCommandContributionV1,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandContributionV1>;

export function defineDomainCommandRegistrationEntryV1(
  input: CompiledDomainCommandRegistrationEntryV1,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandRegistrationEntryV1>;
```

Those are the public overloads. Each implementation signature receives `unknown` internally and uses the same hostile-input rules, so JavaScript callers, forged casts, and runtime mutation still produce the data-only `invalid` result rather than bypassing inspection.
Hostile TypeScript tests call the runtime function through `Reflect.apply` with
malformed values; they do not widen the public overload, export a cast helper,
or add an `unknown` overload that would erase authoring checks.

Command/effect definition builders:

1. accept exactly `descriptor/decode/prepare` or `descriptor/decode/transform`;
2. preserve the generic producer/consumer relation at the public call site;
3. inspect and clone the descriptor and validate both callable slots without invocation;
4. create a fresh frozen non-generic handle, install the paired callbacks in the matching private `WeakMap`, and publish the handle only after all local checks succeed;
5. expose neither callback as an own property nor either internal brand/binding reader through the SDK entry.

Contribution/registration builders:

1. inspect exact records/arrays by descriptors;
2. capture and freeze data-only subtrees;
3. require every command/effect array member to be an authentic handle in the corresponding private SDK `WeakMap`;
4. retain only the direct contribution validator/classifier callable slots and the authentic definition handles;
5. reject accessors, unexpected symbol keys, sparse arrays, cycles in data, extra fields, invalid prototypes, async/generator callable slots, fake/cross-instance handles, and wrong descriptor/function counts;
6. create fresh frozen outer objects and arrays;
7. never invoke a callback;
8. return the single `{ status: "invalid" }` result on failure.

They validate local shape/parity only. Manifest identity, cross-entry uniqueness, global caps, and Core baseline are checked again by the catalog compiler.

`definitions.ts` owns the two definition-binding `WeakMap`s and internal binding readers. Generic erasure occurs only behind those private readers. The runtime handoff invariant is exact: a successful decoded command/payload may be consumed only by the paired callback stored in the same binding. No public `any`, bivariant method escape, generic cast helper, raw callback getter, or structural definition constructor is part of V1.

## 11. Catalog compiler contract

```typescript
export type OfficialModuleCatalogCompilationResultV1 =
  | { readonly ok: true; readonly catalog: KernelIntegratedCatalog }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

export function compileOfficialModuleCatalogV1(
  startupManifest: unknown,
  registrationEntries: unknown,
): OfficialModuleCatalogCompilationResultV1;
```

### 11.1 Full manifest rule

The manifest is full, not domain-only. It must include the accepted `core.commands` and `core.selectors` declarations with their exact module IDs, origin/runtime/trust/API/capabilities, and registration IDs. CVN-2 internally binds those two IDs only to `CORE_COMPILED_REGISTRATION_ENTRIES`; callers do not supply or replace Core handlers.

Domain declarations may select only `kernel.domain-commands.v1`. Mixed Core/domain IDs in one module declaration are invalid. A domain declaration has exactly one occurrence of the domain entry ID.

### 11.2 Composite registration selection

Domain entries are indexed by:

```text
(ownerModuleId, registrationEntryId)
```

There must be exactly one matching static entry for each selected domain module. Static entries not selected by the manifest are ignored and install no descriptor or callback, matching the existing manifest-selection model. This permits all official modules to use the shared V1 entry ID while preserving explicit owner parity.

### 11.3 Private normalized state

The successful private state contains only:

```typescript
interface KernelIntegratedCatalogState {
  readonly catalogVersion: 1;
  readonly coreAssembly: RegistryAssemblyState;
  readonly modules: readonly NormalizedOfficialDomainModuleV1[];
  readonly contributions: readonly NormalizedDomainContributionV1[];
  readonly commandIndex: Readonly<Record<string, NormalizedDomainCommandV1>>;
  readonly effectIndex: Readonly<Record<string, NormalizedModuleEffectV1>>;
  readonly namespaceIndex: Readonly<Record<string, NormalizedDomainContributionV1>>;
  readonly assemblyIdentity: object;
}
```

These names are private design anchors, not SDK exports. Indexes are fresh null-prototype records frozen after population; no mutable `Map`/`Set` is retained in ready state. Temporary construction maps/sets are discarded before publication. Externally observable order and lookup uniqueness stay as specified.

The internal function:

```typescript
getKernelIntegratedCatalogState(
  catalog: KernelIntegratedCatalog,
): KernelIntegratedCatalogState | undefined;
```

is exported only from `registry/domain-catalog.ts` for direct internal use by later CVN-6 and focused internal tests. It is absent from both public entries.

### 11.4 Atomic publication

All normalized arrays, descriptors, requirement lists, issue-independent data, and the assembly identity object are created and frozen in locals. The public handle and `WeakMap.set` occur only after every check and freeze succeeds. Failure paths return before either operation. No candidate object escapes through a failure.

## 12. Resource constants and enforcement

```typescript
export interface OfficialModuleSdkV1Limits {
  readonly modules: 64;
  readonly contributions: 256;
  readonly commands: 4096;
  readonly effects: 4096;
  readonly extensionNamespaces: 1024;
  readonly supportedSchemaVersionsPerRequirement: 256;
  readonly moduleIssuesPerCallback: 1024;
  readonly moduleIssuesPerTransaction: 4096;
  readonly compatibilityFacts: 131072;
}

export const OFFICIAL_MODULE_SDK_V1_LIMITS: OfficialModuleSdkV1Limits;
```

The object is deeply frozen and contains exactly these nine keys.

CVN-2 compiler counters:

- `modules` counts the full decoded manifest, including the two Core modules.
- `contributions` counts domain contributions only.
- command/effect/namespace counters are assembly-wide domain totals.
- version count is per requirement.
- crossing an aggregate command/effect/namespace counter is attributed to the currently processed canonical registration entry and returns `registry.invalid-contribution` with `kernel.domain-commands.v1`.
- root module or contribution overflow returns `registry.invalid-startup-input`.
- the last three limits are exported and compile-time tested for exact values but not behaviorally exercised until CVN-6.

No count uses array allocation proportional to the rejected `actual` beyond the supplied input; counters stop at `limit + 1`.

## 13. Validation precedence and deterministic scan

| Stage | Checks | Failure |
|---|---|---|
| 1 | descriptor-first manifest/entry/contribution/nested exact shapes; versions; global root counts | invalid startup input for manifest/root; invalid contribution for nested entry |
| 2 | Core declarations fixed; selected entry exists; owner/module/contribution/source parity | registration not found, owner mismatch, duplicate contribution, or handler mismatch |
| 3 | official origin; builtin/internal runtime; system trust; API 1; four required capabilities | existing dedicated Registry failure |
| 4 | duplicate module, contribution, command, effect, namespace | dedicated module/contribution failure where available; otherwise invalid contribution |
| 5 | command namespace; target kind; exact capability tuple; decoder/preparer callable slot parity | invalid contribution or handler mismatch |
| 6 | namespace/requirement one-to-one; requirement source; exact version list | invalid contribution |
| 7 | effect namespace/source/version/owner-kind parity; effect slot parity | invalid contribution or handler mismatch |
| 8 | permitted synchronous slot kind; normalized order; data freeze; private identity; no methods | invalid contribution or internal error |

Within a stage:

1. modules are processed by lexical `moduleId` once basic IDs are readable;
2. entries use `(ownerModuleId, registrationEntryId)`;
3. contributions use `(moduleId, contributionId)`;
4. commands/effects/namespaces use lexical ID;
5. capability presence is checked in `command:register`, `command:execute`, `score:read`, `event:subscribe` order.

Output arrays use the same canonical order. Caller array order and object enumeration do not affect a successful catalog.

## 14. Callable-slot rule

CVN-2 accepts ordinary synchronous function objects in the six slot categories: command decode, command prepare, validate, classify, effect decode, and effect transform. Command/effect slots are inspected exactly once by their typed definition builder; contribution slots are inspected exactly once by the contribution builder. The catalog compiler rechecks handle authenticity and direct contribution slots without invoking any of them.

- Declared `async` functions, generator functions, class constructors, and bound/native functions are rejected during definition inspection without invocation. Official modules use ordinary or arrow functions; a module can wrap an otherwise acceptable method in an arrow function.
- Ordinary functions are not called by CVN-2, so a regular function that later returns a Promise-like value is a CVN-6 runtime contract violation, as required by the parent matrix.
- Function objects are retained by identity in private state; their enumerable custom properties are ignored and never included in summaries or data hashing.
- Static official code purity and mutable-global avoidance are review/qualification requirements, not inferred from closure internals.
- All six fixture callback counters remain zero after every success and failure catalog test.

This resolves the apparent conflict between synchronous ABI and startup atomicity without running untrusted behavior during assembly.

## 15. Failure privacy

The compiler uses only the existing `KernelRegistryStartupFailure` union. It adds no new Registry failure code in CVN-2.

Exact mapping:

| Condition | Result |
|---|---|
| unreadable/malformed manifest or >64 modules | `{ code: "registry.invalid-startup-input" }` |
| selected entry absent | `registry.registration-entry-not-found` + entry ID |
| static entry owner differs | `registry.registration-owner-mismatch` + entry/module IDs |
| duplicate module | `registry.duplicate-module-id` + module ID |
| duplicate contribution | `registry.duplicate-contribution-id` + contribution ID |
| origin/runtime/trust/API/capability | current dedicated failure + allowlisted ID/capability |
| malformed nested descriptor; duplicate command/effect/namespace; aggregate/version overflow | `registry.invalid-contribution` + registration entry ID |
| descriptor/function count or identity parity | `registry.handler-mismatch` + contribution ID |
| caught unexpected internal condition | `{ code: "registry.internal-error" }` |

Returned data contains no absolute source path, handler/effect object, manifest fragment, extension payload, stack, exception message, Proxy error, catalog handle, private identity, or partial state.

## 16. File design and ownership

### 16.1 Planned production additions

| File | Sole responsibility |
|---|---|
| `src/core-kernel/registry/integrated-contracts.ts` | shared opaque catalog, requirement, and module issue data types |
| `src/core-kernel/module-sdk/contracts.ts` | SDK descriptors, decode input, callback signatures, generic definition inputs, opaque compiled handle declarations/internal-only brand symbols, result unions, and limits type |
| `src/core-kernel/module-sdk/module-issues.ts` | issue strict builder and `ModuleKernelErrorBase` |
| `src/core-kernel/module-sdk/definitions.ts` | private definition-binding WeakMaps/readers and all four definition/contribution/registration builders |
| `src/core-kernel/module-sdk/index.ts` | explicit SDK allowlist only |
| `src/core-kernel/registry/domain-catalog-codec.ts` | descriptor-first domain entry/contribution normalization helpers |
| `src/core-kernel/registry/domain-catalog.ts` | full compiler, counters, private indexes/identity/WeakMap/internal reader |

### 16.2 Planned production modifications

| File | Allowed delta |
|---|---|
| `src/core-kernel/index.ts` | four type-only exports; zero runtime exports |
| `src/core-kernel/registry/contracts.ts` | add `OfficialModuleRegistrationEntryId` and `KernelModuleRegistrationEntryId`; widen startup declaration registration IDs; preserve `CoreModuleRegistrationEntryId` |
| `src/core-kernel/registry/strict-codec.ts` | recognize the additive domain entry ID while preserving exact unknown-ID rejection |

No change is planned for `commands/**`, `session/**`, `events/**`, `read/session-state.ts`, Registry gateway/runtime/assembly/builtins, reports, migration, domain document schema, package files, or `tsconfig.json`.

### 16.3 Planned tests

| File | Responsibility |
|---|---|
| `test/core-kernel/module-sdk-contracts.test.ts` | SDK type/runtime exports, typed opaque definitions, exact decoder input, nine/four-field shapes, and issue/error behavior |
| `test/core-kernel/module-sdk-hostile-input.test.ts` | accessors/Proxy/sparse/cycle/prototype/extra-field/function-slot rejection |
| `test/core-kernel/module-catalog-assembly.test.ts` | valid two-module compile, canonical order, identity parity, frozen opaque/private state, zero calls |
| `test/core-kernel/module-catalog-failures.test.ts` | stage precedence and exact failure/privacy matrix |
| `test/core-kernel/module-catalog-limits.test.ts` | all six enforced exact boundary/boundary+1 cases and three frozen runtime constants |
| `test/core-kernel/fixtures/synthetic-official-modules.ts` | two neutral reusable static fixtures and call counters |

Existing tests modified narrowly:

- `test/core-kernel/public-api-boundary.test.ts`: assert unchanged root runtime keys, four approved type names, and forbidden authoring internals.
- `test/core-kernel/forbidden-dependency-boundary.test.ts`: add explicit SDK/Core containment assertions if current recursive scan does not already prove them.
- `test/core-kernel/registry-contracts.test.ts`: characterize additive ID decoding and prove Core-only factory behavior remains unchanged.

## 17. Decisive fixture matrix

### 17.1 Good

Full manifest contains accepted Core modules plus:

- `fixture.score.module`, builtin, namespace `fixture.score`, contribution `fixture.score.contribution.v1`, command `fixture.score.touch`, effect `fixture.score.replace`, schema version `[1]`, score owner;
- `fixture.part.module`, internal-module, namespace `fixture.part`, contribution `fixture.part.contribution.v1`, command `fixture.part.touch`, effect `fixture.part.replace`, schema version `[1]`, Part owner.

Each fixture first defines its typed command and effect through
`defineDomainCommandV1` and `defineModuleEffectV1`, unwraps only `defined`
results, then places the opaque handles into its nine-field contribution and
four-field registration entry builders. No fixture constructs a compiled
definition structurally.

Expected:

- `ok: true`;
- canonical module/contribution/command/effect/namespace order;
- public handle frozen and method-free;
- private nested data frozen and input-detached;
- two separately compiled catalogs have different private identities;
- all callback counters remain zero.

### 17.2 Base variations

- caller reverses module/entry/contribution arrays: normalized result order stays equal;
- caller mutates every original data array after success: private state stays equal;
- functions carry enumerable custom properties: those properties do not enter public/private data summaries;
- command/effect handles expose only `descriptor` through `Object.keys`, have no callback property or method, and remain authentic after caller mutation attempts;
- zero command/effect arrays on a validation-only contribution compile when every other contract passes;
- exact cap values compile.

### 17.3 Bad

One case per earliest stage plus combination cases proving precedence:

- malformed manifest + bad binding -> invalid startup input;
- missing entry + wrong capability -> registration entry not found;
- owner mismatch + duplicate command -> owner mismatch;
- unsupported runtime + duplicate namespace -> unsupported runtime;
- duplicate command + bad requirement -> invalid contribution at uniqueness stage;
- requirement mismatch + bad effect -> invalid contribution at requirement stage;
- declared async/generator slot -> invalid contribution/definition invalid;
- structurally forged, copied-brand, Proxy-wrapped, or cross-SDK-instance command/effect handle -> definition invalid or `registry.handler-mismatch` at the earliest applicable stage;
- boundary+1 for each enforced cap;
- callback that throws or returns Promise when called: catalog still compiles without invoking it; counters remain zero, leaving runtime rejection to CVN-6.

Every bad catalog case asserts no authentic handle, no private WeakMap state, no callback activity, and no leaked input value.

### 17.4 Compile-time SDK fixture

The unreachable type-contract block in
`test/core-kernel/module-sdk-contracts.test.ts` must make all of these claims
under the repository's real `strict` configuration:

1. two different command types and two different effect-payload types can be
   defined and collected in one contribution without `any`, a type assertion,
   or bivariant method syntax;
2. pairing one command decoder with another command type's preparer is a
   required `@ts-expect-error`;
3. pairing one effect decoder with another payload type's transformer is a
   required `@ts-expect-error`;
4. a raw descriptor/callback object is not assignable to either opaque compiled
   handle;
5. `DomainCommandDecoderV1` receives exactly the typed
   `DomainCommandDecodeInputV1` shell and its decoder implementation handles
   both `target` and `payload` as `unknown`;
6. a `ModuleKernelErrorBase<ModuleId, Code>` subclass cannot call `super()`
   with another module ID or code namespace.

Typecheck must fail if any negative line stops producing an error. Runtime
execution of the test file remains a no-op for these type-only assertions.

## 18. Compatibility fences

The implementation candidate must prove:

1. `Object.keys(coreKernel)` equals the accepted runtime list.
2. all current twenty-five Core command IDs and the existing Core Registry summary are equal; the later parent-owned path to twenty-eight fixed Core IDs is unchanged and outside CVN-2.
3. existing `createKernelRegistry(CORE_KERNEL_STARTUP_MANIFEST)` remains successful and behaviorally equal.
4. existing unknown registration IDs remain `registry.invalid-startup-input`; the one new ID is decoded but Core-only construction with an integrated manifest does not create an integrated runtime.
5. all GD-0 tagged public-contract fences and the active combined fence retain their accepted text/hash.
6. no Core source imports Guitar, UI, platform, filesystem, network, or an external package.
7. the full pre-CVN-2 test suite remains green.
8. the SDK runtime allowlist is exactly the eight names in section 2.2 and its
   type allowlist is exactly the thirty-four names in section 2.2.

## 19. Rollback design

Rollback is file-additive:

1. remove the seven new SDK/catalog files;
2. remove the four type-only root exports;
3. remove the additive registration ID aliases and strict-codec recognition;
4. remove CVN-2 tests/fixtures;
5. rerun the accepted Core-only suite.

No `ScoreDocument` field, encoded document, command history entry, checkpoint, migration step, event, Registry persisted value, or public runtime function is created by CVN-2, so rollback requires no data migration.

## 20. Stop conditions

The operator stops and returns this task to planning when any implementation pressure requires:

- changing a GD-0 tagged public field/discriminant;
- adding a tenth field to `CompiledDomainCommandContributionV1`;
- requiring `any`, a public cast helper, or bivariant callback methods to place
  heterogeneous command/effect definitions in one contribution;
- changing the decoder invocation away from the exact two-field
  `DomainCommandDecodeInputV1` shell;
- executing a callback during CVN-2 catalog construction;
- changing `createKernelRegistry()` into integrated construction;
- touching command/session/history/replay/event behavior;
- adding a new Registry failure code rather than using the mapping above;
- a Core-to-domain import;
- dynamic module discovery/install/unload/reload;
- mutable catalog state or a second transaction owner;
- a generic patch/path, whole-document replacement, mutable document, or module-provided inverse.
