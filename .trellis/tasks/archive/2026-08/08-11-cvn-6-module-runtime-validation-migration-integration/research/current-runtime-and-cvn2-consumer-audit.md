# Current Runtime and CVN-2 Consumer Audit

## Existing Runtime Owner

The accepted implementation centralizes mutable session state in the current `CommandBus` and `KernelSessionState` path:

- `CommandBus` owns submit/undo/redo/read/markPersisted/subscribe;
- `createCommandRuntime(initialDocument, assembly)` executes through an explicit assembly and defaults to Core-only;
- history, redo invalidation, version, checkpoint/dirty identity and event sequence are one state package;
- `replayCoreCommands` is detached but reuses the Core command runtime;
- Registry gateway binds an authentic Registry receiver to an authentic bus.

CVN-6 extends this owner rather than wrapping it with a second document or history store.

## Accepted CVN-2 Input and Reachability Gap

CVN-2 publishes a branded frozen catalog, private WeakMap state, one catalog identity, selected modules/contributions, command/effect/namespace indexes and captured callbacks. Its contribution fields remain exactly:

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

`ExtensionBlock` stores only namespace, schemaVersion, owner and payload. CVN-2 ignores static registration entries not selected by the manifest, and `KernelIntegratedCatalogState.namespaceIndex` is built only from selected contributions. Therefore catalog state alone cannot distinguish an absent official contribution from an unknown namespace. Adding data to the CVN-2 compiler or catalog would reopen accepted `CVN-FC-110/111` and is excluded by this repair.

## CVN-6-Owned Closure

CVN-6 owns an independent, frozen, data-only `KernelKnownRequirementInventoryV1` supplied by the composition root to explicit integrated Registry, CommandBus and replay overloads. It reuses `ExtensionRuntimeRequirementV1` rows but does not install callbacks or mutate CVN-2 state. The private runtime assembly combines authentic catalog identity with normalized inventory content.

This makes the fixed states reachable:

- inventory hit + supported version + installed contribution: compatible;
- inventory hit + supported version + absent contribution: unavailable;
- inventory hit + unsupported version: incompatible;
- inventory miss: unknown opaque Core data.

## Preserved Boundaries

- Core-only and catalog-only integrated behavior remain exact.
- Module SDK exports, contribution ABI, catalog compilation and unselected-entry behavior remain exact.
- CVN-1 remains the only session/history/dirty/replay/event owner.
- Product/Application Assembly ownership remains post-Core Workbench/Editor Session.
- CVN-5 remains the only owner of aggregate cross-module batch commands.
- Persisted Score schema and physical IO remain unchanged.
