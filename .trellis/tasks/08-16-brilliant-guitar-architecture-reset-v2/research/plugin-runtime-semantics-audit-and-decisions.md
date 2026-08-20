# Plugin Runtime Semantics Audit and Accepted Planning Decisions

## 1. Audit verdict

The repaired direction is retained:

```text
Unified plugin ecosystem
+ Rust single transaction authority
+ Product Host plugin lifecycle
+ plugins propose data-only mutations through a versioned protocol
```

The pre-repair candidate was not ready for authority promotion because it left transaction-critical domain validation, command execution, migration, service qualification, composition and dependency semantics open. This file closes those decisions for targeted independent rereview.

## 2. Instrument plugin equality

Guitar, Piano, Bass and third-party Instrument Plugins use the same manifest, TypeScript Plugin SDK, React contribution SDK, Extension Protocol, namespace ownership, migration, validation and session lifecycle. The official Guitar Plugin is default-distributed, maintained and fully qualified; it receives no privileged Runtime/Store API.

## 3. Three-object command contract

| Object | Location | Contract |
|---|---|---|
| Plugin Semantic Command | Product Extension Host | Interprets user intent using a filtered snapshot at revision R. |
| DomainChangeProposal | Plugin output | Detached, exact, data-only operations and declared domain facts. |
| KernelExtensionTransactionRequest | Extension Gateway input | Fixed protocol containing identity, expected revision, prepared-catalog fingerprint and proposal. Policy/namespace/capability data is Catalog-only. |

Rust never needs a `guitar.fingering.set` handler. It knows Core commands and one generic Extension transaction request. The host never passes executable plugin objects into the KernelSession.

## 4. Validation authority

### Level A — Core Semantic

Rust validates score hierarchy, entity identity, owner/reference integrity, exact time/rhythm and generic music invariants.

### Level B — Extension Protocol

Rust validates catalog authenticity, plugin/contribution identity, namespace ownership, schema/version, operation allowlist, reference declarations and resource caps.

### Level C — Plugin Domain

Domain-required persisted data passes either:

- DeclarativeDomainRules interpreted by the accepted Rust protocol engine; or
- a bounded deterministic WASM validator.

Instrument data influencing layout/playback/migration/later edits is `domain-required`. Opaque advisory metadata may be `structural-only`. A known absent/incompatible contribution makes the complete KernelSession globally read-only under the accepted availability oracle. An installed domain-required descriptor missing its declared rule/artifact is malformed preparation and publishes zero session. The request has no policy field; an extra `validationPolicy` is rejected before proposal execution.

## 5. Deterministic WASM

WASM receives canonical detached data and returns a role-specific union: validator `valid|invalid`, classifier `supported|unsupported`, or migration target-version owned replacement. Cross-role output is malformed. It has no mutable Store API or arbitrary host callbacks. Session preparation captures at most 256 referenced artifacts, each at most 8 MiB and 64 MiB aggregate; Rust copies bytes, computes SHA-256, checks role/ABI and compiles the private artifact before migration or validation. Transaction execution is capped at 32 MiB linear memory, 10,000,000 fuel, 1 MiB stack/output, 1,024 callback diagnostics, 4,096 aggregate diagnostics and 131,072 facts. Trap, fuel exhaustion, malformed output and cap overflow atomically reject the request.

WASM is an execution format, not an official-plugin privilege. The TypeScript SDK supplies builders/test tooling for declarative rules; complex plugins may use any WASM-producing toolchain that implements the protocol.

## 6. Pre-session migration

Plugin migration executes on detached data before KernelSession creation:

```text
strict decode
→ Core migration
→ plugin resolution + independent known inventory
→ detached TypeScript migrations
→ capture descriptor + inventory + bounded WASM bytes
→ Rust hash/ABI/cap/compile + private prepared catalog
→ optional prepared-WASM migration
→ Level A/B/C full validation and availability
→ writable or complete read-only KernelSession
```

Missing plugins preserve original ExtensionBlocks. Failed/unavailable migration discards its detached candidate and produces a complete read-only KernelSession over the preserved Core-valid document, not an untyped result or partially migrated writable session. TypeScript migrations run in Extension Host before capture; deterministic WASM migration runs only through the prepared private artifact under the same owner/version/round-trip boundaries.

