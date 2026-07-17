# K1-4 Registry Capability Startup Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` in inline mode and complete each task with its own red/green verification before moving on. Do not dispatch implementation or check sub-agents for this repository workflow.

**Goal:** Add a deterministic, startup-only Registry and capability-scoped module gateway for the six accepted Core commands and six accepted selectors without changing K1-1/K1-2/K1-3 semantics.

**Architecture:** Strictly decode one static manifest, resolve only two private compiled registration entries, atomically construct an immutable Registry, and give declared modules a gateway that authorizes then delegates to existing `CommandBus`, selector, and subscription APIs. Registry state, handlers, command history, replay, and K1-3 events remain separate.

**Tech Stack:** TypeScript 5.8, Node test runner, existing Core strict-codec/deep-freeze patterns, no runtime dependencies.

## Global Constraints

- User approval of `prd.md`, `design.md`, and this plan was recorded on 2026-07-17; do not begin production work until active documents are synchronized, the dedicated K1-4 branch exists, and the Trellis task is explicitly started.
- Commit the preceding K1-3 Gate documentation closure, then create a new `codex/k1-4-registry-capability-startup-registration` branch; do not implement on `codex/k1-2-commands-transactions-history`.
- Preserve the K1-3 accepted baseline `7369eeac60fecea66c2c9164c04439625c2d78b0` plus the approved documentation closure.
- Only `command` and `selector` contributions exist in K1-4; only six existing command IDs and six selector IDs are bindable.
- No arbitrary handler registration, mutable Registry API, Registry version/event, module attribution in history/events, K1-5 reports, Guitar Domain, plugin runtime, external dependency, clock, randomness, path, URL, or dynamic import.
- Every externally reachable K1-4 operation returns a closed result and catches unexpected exceptions.
- Use TDD: add the focused failing test, confirm the expected failure, implement the minimum contract, rerun the focused test, then run the affected K1 regression tests.

---

### Task 1: Public contracts and frozen built-in catalog

**Files:**

- Create: `src/core-kernel/registry/contracts.ts`
- Create: `src/core-kernel/registry/builtins.ts`
- Create: `test/core-kernel/registry-contracts.test.ts`

**Interfaces:**

- Produces the exact public types from `design.md`: versions, identity enums, seven capabilities, manifest declarations, `CoreSelectorId`, selector requests/results, summary types, startup/access failure unions, creation/gateway result types.
- Produces `CORE_KERNEL_STARTUP_MANIFEST` with modules `core.commands` and `core.selectors`.
- Produces internal compiled entries `core.commands.v1` and `core.selectors.v1`; this symbol is not exported from the Core public root.

- [ ] **Step 1: Write the failing catalog contract test**

```typescript
import { test } from "node:test";
import assert = require("node:assert/strict");
import { CORE_KERNEL_STARTUP_MANIFEST } from "../../src/core-kernel/registry/builtins";

test("default startup manifest is deeply frozen and owns two compiled entries", () => {
  assert.deepEqual(CORE_KERNEL_STARTUP_MANIFEST, {
    startupManifestVersion: 1,
    modules: [
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
    ],
  });
  assert.equal(Object.isFrozen(CORE_KERNEL_STARTUP_MANIFEST), true);
  assert.equal(Object.isFrozen(CORE_KERNEL_STARTUP_MANIFEST.modules), true);
  CORE_KERNEL_STARTUP_MANIFEST.modules.forEach((module) => {
    assert.equal(Object.isFrozen(module), true);
    assert.equal(Object.isFrozen(module.capabilities), true);
    assert.equal(Object.isFrozen(module.registrationEntryIds), true);
  });
});
```

- [ ] **Step 2: Confirm the test is red**

Run: `npm run typecheck`

Expected: FAIL because `src/core-kernel/registry/builtins.ts` does not exist.

- [ ] **Step 3: Add the exact contract unions and built-in descriptors**

Implement the signatures in `design.md` verbatim. Build command entries from `CORE_COMMAND_DEFINITIONS`; define selector entries with these exact metadata values:

