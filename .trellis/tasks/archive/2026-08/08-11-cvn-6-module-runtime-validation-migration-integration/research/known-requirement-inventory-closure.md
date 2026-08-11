# CVN-6 Known-Requirement Inventory Closure

## Initial Finding

Independent planning review returned P0/P1/P2=`0/1/0`. The planned unavailable state was not reachable through real public data:

- `ExtensionBlock` contains only namespace, schemaVersion, owner and payload;
- accepted CVN-2 private state contains only selected contributions and their namespace index;
- unselected static registration entries are ignored and install no descriptor or callback.

Therefore "known version + contribution absent" needs data independent of both the persisted block and installed catalog.

## Ownership Decision

CVN-6 uniquely owns application-facing `KernelKnownRequirementInventoryV1`, its strict codec and its binding into private integrated runtime assembly state. CVN-2 continues to own catalog compilation, the nine-field contribution ABI, SDK `8/34`, catalog authenticity/state and selection rules. The post-Core Product Host continues to own provider/package Application Assembly.

```ts
export interface KernelKnownRequirementInventoryV1 {
  readonly inventoryVersion: 1;
  readonly requirements: readonly ExtensionRuntimeRequirementV1[];
}
```

Catalog-only `CommandBus.createIntegrated`, `createKernelRegistry` and `replayKernelCommands` remain exact and derive installed-only requirements. Additive explicit overloads take `knownRequirements: unknown`. No new runtime name is introduced.

## Strict Data Contract

- exact top-level fields: `inventoryVersion`, `requirements`;
- ordinary/null-prototype data records only; dense Array only;
- shared strict-capture budgets: depth `64`, total own properties `1,048,576`;
- rows reuse exact `ExtensionRuntimeRequirementV1` fields;
- 0..1,024 rows; 1..256 positive safe integer versions per row;
- versions unique and normalized ascending;
- namespace globally unique; even identical duplicates reject;
- canonical row order: namespace, moduleId, contributionId by captured code-unit order;
- every installed requirement appears exactly once and matches all public data;
- additional absent requirements are allowed but install nothing;
- extra fields, symbols, accessors, hostile Proxy, sparse/cyclic data, invalid prototype, mutable alias or altered inspection primitive reject.

## Authenticity and Identity

Inventory data never authenticates a contribution. Catalog authenticity is checked first through accepted CVN-2 private state. After strict normalization and installed-requirement parity, CVN-6 creates a private runtime assembly state keyed by catalog identity plus a collision-free length-prefixed canonical inventory key. Equal values share the same process-local runtime identity; any catalog or inventory value difference yields a mismatch.

Registry invalid inventory is `registry.invalid-startup-input`. CommandBus/replay invalid inventory is `command.invalid-requirement-inventory`. Failure publishes no partial state and invokes no module callback.

## Reachability Matrix

| Persisted namespace | Inventory | Installed contribution | Version | Classification |
|---|---|---|---|---|
| known | hit | present, exact identity | supported | compatible |
| known | hit | absent | supported | unavailable |
| known | hit | present or absent | unsupported/future | incompatible |
| undeclared | miss | any | any | unknown opaque |

No persisted block means no fact. Unknown is defined only by inventory miss. An ignored registration entry cannot make a namespace known.

## Public Evidence

- unavailable-only: explicit inventory retains one requirement absent from the authentic catalog; supported block; callbacks zero;
- incompatible-only: explicit inventory hit with unsupported block version; callbacks zero for that block;
- mixed: one unavailable and one incompatible fact; incompatible failure wins while the full canonical list is returned;
- unknown: namespace absent from inventory; Core V1 writable lossless preservation;
- identity: same catalog/inventory succeeds, catalog A/B and inventory A/B pairing rejects;
- regression: Core-only and catalog-only integrated paths are exact; CVN-2 compiler/ABI/SDK/selection behavior is unchanged.

Detached `migrateKernelExtension` remains catalog-only and targets only an installed effect definition. It publishes no session availability claim and cannot treat an inventory-only row as an installed migration handler.

## Review State

The prior P1 has a bounded planning repair. Local self-audit must finish at residual P0/P1/P2=`0/0/0`; targeted independent rereview remains pending until separately recorded.
