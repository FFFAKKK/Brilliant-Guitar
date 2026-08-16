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
| KernelExtensionTransactionRequest | Extension Gateway input | Fixed protocol containing identity, namespace, expected revision, proposal and validation policy. |

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

Instrument data influencing layout/playback/migration/later edits is `domain-required`. Opaque advisory metadata may be `structural-only`. Missing domain-required validation makes only the affected namespace non-writable while preserving its data.

## 5. Deterministic WASM

Validator WASM receives canonical detached data and returns only valid/invalid/unsupported data. It has no mutable Store API or arbitrary host callbacks. The catalog freezes module identity/hash, ABI version, memory pages, fuel, stack/recursion policy, issue/fact counts and output bytes. Trap, fuel exhaustion, malformed output and cap overflow atomically reject the request.

WASM is an execution format, not an official-plugin privilege. The TypeScript SDK supplies builders/test tooling for declarative rules; complex plugins may use any WASM-producing toolchain that implements the protocol.

## 6. Pre-session migration

Plugin migration executes on detached data before KernelSession creation:

```text
strict decode
→ Core migration
→ plugin resolution/inventory
→ installed plugin migrations
→ Level A/B/C full validation
→ KernelSessionComposition
```

Missing plugins preserve original ExtensionBlocks. Failed migration produces diagnostics and a lossless read-only result, not a partially migrated writable session. TypeScript migrations run in Extension Host; deterministic WASM migration is optional under the same owner/version/round-trip boundaries.

## 7. Composition root

`KernelSessionComposition` is the unique Rust composition root and combines Runtime, Use Cases, 28 Core handlers, Extension Gateway and the private FrozenKernelContributionCatalog that it compiles from a strict host descriptor. The descriptor is data-only; the compiled catalog never crosses FFI and carries the process-local composition identity. Kernel Runtime only owns mechanisms/state. Product ApplicationAssembly is a separate Product Host object and owns selected plugins/services/UI.

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
- Official BGP Persistence is the mandatory V1 canonical save/recovery owner.
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
- RKP-5 owns incremental validation plus Extension Protocol, declarative rules and deterministic WASM.
- RKP-6 proves the golden path through two external synthetic Instrument Plugins and KernelSessionComposition.
- RKP-7 adds complete plugin differential/performance evidence.
- RKP-9 qualifies migration, namespace, WASM, stale revision, BGP preservation and service boundaries.
- The first post-RKP product domain is the default official Guitar Instrument Plugin using the same public protocol later offered to Piano/Bass/third parties.

## 14. Targeted rereview gate

The next independent auditor must verify that none of the ten repaired decisions has a second owner or an executable loophole, and that current production/accepted compatibility surfaces remain unchanged. This planning repair does not promote V2, alter RKP authorities, start RKP-1 or modify production paths.