```typescript
const CORE_SELECTOR_DEFINITIONS = [
  ["core.selector.score-metadata", "snapshot", "core.selector.score-metadata.title"],
  ["core.selector.score-entity", "snapshot", "core.selector.score-entity.title"],
  ["core.selector.score-entity-ownership", "snapshot", "core.selector.score-entity-ownership.title"],
  ["core.selector.score-range", "snapshot", "core.selector.score-range.title"],
  ["core.selector.history-state", "read-state", "core.selector.history-state.title"],
  ["core.selector.dirty-state", "read-state", "core.selector.dirty-state.title"],
] as const;
```

Use explicit command title keys:

```typescript
const COMMAND_TITLE_KEYS = {
  "core.document.set-metadata": "core.command.set-metadata.title",
  "core.note.set-written-pitch": "core.command.set-written-pitch.title",
  "core.event.set-note-value": "core.command.set-note-value.title",
  "core.voice.insert-notes-event": "core.command.insert-notes-event.title",
  "core.voice.insert-rest-event": "core.command.insert-rest-event.title",
  "core.event.remove": "core.command.remove-event.title",
} as const;
```

Deep-freeze the public manifest and every descriptor/array. Keep compiled selector functions and command definitions inside non-public entry records.

- [ ] **Step 4: Verify catalog contracts**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-contracts.test.js`

Expected: PASS, one test.

- [ ] **Step 5: Commit the contract slice**

```powershell
git add src/core-kernel/registry/contracts.ts src/core-kernel/registry/builtins.ts test/core-kernel/registry-contracts.test.ts
git commit -m "feat(core): define k1-4 registry contracts"
```

---

### Task 2: Strict manifest codec and atomic Registry factory

**Files:**

- Create: `src/core-kernel/registry/strict-codec.ts`
- Create: `src/core-kernel/registry/runtime.ts`
- Modify: `test/core-kernel/registry-contracts.test.ts`

**Interfaces:**

- Consumes `KernelStartupModuleManifest`, compiled entry IDs, and startup failures from Task 1.
- Produces `createKernelRegistry(manifest: unknown): KernelRegistryCreationResult` and opaque `KernelRegistry` candidate state.

- [ ] **Step 1: Add the strict-rejection matrix before the factory exists**

Add table-driven tests for `undefined`, primitives, extra/missing fields, wrong versions/unions, empty IDs, duplicate capabilities/entry IDs/module IDs, accessors, throwing proxies, and sparse arrays. Include the sparse-array fast-fail shape:

```typescript
const sparseModules: unknown[] = [];
sparseModules.length = 1_000_000;
const result = createKernelRegistry({
  startupManifestVersion: 1,
  modules: sparseModules,
});
assert.deepEqual(result, {
  ok: false,
  failure: { code: "registry.invalid-startup-input" },
});
```

Add focused assertions for:

```typescript
"registry.duplicate-module-id"
"registry.registration-entry-not-found"
"registry.registration-owner-mismatch"
"registry.unsupported-origin"
"registry.unsupported-runtime"
"registry.unsupported-trust-level"
"registry.api-version-incompatible"
"registry.capability-denied"
```

- [ ] **Step 2: Confirm red state**

Run: `npm run typecheck`

Expected: FAIL because `createKernelRegistry` and `KernelRegistry` are not implemented.

- [ ] **Step 3: Implement fail-closed manifest decoding**

Reuse the K1-2 strict-codec rules without importing its private helpers: inspect own property descriptors, require enumerable data properties and exact keys, inspect `Reflect.ownKeys()` before iterating declared array length, reject holes/extra keys, clone accepted values, and wrap the full decoder in `try/catch`.

Normalize accepted module capabilities and registration IDs lexically. Reject duplicate values before normalization. Do not retain the caller's manifest or arrays.

- [ ] **Step 4: Implement candidate validation and all-or-nothing construction**

In `createKernelRegistry`:

```typescript
export function createKernelRegistry(manifest: unknown): KernelRegistryCreationResult {
  try {
    const decoded = decodeKernelStartupManifest(manifest);
    if (!decoded.ok) return decoded;
    const candidate = buildRegistryCandidate(decoded.value);
    return candidate.ok
      ? { ok: true, registry: new KernelRegistry(REGISTRY_TOKEN, candidate.state) }
      : candidate;
  } catch {
    return { ok: false, failure: { code: "registry.internal-error" } };
  }
}
```

Use a private construction token. Resolve each entry only from the compiled table; require owner equality and `command:register` or `selector:register`; reject global duplicate contribution IDs and descriptor/handler kind mismatch. Construct no Registry before all checks finish.

- [ ] **Step 5: Verify focused factory behavior and unchanged prior tests**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-contracts.test.js dist/test/core-kernel/command-system.test.js dist/test/core-kernel/read-system.test.js`

