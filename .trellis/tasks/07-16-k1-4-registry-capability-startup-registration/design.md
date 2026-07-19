# K1-4 Registry Capability Startup Registration Design

## Status and authority

- This document is the approved K1-4 technical contract. The user approved `prd.md`, this file, and `implement.md` together on 2026-07-17.
- The implementation candidate is complete on `codex/k1-4-registry-capability-startup-registration`; Tasks 1–6 plus acceptance repairs pass 125/125 tests and await independent acceptance.
- K1-1 through K1-3 remain frozen compatibility inputs. K1-4 may add Registry/Gateway APIs but cannot change score persistence, command envelopes, mutation/history, replay, snapshots, selectors, or document/session events.
- Active Core and product Registry specifications must be synchronized to this task after approval; older broad contribution and registry-change-event lists are superseded.

## Architecture

K1-4 adds four focused units under `src/core-kernel/registry/`:

1. `contracts.ts`: public identity, capability, manifest, summary, selector-dispatch, result, and failure types.
2. `builtins.ts`: the frozen default startup manifest plus private compiled registrations for the six commands and six selectors.
3. `strict-codec.ts`: fail-closed decoding and normalization of `unknown` startup manifests and selector requests.
4. `runtime.ts`: the all-or-nothing factory, opaque ready Registry, and capability-scoped module gateway.

The public root exports the approved contracts, factory, default manifest, `KernelRegistry`, and `KernelModuleGateway`. Compiled handler tables, decoded candidate state, lookup arrays, codecs, and registration mutation functions remain internal.

## Public contracts

### Versions, identity, and capabilities

```typescript
export type KernelRegistryApiVersion = 1;
export type KernelStartupManifestVersion = 1;

export type KernelModuleOrigin = "official" | "third-party";
export type KernelModuleRuntime =
  | "builtin"
  | "internal-module"
  | "javascript-typescript";
export type KernelTrustLevel = "system-trusted" | "sandboxed";

export type KernelCapability =
  | "registry:read"
  | "command:register"
  | "selector:register"
  | "command:execute"
  | "selector:execute"
  | "score:read"
  | "event:subscribe";

export type CoreModuleRegistrationEntryId =
  | "core.commands.v1"
  | "core.selectors.v1";

export interface KernelModuleIdentity {
  readonly moduleId: string;
  readonly origin: KernelModuleOrigin;
  readonly runtime: KernelModuleRuntime;
  readonly trustLevel: KernelTrustLevel;
  readonly apiVersion: KernelRegistryApiVersion;
  readonly capabilities: readonly KernelCapability[];
}

export interface KernelStartupModuleDeclaration
  extends KernelModuleIdentity {
  readonly registrationEntryIds: readonly CoreModuleRegistrationEntryId[];
}

export interface KernelStartupModuleManifest {
  readonly startupManifestVersion: KernelStartupManifestVersion;
  readonly modules: readonly KernelStartupModuleDeclaration[];
}
```

The default `CORE_KERNEL_STARTUP_MANIFEST` contains `core.commands` with `command:register` and entry `core.commands.v1`, plus `core.selectors` with `selector:register` and entry `core.selectors.v1`. Consumer modules may appear with no registration entry and only the capabilities granted by the trusted Host manifest.

### Contribution and summary types

```typescript
export type CoreSelectorId =
  | "core.selector.score-metadata"
  | "core.selector.score-entity"
  | "core.selector.score-entity-ownership"
  | "core.selector.score-range"
  | "core.selector.history-state"
  | "core.selector.dirty-state";

export interface RegistryModuleSummary {
  readonly moduleId: string;
  readonly apiVersion: 1;
}

interface RegistryContributionSummaryBase {
  readonly id: string;
  readonly sourceModuleId: string;
  readonly apiVersion: 1;
  readonly requiredCapabilities: readonly KernelCapability[];
  readonly titleKey: string;
}

export type RegistryContributionSummary =
  | (RegistryContributionSummaryBase & {
      readonly kind: "command";
      readonly targetKind: ScoreEntityTarget["kind"];
    })
  | (RegistryContributionSummaryBase & {
      readonly kind: "selector";
      readonly inputKind: "snapshot" | "read-state";
    });

export interface RegistrySummary {
  readonly startupManifestVersion: 1;
  readonly modules: readonly RegistryModuleSummary[];
  readonly contributions: readonly RegistryContributionSummary[];
}
```

