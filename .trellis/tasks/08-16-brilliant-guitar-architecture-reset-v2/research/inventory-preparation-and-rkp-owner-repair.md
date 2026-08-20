# Inventory, Preparation and RKP Owner Bounded Repair

## 1. Status and evidence class

An advisory review identified four planning defects in candidate `812f154`: absent known-requirement inventory, an impossible pre-session validation order, contradictory request policy ownership, and incomplete RKP implementation ownership. The advisory was produced by a subagent and is **not** the formal independent cross-thread architecture audit requested by the project owner. Its technically reproducible findings are consumed here as planning input.

This repair changes candidate documents only. Current architecture authorities, Rust remediation authority, post-Core authority, production code and tests remain unchanged.

## 2. Accepted compatibility authority

The repair retains the accepted CVN-6 oracle:

- `KernelKnownRequirementInventoryV1` is independent of installed catalog state;
- at most 1,024 rows and 256 supported versions per row;
- installed rows require exact parity;
- known exact-version absent contribution is unavailable;
- known unlisted/future version is incompatible;
- only a valid inventory miss is unknown opaque;
- any unavailable/incompatible fact makes the complete session globally read-only;
- reads, selectors, snapshots, encode, checkpoint bookkeeping and incomplete validation reporting remain available;
- submit/undo/redo/first replay write reject at cached availability preflight before request decode or callbacks;
- incompatible wins the public failure selection while mixed results retain all facts.

V2 does not introduce namespace-local writes.

## 3. Inventory contract

Each exact row contains:

```text
requirementVersion: 1
namespace
moduleId
contributionId
supportedSchemaVersions
requiredForWrite: true
```

The strict codec accepts a dense row array in any order and canonicalizes it by namespace/module/contribution. Supported versions are nonempty, strictly ascending positive safe integers. Duplicate namespace, extra fields, accessors, malformed rows, cap overflow or installed-requirement mismatch rejects preparation. Each installed requirement row must appear exactly once with identical data; an absent identity may contribute an additional requirement. This is the accepted inventory shape; validation policy remains in the installed catalog. Product `pluginId` and runtime `moduleId` have the same V1 lexical value with no alias table.

Inventory sources are the application-known plugin registry and future `.bgp` requirement metadata. Inventory never grants authority. Installed catalog entries and prepared artifacts are still required for writes and Level C execution.

## 4. Preparation input and private state

The host-to-Rust preparation boundary carries only captured data:

```text
Core-valid detached document candidate
host migration outcomes
KernelKnownRequirementInventoryV1
KernelContributionCatalogDescriptorV1
KernelWasmArtifactBundleV1
```

The artifact bundle has at most 256 entries, 8 MiB per entry and 64 MiB aggregate. Each entry has an ID, role, ABI version, declared SHA-256 and detached bytes. Rust copies bytes, computes SHA-256 itself, validates reference/role/ABI/caps and compiles a private artifact. Paths, arbitrary loaders, plugin objects and callbacks are excluded.

The private composition identity covers normalized catalog, normalized inventory, artifact hashes, deterministic order and V1 resource limits. A request fingerprint only checks that it targets the same prepared session; it does not create authenticity.

## 5. Fixed construction precedence

```text
Core strict decode
→ Core schema migration
→ Core semantic validity
→ host resolution and detached TypeScript migration
→ capture exact preparation input
→ catalog descriptor authenticity
→ inventory decode/caps
→ installed-inventory parity
→ artifact bundle decode/count/byte caps
→ Rust SHA-256
→ ABI/role/reference checks
→ private artifact compile
→ private composition identity
→ compatibility and availability
→ optional prepared-WASM migration
→ final Level A/B/C
→ Runtime/KernelSession construction
```

Malformed Core/preparation/catalog/inventory/artifact input and exact-compatible domain semantic invalidity publish zero session. Missing/incompatible contributions or unavailable migration preserve the document and publish a complete read-only session.

## 6. Catalog-only transaction policy

The exact V1 request contains only:

```text
protocolVersion
pluginId
contributionId
originPluginCommandId
expectedRevision
catalogFingerprint
proposal
```

Validation policy, namespace grants, schemas, deterministic rule/WASM identities, budgets and Core command capabilities resolve only from the private catalog. Any such request field is an extra-field decode failure. A plugin cannot downgrade `domain-required` to `structural-only`.

## 7. RKP owners

| Stage | Sole implementation responsibility |
|---|---|
| RKP-5 | Extension Protocol/request codecs, Catalog-only policy, incremental validation, declarative rules, artifact capture/hash/ABI/compile and deterministic WASM executor |
| RKP-6 | Known inventory, parity, private catalog/composition identity, global read-only Session, gateway, stale revision, namespace enforcement, TS/prepared-WASM migration orchestration and two synthetic plugins |
| RKP-7 | Differential and performance evidence over all RKP-5/6 behavior; feature changes return to the owning stage |
| RKP-8 | One default KernelSession switch only |
| RKP-9 | Qualification V2 of accepted Core/Session/plugin fixtures and post-PASS obsolete-oracle cleanup |

Official BGP Persistence, Layout/Renderer and the real Guitar Instrument Plugin do not exist at RKP-9. Their product children implement and qualify them after RKP-9. RKP-9 may prove only their Core/Product Host port fixtures and unknown-data preservation boundary.

## 8. Required future tests

- inventory `requirementVersion`, `1,024/1,025`, versions `256/257`, duplicate namespace, arbitrary input-order canonicalization and catalog parity;
- unavailable-only, incompatible-only, mixed and unknown construction through real public preparation inputs;
- read-only Session selector/snapshot/encode/checkpoint behavior and write callback count zero;
- request `validationPolicy`/namespace/schema/WASM/capability extra-field rejection;
- artifact `256/257`, `8 MiB/+1`, `64 MiB/+1`, duplicate, unused, missing, hash, ABI, role and compile failures;
- captured byte alias isolation and zero path/lazy-loader access;
- TypeScript migration success/failure, prepared-WASM migration success/trap/cap/malformed return;
- composition identity mismatch across catalog, inventory or artifact changes;
- RKP-9 fixture qualification does not claim real Persistence/Layout/Guitar implementation.

## 9. Formal review gate

After local validation and a docs-only repair commit, the planner must use Codex cross-thread communication to send the exact clean HEAD to a dedicated read-only architecture-auditor thread. A local subagent, planner self-audit or green regression suite does not satisfy that independent review gate.