Expected: all focused, command, and read tests pass.

- [ ] **Step 6: Commit the atomic factory slice**

```powershell
git add src/core-kernel/registry/strict-codec.ts src/core-kernel/registry/runtime.ts test/core-kernel/registry-contracts.test.ts
git commit -m "feat(core): add atomic registry startup"
```

---

### Task 3: Deterministic frozen summary and gateway creation

**Files:**

- Modify: `src/core-kernel/registry/runtime.ts`
- Create: `test/core-kernel/registry-gateway.test.ts`
- Modify: `test/core-kernel/registry-contracts.test.ts`

**Interfaces:**

- Produces `KernelRegistry.createGateway(moduleId, commandBus)` and `KernelModuleGateway.summary/read`.
- Produces `KernelGatewayResult<T>` nesting without changing `ReadResult`.

- [ ] **Step 1: Add deterministic summary tests**

Create a manifest that reverses modules and entry IDs, plus a zero-contribution consumer module `internal.reader` with `registry:read` and `score:read`. Assert both orderings yield the same summary: modules sorted by ID and exactly 12 contributions sorted by kind+ID.

Assert every summary object/array and `requiredCapabilities` array is frozen, repeated results are deeply equal, and mutation attempts do not change a later result. Assert serialized summary text contains none of:

```typescript
["handler", "origin", "runtime", "trustLevel", "capabilities", "registryVersion"]
```

- [ ] **Step 2: Add gateway capability tests before methods exist**

Use `internal.reader` and an unprivileged `internal.none` module. Assert unknown module creation returns `registry.module-not-found`, `internal.none.summary()` returns `registry.capability-denied`, and `internal.reader.read()` nests the same result as direct `CommandBus.read()` on an equivalent bus.

- [ ] **Step 3: Implement immutable state and gateway creation**

Store private frozen arrays, not publicly reachable mutable `Map`/`Set` values. Prebuild a private frozen summary. `createGateway` finds the module by exact ID, captures its frozen identity and the supplied bus, and catches unexpected errors.

Implement method authorization with one helper:

```typescript
function requireCapabilities(
  module: NormalizedModule,
  required: readonly KernelCapability[],
): KernelRegistryAccessFailure | undefined {
  for (const capability of required) {
    if (!module.capabilities.includes(capability)) {
      return {
        code: "registry.capability-denied",
        moduleId: module.moduleId,
        capability,
      };
    }
  }
  return undefined;
}
```

`summary()` requires `registry:read`; `read()` requires `score:read`. Return a detached deep-frozen summary and nest the unchanged `bus.read()` result.

- [ ] **Step 4: Verify summary/gateway slice**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-contracts.test.js dist/test/core-kernel/registry-gateway.test.js dist/test/core-kernel/read-system.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the summary/gateway slice**

```powershell
git add src/core-kernel/registry/runtime.ts test/core-kernel/registry-contracts.test.ts test/core-kernel/registry-gateway.test.ts
git commit -m "feat(core): expose capability scoped registry summary"
```

---

### Task 4: Registered selector dispatch

**Files:**

- Modify: `src/core-kernel/registry/strict-codec.ts`
- Modify: `src/core-kernel/registry/runtime.ts`
- Modify: `test/core-kernel/registry-gateway.test.ts`

**Interfaces:**

- Consumes the six existing selector functions and current `KernelReadState`.
- Produces strict `KernelModuleGateway.select(input: unknown): KernelGatewayResult<CoreSelectorResult>` with six typed overloads.

- [ ] **Step 1: Add red tests for all selectors and authorization order**

Declare modules with: both selector capabilities, only `selector:execute`, only `score:read`, and neither. Assert both capabilities are required and the first missing capability is deterministic.

For the fully authorized module, compare each gateway result to direct selector execution for metadata, entity, ownership, range, history, and dirty. Add invalid request, extra-field, unknown selector, command-ID-as-selector, and manifest-without-selector-entry cases.

