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
| `technical/modular-plugin-architecture.md` | Modules/plugins and host separation | TypeScript/official/public surfaces are not sufficiently separated | Refine | Link to V2 three-surface model and Product Extension Host lifecycle. |
| Core spec index and six active specs | Current TypeScript Core behavior/contract | Physical implementation and hot-path assumptions are pre-Rust | Retain as migration oracle; refine implementation authority | Add V2 as future physical/runtime authority while retaining observable contracts. |
| `PURE_CORE_KERNEL_V1_SCOPE` export | Public compatibility | Name resembles a future architecture declaration | Retain as compatibility name only | Document as historical public surface; do not rename during migration. |
| GD-0 | Official Guitar Domain public contract fences | Does not itself define Rust/live-store internals | Retain | Future Guitar provider consumes Rust SDK and score foundation without Runtime internals. |
| CVN-2 SDK and catalog | Frozen official module ABI/oracle | Can be mistaken for public third-party plugin API | Retain as compatibility/oracle; refine audience | Document that public TypeScript plugins enter Product Extension Host facade, not KernelProviderAssembly. |
| CVN-6 integrated assembly | Official runtime assembly behavior | “assembly” term collides with Product ApplicationAssembly | Retain semantics; rename concepts in explanatory docs | Use KernelProviderAssembly/private identity for runtime and Product ApplicationAssembly for host. |
| CVN-7 qualification | Workload, correctness/performance gates | Original liveness method produced invalid evidence | Retain targets; method versioned later | RKP-9 Qualification V2 owns executable measurement method. |
| Rust remediation parent | Staged migration, compatibility, rollback, targets | Current plan has four crates and predates Score Foundation extraction | Retain sequence; supersede crate shape after acceptance | Separate authority-sync changes parent to five crates and makes RKP-1 consume V2. |
| RKP-0 archive | 64-row oracle, exact surfaces, qualification fixtures | None for observable compatibility | Retain exactly | RKP-1–RKP-9 consume it; V2 does not rewrite archived files. |
| post-Core roadmap | Official Domain → services → host/loop → public plugins | Assumes post-CVN timing and prior Core naming; must align with RKP-9 | Retain delivery intent; refine gate | Gate first Guitar Domain/vertical sequence on accepted RKP-9, preserve unique ApplicationAssembly owner. |

## 3. Unique-owner convergence

| Capability | V2 owner | Specifically excluded second owners |
|---|---|---|
| Pure score semantics/schema order | Score Foundation | Runtime, Guitar Domain, Persistence |
| Public kernel DTO versions | Kernel Contracts | Node adapter, Product Host |
| Mutable score/store/indices | Kernel Runtime | Workbench, provider, plugin, Persistence |
| Command orchestration | Kernel Use Cases inside Runtime | Node adapter, UI handlers |
| Official provider traits | Kernel Extension SDK | Public plugin facade |
| Native DTO conversion/panic boundary | Native Bridge | Runtime semantic layer |
| Official runtime provider assembly | Kernel Runtime composition root | Product Host integration child |
| Product ApplicationAssembly | Product Host | Kernel Runtime, Core-loop integration task as second owner |
| Public plugin lifecycle | Product Extension Host | Kernel registry/runtime |
| `.bgp` package/files/autosave/recovery | Persistence service | Score Foundation/Runtime |
| Layout primitives | Layout service | Core document/store, Renderer |
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
- no hot mutation of a ready provider assembly;
- public plugins do not receive raw Registry/mutable document access.

## 5. Decisions explicitly revised by V2

1. “Rust Core” becomes a multi-context Brilliant Core Platform rather than one microkernel crate.
2. Rust workspace becomes five crates, extracting Score Foundation.
3. Kernel Use Cases remain an internal runtime module initially.
4. Live mutable truth becomes indexed LiveScoreStore; ScoreDocument remains exchange/persistence DTO.
5. EntityId, RuntimeHandle and MusicalLocation are deliberately separate.
6. Undo/redo stores forward/inverse ChangeSets in cursor history, not document copies/growing copied stacks.
7. Validation is affected-closure incremental with full-parity gates.
8. React is only a visual contribution technology; TypeScript is the public functional plugin language.
9. Public lifecycle moves to Product Extension Host.
10. After RKP-9 the project executes a Guitar vertical slice before adding horizontal frameworks.

## 6. Deferred decisions

These are not unspecified gaps for RKP operators to improvise:

| Deferred item | Required future owner |
|---|---|
| Concrete slot-map/hash/tree crates | RKP-2 planning and benchmark review |
| Exact Rust API signatures/enums | RKP-1/RKP-3 planning with compatibility oracle |
| Score schema V2/entity-owned blocks | Separate schema evolution task after product need |
| Public plugin manifest/permissions/runtime | Post-Guitar-loop Product Extension Host task |
| Ready-session hot reload | Explicit later product/plugin lifecycle task |
| Advanced Guitar techniques/engraving/playback | Official domain/service tasks after Core Loop |

## 7. Authority synchronization order

After an independent architecture PASS and explicit user acceptance, perform one docs-only sync in this order:

1. mark V2 current;
2. update product PRD/current architecture pointer;
3. update Core spec index pointer and physical-architecture note;
4. update Rust parent to five crates and V2 dependency;
5. update post-Core gate from old Core completion language to accepted RKP-9;
6. add historical/superseded banners to conflicting technical docs;
7. validate all parents/spec references;
8. commit and audit the sync independently;
9. only then consider creating an RKP-1 planning child.

No production or Cargo file belongs to that synchronization commit.