Command contribution IDs are the existing six `CoreCommandId` values. Selector IDs are the six `CoreSelectorId` values above. Command required capabilities are exactly `["command:execute"]`; selector required capabilities are exactly `["score:read", "selector:execute"]` in lexical order.

### Stable selector requests

```typescript
export type CoreSelectorRequest =
  | { readonly selectorId: "core.selector.score-metadata" }
  | {
      readonly selectorId: "core.selector.score-entity";
      readonly address: unknown;
    }
  | {
      readonly selectorId: "core.selector.score-entity-ownership";
      readonly address: unknown;
    }
  | {
      readonly selectorId: "core.selector.score-range";
      readonly range: unknown;
    }
  | { readonly selectorId: "core.selector.history-state" }
  | { readonly selectorId: "core.selector.dirty-state" };

export type CoreSelectorResult =
  | ReadResult<ScoreMetadata>
  | ReadResult<SelectedScoreEntity>
  | ReadResult<ScoreEntityOwnership>
  | ReadResult<ScoreRangeSelection>
  | ReadResult<KernelHistoryState>
  | ReadResult<boolean>;
```

`KernelModuleGateway.select` exposes overloads for the six request variants and one `unknown` implementation signature. Dispatch shape is strictly decoded; selector-owned address/range validation remains in the accepted K1-3 selector.

### Failures and results

```typescript
export type KernelRegistryStartupFailure =
  | { readonly code: "registry.invalid-startup-input" }
  | {
      readonly code: "registry.registration-entry-not-found";
      readonly registrationEntryId: string;
    }
  | {
      readonly code: "registry.registration-owner-mismatch";
      readonly registrationEntryId: string;
      readonly moduleId: string;
    }
  | { readonly code: "registry.duplicate-module-id"; readonly moduleId: string }
  | {
      readonly code: "registry.duplicate-contribution-id";
      readonly contributionId: string;
    }
  | { readonly code: "registry.unsupported-origin"; readonly moduleId: string }
  | { readonly code: "registry.unsupported-runtime"; readonly moduleId: string }
  | {
      readonly code: "registry.unsupported-trust-level";
      readonly moduleId: string;
    }
  | {
      readonly code: "registry.api-version-incompatible";
      readonly moduleId: string;
    }
  | {
      readonly code: "registry.capability-denied";
      readonly moduleId: string;
      readonly capability: KernelCapability;
    }
  | {
      readonly code: "registry.invalid-contribution";
      readonly registrationEntryId: string;
    }
  | {
      readonly code: "registry.handler-mismatch";
      readonly contributionId: string;
    }
  | { readonly code: "registry.internal-error" };

export type KernelRegistryAccessFailure =
  | { readonly code: "registry.invalid-invocation" }
  | { readonly code: "registry.module-not-found"; readonly moduleId: string }
  | {
      readonly code: "registry.contribution-not-found";
      readonly contributionId: string;
    }
  | {
      readonly code: "registry.capability-denied";
      readonly moduleId: string;
      readonly capability: KernelCapability;
    }
  | { readonly code: "registry.internal-error" };

export type KernelRegistryCreationResult =
  | { readonly ok: true; readonly registry: KernelRegistry }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

export type KernelGatewayResult<T> =
  | { readonly status: "authorized"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: KernelRegistryAccessFailure };

export type KernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: KernelModuleGateway }
  | { readonly ok: false; readonly failure: KernelRegistryAccessFailure };
```

### Runtime surface

```typescript
export function createKernelRegistry(
  manifest: unknown,
): KernelRegistryCreationResult;

export class KernelRegistry {
  private constructor(/* private normalized state */);

  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult;
}

export class KernelModuleGateway {
  summary(): KernelGatewayResult<RegistrySummary>;
  read(): KernelGatewayResult<ReadResult<KernelReadState>>;
  submit(input: unknown): KernelGatewayResult<CommandResult>;
  undo(): KernelGatewayResult<CommandResult>;
  redo(): KernelGatewayResult<CommandResult>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult>;
  subscribe(handler: unknown): KernelGatewayResult<EventSubscriptionResult>;
}
```

The Registry is returned only to the trusted Host. Internal modules receive only a gateway. There is no public method that returns Registry state, identities, handler bindings, or a mutable collection.

## Startup and dispatch flows

### Atomic startup

