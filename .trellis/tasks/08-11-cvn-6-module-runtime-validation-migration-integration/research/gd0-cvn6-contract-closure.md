# GD-0 to CVN-6 Contract Closure

## Decision Summary

CVN-6 implements the accepted GD-0 public surface and adds only the minimum declarations required to make that surface callable and testable. These closures are CVN-6-owned and do not reopen the CVN-2 ABI.

| Gap | Frozen CVN-6 decision | Compatibility rule |
|---|---|---|
| integrated Registry creation | additive `createKernelRegistry(catalog)` overload | existing manifest overload exact |
| integrated committed event | `KernelCommandIdentity` + `IntegratedKernelEvent` | Core `KernelEvent` exact |
| creation overflow | integrated facts/issues resource branches | Core-only creation failure exact |
| official extension migration | versioned `migrateKernelExtension` public entry | `migrateScoreDocument` exact |

## Registry Construction

An authentic CVN-2 catalog is distinguishable only through its private WeakMap state. The integrated overload consumes that state, includes accepted official module/command summaries and binds the Registry to `assemblyIdentity`. A plain object follows the legacy manifest decoder and is invalid startup input. Component-to-component identity mismatch is `registry.assembly-mismatch`.

## Event Identity

The committed event retains the accepted event name, sequence, document fields, cause and affected entities. It widens command ID from the closed Core union to string and adds a frozen source discriminant. Dirty-state event fields remain exact. This gives downstream hosts typed provenance without exposing handler, catalog or internal effect identities.

## Resource Closure

Integrated execution needs stable public attribution for effects, affected addresses, compatibility facts and module issues. The resource shape remains `command.resource-limit-exceeded` with `limitKind/limit/actual`. Initial facts/issues overflow is a construction failure because no partial session may escape.

## Migration Closure

Migration is a separate detached call, not a registration entry. The caller selects one accepted effect definition and one namespace/owner block using a strict versioned request. The effect payload decoder/transformer is reused exactly once for a source match. The output must be an exact target-version replacement and must pass codec, Core semantics and applicable module validation. This preserves the nine-field contribution ABI and ready-catalog immutability.

## Required Contract Tests

The future implementation adds a real-Core compile fence asserting:

- exact overload and result types;
- integrated bus/gateway/replay method shapes;
- modular event discriminants;
- resource limit kinds and construction subset;
- migration request/failure/result exhaustiveness;
- Core-only overloads, results and events remain assignable to accepted fixtures;
- application runtime export count 51 and SDK `8/34`.