- [ ] **Step 2: Confirm red state**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-gateway.test.js`

Expected: FAIL because `select` is absent.

- [ ] **Step 3: Implement strict selector-request dispatch**

Decode exact request keys by selector ID. Check method capabilities before decoding. Resolve the contribution and require `kind === "selector"`; return `registry.contribution-not-found`, `registry.contribution-kind-mismatch`, or `registry.invalid-invocation` as appropriate.

Call `commandBus.read()` once. Route snapshot selectors to `read.value.snapshot` and read-state selectors to the full `read.value`. If `CommandBus.read()` returns failure, return that unchanged as the authorized selector result. Call only the private built-in selector adapter and catch unexpected exceptions as `registry.internal-error`.

- [ ] **Step 4: Verify selector parity**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-gateway.test.js dist/test/core-kernel/read-system.test.js dist/test/core-kernel/address-range.test.js`

Expected: all tests pass and direct selector fixtures remain unchanged.

- [ ] **Step 5: Commit selector dispatch**

```powershell
git add src/core-kernel/registry/strict-codec.ts src/core-kernel/registry/runtime.ts test/core-kernel/registry-gateway.test.ts
git commit -m "feat(core): authorize registered selector access"
```

---

### Task 5: Command, history, and event gateway parity

**Files:**

- Modify: `src/core-kernel/registry/runtime.ts`
- Modify: `test/core-kernel/registry-gateway.test.ts`

**Interfaces:**

- Produces gateway `submit`, `undo`, `redo`, and `subscribe` methods.
- Delegates to existing `CommandBus` only; no new mutation/history/event type is introduced.

- [ ] **Step 1: Add red command authorization and parity tests**

Use equivalent direct/gateway buses and a module with `command:execute`. Submit committed, no-op, semantic-rejected, malformed, and unknown-ID commands; assert nested gateway values deeply equal direct `CommandResult`, final read states match, and events match exactly.

Add denied command module tests proving no changes to documentVersion, undoDepth, redoDepth, dirty, or events. Add undo/redo parity and a manifest without `core.commands.v1` proving a recognized Core command returns `registry.contribution-not-found` before bus mutation.

- [ ] **Step 2: Add red subscription tests**

Assert `event:subscribe` is independently required. For an authorized module, assert invalid handlers preserve `{ status: "rejected", failure: { code: "event.invalid-handler" } }`, subscriber order and unsubscribe remain unchanged, and synchronous throw plus Promise/thenable rejection stay isolated.

- [ ] **Step 3: Implement command methods**

For `submit`, check `command:execute`, use the existing internal decoder to distinguish a recognized valid `CoreCommandId`, require its registered command contribution, then call `CommandBus.submit(input)`. If the canonical command decoder rejects malformed/unknown input, delegate after capability authorization so K1-2 retains ownership of the command failure code.

For `undo`/`redo`, check `command:execute` then delegate. Wrap only Registry authorization/internal failures; never rewrite `CommandResult`.

- [ ] **Step 4: Implement subscription delegation**

Check `event:subscribe`, then return the unchanged result of `CommandBus.subscribe(handler)`. Do not wrap handlers, add module fields, filter the two accepted internal events, publish Registry events, or alter the CommandBus subscriber collection.

- [ ] **Step 5: Verify full gateway integration**

Run: `npm run build`

Run: `node --test dist/test/core-kernel/registry-gateway.test.js dist/test/core-kernel/command-system.test.js dist/test/core-kernel/dirty-checkpoint.test.js dist/test/core-kernel/event-system.test.js`

Expected: all tests pass; direct and gateway paths are deeply equal.

- [ ] **Step 6: Commit command/event integration**

```powershell
git add src/core-kernel/registry/runtime.ts test/core-kernel/registry-gateway.test.ts
git commit -m "feat(core): authorize command and event gateway access"
```

---

### Task 6: Public boundary, specifications, and final gate

**Files:**

- Modify: `src/core-kernel/index.ts`
- Modify: `test/core-kernel/public-api-boundary.test.ts`
- Modify: `.trellis/spec/core-kernel/backend/registry-capability.md`
- Modify: `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-015-kernel-registry-capability.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-018-kernel-registry-capability.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-009-extension-api.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/microkernel-architecture.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/modular-plugin-architecture.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/software-architecture.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/prd.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/design.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/implement.md`