1. `createKernelRegistry` decodes `manifest` using exact fields, own data properties, dense arrays, finite values, and closed unions. Accepted records are detached from `descriptor.value`, so ordinary Proxy `get` traps are never invoked after validation; accessors, failing Proxy meta-operations, and unsafe IDs become `registry.invalid-startup-input`. Manifest-supplied IDs must be 1–128 lowercase ASCII namespace characters matching `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`.
2. It rejects duplicate module IDs, duplicate capabilities/entry IDs, unsupported identity combinations, and API version mismatch.
3. Each registration entry ID resolves against the private compiled table and must be owned by the declaring module. The declaring module must have the contribution kind's registration capability.
4. Candidate contributions are validated for descriptor/handler agreement and global ID uniqueness.
5. Modules are sorted by `moduleId`; contributions are sorted by `kind` then `id`. Private arrays and the detached summary are deep-frozen.
6. Only after every check succeeds is a `KernelRegistry` constructed. Catch-all failure returns `registry.internal-error` and no Registry.

Candidate validation is a pure package-internal seam `buildRegistryCandidate(manifest, compiledRegistrationEntries)`. The public factory always supplies the frozen built-in table; tests may supply malformed internal fixtures to cover duplicate/invalid/handler-mismatch/internal failure branches. The seam and fixtures are never exported from `src/core-kernel/index.ts`.

### Gateway construction and capability order

`KernelRegistry.createGateway` validates that `moduleId` exists and captures the immutable identity plus Registry state and supplied `CommandBus`. It does not mutate either object.

Every gateway call applies this order:

1. Check the method-level capability before decoding attacker-controlled invocation input.
2. Resolve the registered contribution and verify its complete required-capability list. Startup validation and disjoint command/selector IDs guarantee the resolved kind; no runtime kind-mismatch failure is exposed.
3. Delegate to the existing trusted-host API.
4. Return the existing result nested in `KernelGatewayResult` without rewriting it.
5. Convert unexpected exceptions to `registry.internal-error` without state changes or raw error leakage.

### Commands

- `submit` requires `command:execute`. A recognized valid Core command must also be present as a registered command contribution.
- Malformed envelopes and unknown command IDs retain the canonical K1-2 `CommandResult` rejection after authorization; K1-4 does not create a second command codec contract.
- `undo` and `redo` require `command:execute` and delegate directly. Registry failures occur before CommandBus mutation.
- No gateway call adds module identity to the command envelope, history, replay, or events.

### Reads and selectors

- `read` requires `score:read` and delegates to `CommandBus.read()`.
- `select` requires `score:read` and `selector:execute`, resolves a registered selector, calls `CommandBus.read()`, and supplies its current snapshot or read state according to `inputKind`.
- Existing selector failure codes and deep-freeze behavior are retained.

### Summary and events

- `summary` requires `registry:read` and returns a structured clone of the prebuilt frozen summary, deep-frozen before return. Repeated calls are deeply equal and share no mutable caller-owned references.
- `subscribe` requires `event:subscribe` and delegates to `CommandBus.subscribe`; invalid handlers retain `event.invalid-handler`, and K1-3 synchronous/asynchronous handler isolation remains unchanged.
- K1-4 defines no Registry event and does not modify `KernelEvent`.

## Compatibility, privacy, and rollback

- Direct Core Host execution remains the reference behavior. For equivalent authorized calls, gateway and direct execution must produce deeply equal command/read/event results and final documents.
- Replay continues to accept only the original command sequence and does not require a Registry or module identity.
- Unknown `ExtensionBlock` values and all K1-1 score data are untouched because Registry owns no score state.
- No Registry code depends on external packages, Node APIs, UI/render/audio/Tauri layers, wall clock, randomness, files, URLs, or dynamic imports.
- Rollback removes `src/core-kernel/registry/`, its public exports, and Registry tests. K1-1 through K1-3 sources and contracts remain intact.

## Test design

- Contract/codec tests cover exact fields, dense arrays, accessors/proxies, zero ordinary Proxy `get` execution, stable descriptor values, duplicates, version/identity/capability/entry failures, deterministic normalization, and total exception boundaries.
- Summary tests assert the exact two default modules, six commands, six selectors, ordering, deep freeze, detached reads, and forbidden policy/handler fields.
- Gateway tests use manifest-declared consumer modules with focused capability sets to prove every allowed and denied method independently, including equal `read()` behavior under equivalent manifest reordering.
- Integration tests compare direct and authorized gateway submit/undo/redo/read/select/subscribe behavior, including no-op/rejected commands, reentrant writes, handler isolation, and no module attribution.
- Public-boundary tests pin new exports and forbid compiled handler tables, codecs, mutable registry APIs, registry events/versions, K1-5 types, and speculative contribution kinds.
