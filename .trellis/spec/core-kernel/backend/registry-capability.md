# Registry and Capability

> **K1-4 accepted (2026-07-19):** the archived decision-complete package is
> `.trellis/tasks/archive/2026-07/07-16-k1-4-registry-capability-startup-registration/`.
> The accepted baseline is `94766a0930c05e5339c44f667deaf02116af1c0c`; 125/125 tests pass.
> K1-1 through K1-3 remain frozen inputs.
>
> **CVN-3 review candidate (2026-08-04):**
> `d9500f5a8ac285071586ba8eda380370eafd022f` retains the same startup-frozen
> Registry architecture while adding four compiled Core command descriptors.
> Independent CVN3-AC028 review is still pending; this is not a Registry
> acceptance replacement.

## 1. Scope / Trigger

Use this boundary when a manifest-declared official Core module must discover or invoke one of the six legacy commands, four CVN-3 candidate Measure commands, or six K1-3 selectors through capability enforcement. K1-4 supports exactly two contribution kinds, `command` and `selector`, and only deterministic startup-time composition.

Hard validators, technique definitions, migrations, import/export descriptors, template descriptors, Guitar Domain, K1-5 reports, third-party execution, discovery, installation, sandboxing, hot reload, runtime enable/disable, and unload are outside K1-4. `ExtensionBlock` is persisted data, and `ScoreFeatureProfile` is support policy; neither grants capability or creates a contribution.

## 2. Signatures

```typescript
type KernelModuleOrigin = "official" | "third-party";
type KernelModuleRuntime =
  | "builtin"
  | "internal-module"
  | "javascript-typescript";
type KernelTrustLevel = "system-trusted" | "sandboxed";

type KernelCapability =
  | "registry:read"
  | "command:register"
  | "selector:register"
  | "command:execute"
  | "selector:execute"
  | "score:read"
  | "event:subscribe";

type CoreModuleRegistrationEntryId =
  | "core.commands.v1"
  | "core.selectors.v1";

function createKernelRegistry(
  manifest: unknown,
): KernelRegistryCreationResult;

class KernelRegistry {
  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult;
}

class KernelModuleGateway {
  summary(): KernelGatewayResult<RegistrySummary>;
  read(): KernelGatewayResult<ReadResult<KernelReadState>>;
  select(request: unknown): KernelGatewayResult<CoreSelectorResult>;
  submit(command: unknown): KernelGatewayResult<CommandResult>;
  undo(): KernelGatewayResult<CommandResult>;
  redo(): KernelGatewayResult<CommandResult>;
  subscribe(handler: unknown): KernelGatewayResult<EventSubscriptionResult>;
}
```

The complete type definitions, six `CoreSelectorId` values, startup/access failure unions, overloads, and default manifest are fixed by the approved K1-4 `design.md`.

## 3. Contracts

- `createKernelRegistry` strictly decodes the complete manifest, resolves only compiled `core.commands.v1` and `core.selectors.v1` bindings in isolated candidate state, and returns either one frozen ready Registry or a stable failure. Failure exposes no partial Registry.
- Exact record decoding copies only enumerable own `descriptor.value` fields into detached plain records. Ordinary Proxy `get` traps are never invoked after validation; accessors or failing Proxy meta-operations reject without escaping.
- K1-4 accepts only manifest-bound `official` + (`builtin` or `internal-module`) + `system-trusted` identities. A module cannot self-assign identity, trust, registration entries, or capabilities.
- `KernelModuleIdentity` owns moduleId/origin/runtime/trustLevel/apiVersion/capabilities; `KernelStartupModuleDeclaration` extends it only with registration-entry bindings.
- Manifest-supplied module/entry IDs are 1–128 characters matching `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`. Unsafe IDs are invalid startup input; safe unknown entry IDs retain the dedicated not-found failure.
- No capability implies another. `command:execute` covers submit/undo/redo; selector dispatch requires `selector:execute` plus `score:read`; summary and subscription require their own capabilities. Startup assembly and `markPersisted` are Host-only.
- The default manifest binds the six accepted legacy Core commands, the four CVN-3 candidate Measure commands, and six K1-3 selectors. The ten command descriptors remain compiled/static and use the same `command:execute` gateway authorization. Adapters authorize and delegate to existing `CommandBus`, selector, read, and subscription behavior; they do not create a second transaction, selector, event, or write path.
- Direct `CommandBus` and selector APIs remain trusted Core Host compatibility APIs. Internal modules use `KernelModuleGateway`.
- A ready Registry has no builder, public register/seal/unregister/replace, mutable status, runtime counter, `registryVersion`, or `kernel.registry.changed` event. The K1-3 `KernelEvent` union is unchanged.
- `RegistrySummary` contains only `startupManifestVersion: 1`, modules sorted by `moduleId` with `moduleId/apiVersion`, and contributions sorted by `kind/id` with approved public metadata. It is detached, deeply frozen, and omits grants, trust, handlers, indexes, Registry objects, and score data.
- `moduleId` is Registry authorization/summary metadata only. It is not added to command envelopes, history, replay, or K1-3 events.
- Every entrypoint catches unexpected exceptions and returns a closed privacy-safe failure. Denied/internal paths preserve document, version, history, dirty state, event sequence, subscriptions, and Registry state.
- `buildRegistryCandidate(manifest, compiledRegistrationEntries)` is package-internal and exists only to make corrupted compiled-table branches testable; production always supplies the frozen built-in table and the seam is not a public Core export.

