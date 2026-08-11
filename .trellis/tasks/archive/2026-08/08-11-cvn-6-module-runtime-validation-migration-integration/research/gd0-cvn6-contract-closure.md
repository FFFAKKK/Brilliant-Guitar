# GD-0 to CVN-6 Contract Closure

## Decision Summary

CVN-6 implements the accepted GD-0 surface and adds only the minimum application/runtime declarations required to make it callable and testable. These closures do not reopen the CVN-2 ABI or compiler.

| Gap | Frozen CVN-6 decision | Compatibility rule |
|---|---|---|
| absent-known requirement source | application type `KernelKnownRequirementInventoryV1` plus explicit integrated Registry/bus/replay overloads | catalog-only overloads exact; CVN-2 compiler/catalog exact |
| integrated Registry creation | additive `createKernelRegistry(catalog)` and `createKernelRegistry(catalog, inventory)` | existing manifest overload exact |
| integrated committed event | `KernelCommandIdentity` + `IntegratedKernelEvent` | Core `KernelEvent` exact |
| creation failure/resource | invalid-inventory plus integrated facts/issues branches | Core-only creation failure exact |
| official extension migration | versioned `migrateKernelExtension` public entry | `migrateScoreDocument` exact |

## Inventory and Runtime Assembly

The inventory is strict data supplied by the composition root. An authentic CVN-2 catalog remains the only callback/descriptor authority. Every installed requirement must appear exactly once in an explicit inventory; additional rows may identify absent contributions. Namespace is globally unique, rows sort canonically and limits are 1,024 rows and 256 versions per row. The private CVN-6 runtime assembly is keyed by authentic catalog identity plus a collision-free canonical inventory key.

Invalid CommandBus/replay inventory returns `command.invalid-requirement-inventory`; invalid Registry inventory returns `registry.invalid-startup-input`. No callback or partial runtime object escapes. Inventory-only rows create no Registry summary, gateway, command, effect or module identity.

## Other Closures

Integrated events retain accepted event names, sequence, document fields, cause and affected entities while adding frozen Core/module command provenance. Resource failures preserve `command.resource-limit-exceeded` for transaction facts/effects/issues. Detached migration reuses one installed effect definition, remains owner-scoped and leaves active runtime state unchanged.

## Required Contract Tests

The future real-Core compile and behavior fences assert:

- catalog-only and explicit inventory overloads and result types;
- `KernelKnownRequirementInventoryV1` is application-only and SDK remains `8/34`;
- invalid-inventory failure exhaustiveness;
- public unavailable-only, incompatible-only, mixed and unknown construction;
- catalog/inventory assembly identity and mismatch;
- integrated bus/gateway/replay, event, resource and migration shapes;
- Core-only overloads, results and events remain assignable;
- application runtime export count remains 51.
