# Authority Conflict and Supersession Map

## 1. Candidate rule

Architecture Reset V2 is `proposed_not_current`. This map identifies later synchronization work; it does not edit or invalidate existing files during candidate creation.

Disposition terms:

- **retain** — behavior/decision remains normative input;
- **refine** — goal remains, owner/physical shape becomes more precise;
- **supersede** — conflicting design stops guiding new implementation after V2 acceptance;
- **historical** — retain for traceability, label as an earlier repository state;
- **defer** — excluded from this migration and requires another task.

## 2. Authority matrix

| Source | Current useful authority | Conflict/drift | V2 disposition | Future sync action after acceptance |
|---|---|---|---|---|
| Product PRD and REQ-002/007/011/015/016 | Product goal, score/plugin/core-loop/commercial quality | Does not contain the new physical Core Platform decomposition | Retain + refine | Add a current-architecture reference to V2; do not duplicate low-level design. |
| `technical/project-architecture.md` | Earlier repository organization intent | Opening description reflects a repository without current Core production code | Historical | Add a dated historical banner and V2 link. |
| `technical/software-architecture.md` | Layered/product intent | Reflects earlier K1/CVN state and ambiguous “application/core” ownership | Historical + supersede conflicts | Point current architecture to V2; keep decisions for history. |
| `technical/microkernel-architecture.md` | Stable contracts and extensibility motivation | “Kernel” scope can include lifecycle/registries beyond narrow runtime | Refine | Keep microkernel principles; scope them to Kernel Runtime and move lifecycle to Product Extension Host. |
| `technical/modular-plugin-architecture.md` | Modules/plugins and host separation | It predates Instrument Plugin equality, Proposal/Request separation and transaction-valid domain logic | Refine | Link to unified Plugin Protocol, Product Extension Host lifecycle and Level A/B/C validation. |
| Core spec index and six active specs | Current TypeScript Core behavior/contract | Physical implementation and hot-path assumptions are pre-Rust | Retain as migration oracle; refine implementation authority | Add V2 as future physical/runtime authority while retaining observable contracts. |
| `PURE_CORE_KERNEL_V1_SCOPE` export | Public compatibility | Name resembles a future architecture declaration | Retain as compatibility name only | Document as historical public surface; do not rename during migration. |
| GD-0 | Guitar data/transaction fences | Calls Guitar an official domain provider and predates equal Instrument Plugins | Retain data/semantic fences as oracle; supersede privileged placement | Default Guitar Instrument Plugin uses the same public protocol as Piano/Bass/third parties. |
| CVN-2 SDK and catalog | Frozen Module SDK ABI/oracle | Can be mistaken for the future public Plugin SDK | Retain exactly as compatibility/oracle; refine audience | New Product Plugin SDK/protocol is separate; old 8/34/9 remains migration evidence. |
| CVN-6 integrated assembly | Accepted TypeScript runtime behavior/oracle, independent known inventory and global read-only degradation | “assembly” and executable official providers conflict with future Session Composition | Retain observable behavior/inventory/availability; supersede future physical placement | `KernelSessionComposition` consumes independent inventory plus a prepared private FrozenCatalog; Product ApplicationAssembly remains host-owned. |
| CVN-7 qualification | Workload, correctness/performance gates | Original liveness method produced invalid evidence | Retain targets; method versioned later | RKP-9 Qualification V2 owns executable measurement for already implemented Core/Session/plugin fixtures, not future product services. |
| Rust remediation parent | Staged migration, compatibility, rollback, targets | Current plan has four crates and predates Core Types, Extension Protocol and Session Composition | Retain sequence; supersede crate shape after acceptance | Separate authority-sync changes parent to seven crates and makes RKP-1 consume repaired V2. |
| RKP-0 archive | 64-row oracle, exact surfaces, qualification fixtures | None for observable compatibility | Retain exactly | RKP-1–RKP-9 consume it; V2 does not rewrite archived files. |
| post-Core roadmap | Official Domain → services → host/loop → public plugins | Places Guitar before a unified public protocol and predates RKP-9 | Retain vertical/product intent; revise plugin order | RKP-9 → minimum Plugin Platform → default Guitar Instrument Plugin/Core Loop; preserve host-owned ApplicationAssembly. |

## 3. Unique-owner convergence