## 4. Validation / Error Matrix

| Boundary | Rejects | Stable outcome |
| --- | --- | --- |
| Startup shape | accessors, sparse arrays, extra/missing fields, invalid finite values | `registry.invalid-startup-input` |
| Binding | unknown entry or wrong owner | `registry.registration-entry-not-found` / `registry.registration-owner-mismatch` |
| Identity | duplicate module, unsupported origin/runtime/trust, API mismatch | corresponding `registry.*` startup failure |
| Contribution | duplicate ID, missing registration capability, malformed descriptor, handler mismatch | corresponding `registry.*` startup failure |
| Gateway invocation | malformed request, unknown module/contribution | corresponding closed access failure |
| Authorization | required capability absent | `registry.capability-denied` |
| Unexpected exception | any startup or gateway boundary | `registry.internal-error`; prior state unchanged |

Startup and access failure unions are owned by K1-4. K1-5 may map them into later error/report structures but must not rename or reinterpret them.

## 5. Good / Base / Bad Cases

- Good: a manifest-declared consumer with `command:execute` submits an existing command through its gateway and receives the unchanged `CommandResult`.
- Good: an authorized selector consumer receives the unchanged K1-3 `ReadResult`, while repeated summary reads are deeply equal and frozen.
- Base: trusted Core Host code continues to call existing `CommandBus` and selectors directly.
- Bad: a module has `command:register` and assumes it may execute a command; the gateway rejects it.
- Bad: startup accepts a third-party runtime, arbitrary handler, dynamic contribution kind, or partial Registry.
- Bad: Registry creates a second write path, adds module attribution to history/events, or publishes a Registry-change event.

## 6. Tests Required

- Strict unknown decoding, accessor/sparse-array rejection, zero ordinary Proxy `get` execution, stable descriptor values, duplicate and API/runtime/trust/capability failures, and total exception boundaries.
- Atomic startup, deterministic manifest reordering with equal summary and representative command and selector gateway behavior, deep freeze/detachment, summary ordering/privacy, and no post-ready mutation API.
- Exactly ten static command and six selector adapters; authorized result parity with trusted-host calls. The CVN-3 addition is limited to `core.measure.insert`, `core.measure.remove`, `core.measure.move`, and `core.measure.set-definition`.
- Denied/invalid/internal gateway paths preserve all accepted K1-2/K1-3 state.
- Submit/undo/redo/read/select/subscribe capability matrices, handler throw/rejection isolation, and event/history/replay parity without module attribution.
- Public export and forbidden-dependency tests; full typecheck, build, test, diff check, and Trellis validation.

## 7. Wrong vs Correct

```typescript
// Wrong: mutable/dynamic Registry and implicit capability.
registry.register(pluginHandler);
registryVersion += 1;
eventBus.publish({ type: "kernel.registry.changed" });

// Correct: trusted Host performs one atomic startup; modules receive scoped gateways.
const created = createKernelRegistry(CORE_KERNEL_STARTUP_MANIFEST);
if (created.ok) {
  const gateway = created.registry.createGateway(moduleId, commandBus);
  // gateway authorizes, then delegates to accepted Core behavior.
}
```

## CVN-3 Candidate Descriptor Correlation

The candidate command contribution remains owned by `core.commands` with
`apiVersion: 1`, `requiredCapabilities: ["command:execute"]`, and no new
contribution kind or runtime mutation API. Its title keys and target kinds are:

| Command ID | Target kind | Title key |
| --- | --- | --- |
| `core.measure.insert` | `document` | `core.command.insert-measure.title` |
| `core.measure.remove` | `measure` | `core.command.remove-measure.title` |
| `core.measure.move` | `measure` | `core.command.move-measure.title` |
| `core.measure.set-definition` | `measure` | `core.command.set-measure-definition.title` |

For each row, authorized gateway `submit` must remain deeply equal to direct
`CommandBus.submit` for result, document state, and events. Capability denial
must occur before a mutation. A future command addition must update the static
catalog, compiled descriptor table, exact surface test, and this table in one
reviewed change; it must not add `register`, `unregister`, `replace`, or hot
reload behavior.

## CVN-5 Accepted Descriptor and Gateway Contract

CVN-5 adds exactly three additional document-target Core descriptors, bringing the completed Core catalog and Registry descriptor count from 25 to 28. All use the existing `command:execute` capability and gateway path; no `submitBatch`, capability kind, registration mutation or dynamic lifecycle API is added. Core-only batch routes Core children only; an accepted CVN-6 integrated assembly may route Core/module/mixed children while preserving one private assembly identity.

An integrated module gateway must authorize every recognized module child in a
decoded Batch using the same source-module and descriptor-capability checks as
a standalone command. Complete authorization precedes all preparation callbacks
and mutations; a foreign child returns `registry.contribution-not-found` even
after an otherwise authorized prefix. Submit the detached Batch that was checked,
not the caller's original object. Nested batches remain command-level rejections.
Trusted host calls directly to the integrated bus retain cross-module composition;
the Core Batch descriptor does not grant that authority to a scoped gateway.