**Interfaces:**

- Public runtime exports: `CORE_KERNEL_STARTUP_MANIFEST`, `createKernelRegistry`, `KernelRegistry`, `KernelModuleGateway`.
- Public TypeScript contracts: only the approved registry/identity/capability/summary/request/result types.
- No internal compiled entries, codecs, private state, handler maps, mutation APIs, Registry events/versions, reports, or speculative contribution types.

- [ ] **Step 1: Update the public export allowlist test first**

Add the four runtime exports to the exact sorted allowlist. Extend the forbidden names with:

```typescript
[
  "CORE_COMPILED_REGISTRATION_ENTRIES",
  "decodeKernelStartupManifest",
  "decodeCoreSelectorRequest",
  "register",
  "unregister",
  "replaceContribution",
  "sealRegistry",
  "registryVersion",
  "KernelRegistryChangedEvent",
  "KernelError",
  "KernelReport",
  "TechniqueDefinitionContribution",
  "MigrationContribution",
  "ImporterContribution",
  "ExporterContribution",
  "TemplateContribution",
]
```

Assert `src/core-kernel/index.ts` does not re-export `registry/builtins` wholesale, `registry/strict-codec`, or private runtime state.

- [ ] **Step 2: Export only the approved boundary and make the test green**

Use named runtime exports and type exports; do not use `export *` from files that contain private compiled symbols.

Run: `npm run build`

Run: `node --test dist/test/core-kernel/public-api-boundary.test.js dist/test/core-kernel/forbidden-dependency-boundary.test.js`

Expected: both tests pass.

- [ ] **Step 3: Synchronize active planning/spec documents**

Record the final approved K1-4 contract: exactly command+selector contributions, seven capabilities, atomic immutable startup, minimal summary, local failures, no registryVersion/event, no history/event module attribution, and implementation baseline/status. Remove superseded broad candidate claims from active documents; do not rewrite archived snapshots or retired drafts.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

Run: `npm test`

Expected: all tests pass, including all prior 102 tests plus K1-4 tests.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

Run: `python ./.trellis/scripts/task.py validate 07-16-k1-4-registry-capability-startup-registration`

Expected: `All validations passed`.

Run a final `rg` scan proving no active executable document still requires validator/technique/migration/import/export/template contributions, `registryVersion`, or `kernel.registry.changed` for K1-4.

- [ ] **Step 5: Review the complete diff before the acceptance commit**

Confirm no changes under score model/codec/validation except imports required by Registry types; no K1-2 mutation/history/replay structure changes; no K1-3 event union changes; no archived task or `.trellis/maintenance/` changes.

```powershell
git status --short
git diff --stat
git diff --check
```

- [ ] **Step 6: Commit the public/spec closure**

```powershell
git add src/core-kernel/index.ts test/core-kernel/public-api-boundary.test.ts .trellis/spec/core-kernel/backend/registry-capability.md .trellis/spec/core-kernel/backend/pure-kernel-boundary.md .trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-015-kernel-registry-capability.md .trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-018-kernel-registry-capability.md .trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-009-extension-api.md .trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md .trellis/tasks/06-29-commercial-guitar-tablature-product/design.md .trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md .trellis/tasks/06-29-commercial-guitar-tablature-product/technical/microkernel-architecture.md .trellis/tasks/06-29-commercial-guitar-tablature-product/technical/modular-plugin-architecture.md .trellis/tasks/06-29-commercial-guitar-tablature-product/technical/software-architecture.md .trellis/tasks/07-07-pure-core-kernel-v1/prd.md .trellis/tasks/07-07-pure-core-kernel-v1/design.md .trellis/tasks/07-07-pure-core-kernel-v1/implement.md .trellis/tasks/07-16-k1-4-registry-capability-startup-registration/prd.md .trellis/tasks/07-16-k1-4-registry-capability-startup-registration/design.md .trellis/tasks/07-16-k1-4-registry-capability-startup-registration/implement.md
git commit -m "docs(core): close k1-4 registry contract"
```

Do not start K1-5, Guitar Domain, Extension Host, UI integration, or K1-4 acceptance archival in this implementation task. K1-4 requires an independent acceptance review after the implementation branch is complete.
