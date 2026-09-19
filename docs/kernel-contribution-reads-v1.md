# Explicit cross-plugin extension reads V1

The concrete consumer is now two independently compiled SDK plugins: one owns
Part indices derived from Core notes; another owns a Score summary derived from
those indices. The latter could not use the original owner-only callback view.
This adds explicit startup read grants, not new notation fields or write APIs.

## Startup contract

The opt-in `src/core-kernel/module-sdk/extension-reads.ts` subpath exports
`compileContributionReadCatalogV1(baseCatalog, declarations)` and the additive
`compileContributionReadCatalogV1(baseCatalog, declarations, knownInventory)`
overload. Both return the existing catalog compilation result shape. The third
argument is used only when a declared provider is known to the authenticated
host inventory but is not installed in the current catalog. It authenticates
identity, namespace and supported schema versions; it does not install or
execute that provider. The frozen V1 index (8 runtime / 34 type exports),
nine-field contribution ABI and application index remain unchanged. Existing
callers keep the exact original view shape.

The trusted composition root supplies a dense roster of 1–1024 declarations:

```typescript
const derived = compileContributionReadCatalogV1(baseCatalog, [{
  readVersion: 1,
  reader: { moduleId: "summary.module", contributionId: "summary.contribution" },
  provider: { moduleId: "index.module", contributionId: "index.contribution" },
  namespace: "index.parts",
  supportedSchemaVersions: [1, 2],
  ownerKinds: ["part"],
}]);
```

Every field is exact data, detached before validation. The base catalog and
reader must be authentic. The namespace must belong either to the named
installed provider or to the same provider in an explicit `inventoryVersion: 1`
inventory. Inventory requirements use the existing exact
`ExtensionRuntimeRequirementV1` decoder; duplicate namespaces, unknown
providers, mismatched installed owners and malformed inventories fail closed at
`registry.invalid-startup-input`. Self-reads use the original own-extension view
and are not new grants. Duplicate reader/namespace rows, extra fields, accessors,
sparse arrays and invalid owner/version lists also fail closed. Schema versions
must exactly match the provider's frozen supported versions. A narrower consumer
range is deliberately not silently interpreted as an empty read; it needs an
explicit compatibility contract before being supported.

The roster is host authorization, not a guest assertion. Publication creates a
new authentic catalog and fresh contribution identities. The original catalog,
existing sessions and earlier grants stay unchanged. The complete roster
replaces grants when deriving again; there is no implicit inheritance, mutation
or live reconfiguration. Registry/gateway identity follows the derived catalog.

## Callback view and authority

Only a reader with a grant gets an additional `dependencyReads` array. Each row
has `readVersion`, provider identity, namespace, schema versions, owner kinds
and sorted `blocks`. Each block is a detached, recursively frozen copy from the
current candidate and must match all declared filters. No unknown opaque data
or another owner's blocks are included. `compatibleExtensions` continues to
contain only the reader's own data; `coreDocument` has no extensions.

The view is shared by TS and Native prepare/transform/validate/classify and
detached migration. Wasm serialization carries that same explicit data; guests
gain no host calls or mutable pointers. Later Batch children see earlier accepted
candidate effects. Reversed reconciliation order or incomplete repairs can be
rejected by the final independent validators, with zero adoption of the prefix.
Reading another plugin grants neither its commands nor its effects/issue source.

The final host pipeline still validates all applicable contributions once in
the original catalog order. Read cycles do not recursively execute plugins or
change command order: these are reads of one candidate snapshot. This is not
automatic reconciliation, topological callback scheduling or a proof of
incremental validation equivalence. Core views remain broad; whole-block read
grants are not field-level tracking.

## Compatibility and failure behavior

A future schema in the requested owner scope cannot appear as an innocuous
empty dependency. The consumer validator/classifier is skipped while existing
provider requirement facts keep the session validation incomplete/read-only.
Detached migration that needs such a read rejects with the existing
`migration.contribution-contract-violation`, before consumer execution. Ordinary
absence of a block yields an empty array; its business meaning remains the
consumer's validation responsibility.

A missing provider can publish a degraded catalog only when the trusted host
supplies its exact requirement in the explicit inventory. Session assembly uses
that same inventory to report the existing `required-contribution-unavailable`
facts. The document opens read-only, opaque extension blocks remain losslessly
available, and consumers that read the missing provider do not run
validate/classify/prepare/transform callbacks. Writes reject before reading the
user command with `command.required-contribution-unavailable`. Detached migration
rejects before the consumer callback with
`migration.contribution-contract-violation`. Restoring the provider reuses the
ordinary complete validation path. No dynamic plugin package loader, implicit
provider inference, callback order change or read grant inferred from a namespace
string is added.

## Evidence and remaining work

The independent index/summary fixture validates stored note references against
Core field by field; it does not call its transformers as an oracle. Tests cover
scoped views, current candidate reads, ordering, partial repair, foreign writes,
gateway authority, immutable catalog capture, owner death/rebirth, clear/rebuild,
stored history and replay, actual migration, future-version gating and reciprocal
reads. An actual compiled Wasm guest separately reads a declared Part extension
after an earlier Batch child updates it, and fails without the grant.

Remaining commercial work includes precise read dependency closure and
incremental-equivalence proof, aggregate resource limits, platform and
performance qualification. The host currently projects full Core documents and
copies authorized blocks; no hot-path efficiency claim is made.