| Capability | V2 owner | Specifically excluded second owners |
|---|---|---|
| Cross-context stable primitives | Core Types | Score implementation, commands, Runtime, Product Host |
| Pure score semantics/schema order | Score Foundation | Runtime, Instrument Plugins, Persistence |
| Extension mutation/namespace/rule/WASM/catalog contracts | Extension Protocol | Core command envelope, plugin executable instance, Runtime store, Product UI |
| Known-requirement inventory contract and canonical form | Extension Protocol; prepared/frozen consumption by Kernel Session | Installed catalog as replacement inventory, package metadata as write authority |
| Composite Core/plugin request and public kernel DTO versions | Kernel Contracts | Node adapter, Product Host |
| Mutable score/store/indices | Kernel Runtime | Workbench, provider, plugin, Persistence |
| Core command/use-case orchestration and composition | Kernel Session | Runtime mechanism, Node adapter, Plugin Semantic Command handlers |
| Plugin Semantic Command execution | Product Extension Host/plugin | Kernel Session/Runtime |
| Transaction-level plugin domain validation | Kernel Session deterministic rule/WASM executor using a prepared private artifact | Arbitrary TypeScript callback, UI, Renderer, Runtime store |
| WASM byte capture/hash/ABI/compile | Kernel Session preparation, implemented in RKP-5 | Product plugin path/lazy loader, transaction-time host callback, Runtime store |
| Native DTO conversion/panic boundary | Native Bridge | Runtime semantic layer |
| KernelSessionComposition | `brilliant-kernel-session` | Runtime mechanism, Product Host integration child |
| Product ApplicationAssembly | Product Host | Kernel Runtime, Core-loop integration task as second owner |
| Public plugin lifecycle | Product Extension Host | Kernel registry/runtime |
| Canonical `.bgp` package/save/autosave/recovery | Mandatory Official BGP Persistence post-RKP product child | RKP-9 fixture, public replacement provider, Score Foundation/Runtime |
| Semantic layout contributions and placement | Instrument Plugin then Layout Engine | Core store, Renderer |
| Stable Render Scene | Layout Engine output contract | Instrument Plugin drawing APIs |
| SVG output | Renderer | Layout or Runtime |
| Playback derivation/scheduling | Playback service | Runtime transaction owner |

## 4. Accepted decisions that V2 does not reopen

- 28 Core command identities and their observable behavior;
- application root 51 runtime exports during migration;
- Module SDK 8/34 surface and contribution nine-field ABI as oracle;
- `brilliant-score-1` and unknown extension preservation;
- Event duration/Voice sequence truth;
- score/Part ExtensionBlock V1 ownership;
- rejection zero-delta and deterministic ordering;
- single state/history/event owner;
- no hot mutation of a ready KernelSession composition/catalog;
- public plugins do not receive raw Registry/mutable document access.

## 5. Decisions explicitly revised by V2

1. “Rust Core” becomes a multi-context Brilliant Core Platform rather than one microkernel crate.
2. Rust workspace becomes seven crates, adding Core Types, Extension Protocol and Session Composition boundaries.
3. Kernel Use Cases/Core handlers move to `kernel-session`; Runtime remains state/transaction mechanisms.
4. Live mutable truth becomes indexed LiveScoreStore; ScoreDocument remains exchange/persistence DTO.
5. EntityId, RuntimeHandle and MusicalLocation are deliberately separate.
6. Undo/redo stores forward/inverse ChangeSets in cursor history, not document copies/growing copied stacks.
7. Validation is affected-closure incremental with full-parity gates.
8. Guitar/Piano/Bass/third-party Instrument Plugins use one Product Extension Host protocol.
9. Plugin Command, DomainChangeProposal and KernelExtensionTransactionRequest are separate.
10. Domain-required writes pass Level A/B/C validation using declarative rules or deterministic WASM.
11. Plugin migration is detached and pre-session; missing plugins preserve data.
12. Namespace writes are owner-only and cross-plugin collaboration is declared/versioned.
13. React is visual; TypeScript executes host-side plugin semantics; WASM/declarative rules are the transaction-safe domain path.
14. Official BGP Persistence remains the canonical V1 durability owner.
15. Layout contributions describe meaning; Layout produces Render Scene; Renderer draws it.
16. Public lifecycle moves to Product Extension Host.
17. After RKP-9 the project executes the default Guitar Plugin vertical slice before broad horizontal frameworks.
18. Known requirements remain independent from installed contributions; only inventory miss is unknown and any known unavailable/incompatible fact produces a global read-only Session.
19. Transaction validation policy is Catalog-only; a request cannot declare or downgrade it.
20. Rust captures, hashes and compiles bounded WASM bytes before migration or validation.
21. RKP-5 implements protocol/WASM mechanisms, RKP-6 implements inventory/composition/gateway/migration behavior, RKP-7 proves, RKP-8 switches, and RKP-9 qualifies accepted fixtures only.

## 6. Deferred decisions

These are not unspecified gaps for RKP operators to improvise:

| Deferred item | Required future owner |
|---|---|
| Concrete slot-map/hash/tree crates | RKP-2 planning and benchmark review |
| Exact Rust API signatures/enums | RKP-1/RKP-3/RKP-5 planning within the repaired contracts |
| Score schema V2/entity-owned blocks | Separate schema evolution task after product need |
| Broad marketplace, distribution and advanced plugin-management UX | Post-Guitar-loop Product Extension Host task |
| Ready-session hot reload | Explicit later product/plugin lifecycle task |
| Advanced Guitar techniques/engraving/playback | Official domain/service tasks after Core Loop |

## 7. Authority synchronization order

After an independent architecture PASS and explicit user acceptance, perform one docs-only sync in this order:

1. mark V2 current;
2. update product PRD/current architecture pointer;
3. update Core spec index pointer and physical-architecture note;
4. update Rust parent to seven crates and repaired V2 dependency;
5. update post-Core gate from old Core completion language to accepted RKP-9;
6. add historical/superseded banners to conflicting technical docs;
7. validate all parents/spec references;
8. commit and audit the sync independently;
9. only then consider creating an RKP-1 planning child.

No production or Cargo file belongs to that synchronization commit.