## 7. Composition root

`KernelSessionComposition` is the unique Rust composition root and combines Runtime, Use Cases, 28 Core handlers, Extension Gateway, an independent `KernelKnownRequirementInventoryV1` and the private FrozenKernelContributionCatalog compiled from a strict host descriptor plus Rust-prepared artifacts. Inventory/catalog/artifact hashes all enter the process-local composition identity. The descriptor and inventory are data-only; the compiled catalog never crosses FFI. Kernel Runtime only owns mechanisms/state. Product ApplicationAssembly is a separate Product Host object and owns selected plugins/services/UI.

The inventory has at most 1,024 exact `requirementVersion: 1` rows and 256 versions per row. Its strict codec accepts arbitrary dense row order, rejects duplicate namespaces, then normalizes by namespace/moduleId/contributionId. It retains the accepted namespace, module/contribution identity, supported versions and `requiredForWrite: true` even when a contribution is absent. Validation policy remains installed-catalog-only. Every installed requirement row has exact inventory parity. Only a valid inventory miss is unknown opaque; inventory data can restrict availability but never grant write authority.

## 8. Seven-crate dependency decision

```text
core-types                       no project dependency
score-foundation                 depends on core-types
extension-protocol               depends on core-types
kernel-contracts                 depends on core-types, foundation, protocol
kernel-runtime                   depends on core-types, foundation, protocol, contracts
kernel-session                   depends on runtime, contracts, protocol
kernel-node                      depends on session, contracts
```

This avoids Foundation depending on oversized command contracts and makes handler/composition ownership compile-visible.

## 9. Namespace and collaboration

A contribution writes only owned namespaces. Cross-plugin behavior uses a declared, versioned public contribution/capability and never mutates the other plugin's ExtensionBlock. Dependencies and namespace collisions are resolved before session creation and remain frozen.

## 10. Product service qualification

- Layout, Renderer, Playback and Import/Export use replaceable Product Host ports.
- Official BGP Persistence is the mandatory V1 canonical save/recovery owner implemented and qualified by a post-RKP product child.
- Other formats use Import/Export/DocumentFormat Provider ports.
- Changing canonical `.bgp` ownership requires a separate architecture decision and qualification.

## 11. Layout/rendering chain

```text
Instrument semantic contribution
→ Layout Contribution
→ Layout Engine placement
→ stable Render Scene
→ SVG / Canvas / WebGPU / PDF Renderer
```

Instrument plugins describe meaning, not drawing calls or renderer objects.

## 12. Stale revision

Kernel returns `extension.stale-revision` and performs no rebase. Extension Host may reacquire a snapshot and re-execute a descriptor-marked recomputable Plugin Semantic Command once. A second stale result or positional/destructive ambiguity returns to Workbench for explicit confirmation.

## 13. RKP consequences

- RKP-1 consumes the seven-crate structure.
- RKP-5 implements incremental validation, Extension Protocol/request codecs, Catalog-only policy, declarative rules, bounded WASM artifact preparation and deterministic executor.
- RKP-6 implements known inventory, catalog/inventory parity, private composition identity, global read-only Session, generic gateway, stale revision, namespace enforcement, TS/WASM migration orchestration and two external synthetic Instrument Plugin proofs.
- RKP-7 adds complete Core/plugin/inventory/migration differential and performance evidence without owning new behavior.
- RKP-8 only switches the default KernelSession.
- RKP-9 qualifies the already implemented Core/Session/plugin-protocol capabilities and uses only persistence/layout port fixtures; it cleans old oracle code only after PASS.
- Official BGP Persistence, Layout/Renderer and the real Guitar Plugin are post-RKP implementation and qualification children.
- The first post-RKP product domain is the default official Guitar Instrument Plugin using the same public protocol later offered to Piano/Bass/third parties.

## 14. Targeted rereview gate

The next dedicated cross-thread independent auditor must verify that none of the repaired decisions has a second owner or an executable loophole, and that current production/accepted compatibility surfaces remain unchanged. Advisory subagent output is not formal audit evidence. This planning repair does not promote V2, alter RKP authorities, start RKP-1 or modify production paths.
