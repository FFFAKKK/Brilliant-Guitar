# Current Runtime and CVN-2 Consumer Audit

## Existing Runtime Owner

The accepted implementation already centralizes mutable session state in the current `CommandBus` and `KernelSessionState` path:

- `CommandBus` owns submit/undo/redo/read/markPersisted/subscribe;
- `createCommandRuntime(initialDocument, assembly)` executes through an explicit assembly and defaults to the Core-only assembly;
- history, redo invalidation, version, checkpoint/dirty identity and event sequence are one state package;
- `replayCoreCommands` is detached but reuses the Core command runtime;
- Registry gateway currently binds an authentic Registry receiver to an authentic Core-only bus.

CVN-6 must extend this owner rather than wrap it with a second document or history store.

## Accepted CVN-2 Input

CVN-2 publishes:

- a branded, frozen `KernelIntegratedCatalog` handle;
- private `KernelIntegratedCatalogState` in a WeakMap;
- one private `assemblyIdentity` per accepted catalog;
- canonical modules and nine-field contributions;
- command, effect and namespace indexes;
- callbacks captured but never executed during compilation;
- private access through `getKernelIntegratedCatalogState`.

Accepted contribution fields are exactly:

```text
apiVersion
moduleId
contributionId
extensionNamespaces
extensionRequirements
commands
validate
classify
effects
```

Accepted effect requests are only Core WrittenPitch replacement and owned extension operations. An effect definition already owns a strict payload decoder and transformer, which CVN-6 can consume for both live effects and an explicit detached migration call without adding a tenth contribution field.

## Public Gaps Owned by CVN-6

GD-0 froze integrated bus, gateway and replay names but left four bounded implementation-facing gaps requiring a single planning decision:

1. how an integrated Registry is constructed from the same catalog;
2. the exact modular committed event type;
3. construction-time resource failure for initial facts/issues;
4. the callable detached extension-migration entry and result union.

This task closes those four gaps in `design.md` and synchronizes the active spec as a CVN-6 planning candidate. Archived CVN-2 and GD-0 files remain immutable.

## Preserved Boundaries

- Core-only default assembly and public behavior remain exact.
- Module SDK exports and contribution ABI remain exact.
- Product/Application Assembly ownership remains post-Core Workbench/Editor Session.
- CVN-5 remains the only owner of aggregate cross-module batch commands.
- Persisted Score schema and physical IO remain unchanged.
