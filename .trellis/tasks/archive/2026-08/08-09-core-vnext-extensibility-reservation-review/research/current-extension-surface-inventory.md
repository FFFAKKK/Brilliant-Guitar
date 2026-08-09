# Current Extension Surface Inventory

> Evidence snapshot: 2026-08-09. Paths are relative to the repository worktree. Live task/worktree evidence overrides stale roadmap prose.

## 1. Live task and branch evidence

| Item | Evidence | Conclusion |
|---|---|---|
| CVN-4 accepted branch | `700bac9c457dba84d801161e7d3c39b83ed075ad` | CVN-4 is completed/archived; source/test `788594e`, acceptance `1bb19b0`, archive `13039d0`, independent P0/P1/P2=`0/0/0`. |
| CVN-4 live worktree | `.worktrees/cvn-4-part-staff-voice-lifecycle` | The accepted/archive commits are stable; post-archive dirty paths `src/core-kernel/codec/score-component-codec.ts`, `src/core-kernel/commands/effects.ts`, `test/core-kernel/command-internals.test.ts`, and `test/core-kernel/cvn-4-strict-input.test.ts` remain parallel work and are outside this task. |
| Reservation branch | `codex/core-vnext-extensibility-reservation-review` at activation baseline `783f69c581b32549fae3fb3d168cb2848bdd53f0` | Accepted CVN-4 history is merged as a prerequisite; task-owned changes after activation are documentation-only. |
| Parent task | `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion` | Owns exact Core VNext public behavior and dependency graph. |

## 2. Parent product decisions

| Evidence | Current contract | Extensibility implication |
|---|---|---|
| parent `prd.md:21-31` | Product-ready extensible microkernel; stability over hot plug; additive evolution | Frozen Session Assembly and versioned additions are intentional, not accidental closure. |
| parent `prd.md:33-45` | Core/domain ownership and controlled spine refactor | Future ports must reuse the one Core owner. |
| parent `prd.md:62-66` | Same-Assembly Core/module atomic batch | Current V1 has a safe cross-boundary composition path. |
| parent `prd.md:96-104` | Official module seam and stable SDK | CVN-2 owns the first contribution ABI. |
| parent `prd.md:130-146` | validation, schema/migration and public API evolution | Missing/incompatible module behavior and future API versions are already first-class concerns. |

## 3. Current module contribution seam

| Evidence | Exact current surface |
|---|---|
| `feature-contract-matrix.md:492-500` | Entry `kernel.domain-commands.v1`; `CompiledDomainCommandContributionV1` has nine fields; manifest is data-only; functions are static composition-root bindings; accepted identities are official/system-trusted builtin/internal-module. |
| `feature-contract-matrix.md:502-513` | All-or-nothing assembly validates API, identity, trust, capability, unique IDs/namespaces/effects, handler parity, version requirements, owner allowlist and deep freeze. |
| `feature-contract-matrix.md:515-529` | Fixed caps: 64 modules, 256 contributions, 4096 commands, 4096 effects, 1024 namespaces, 256 versions/requirement, 1024 issues/callback, 4096 issues/transaction, 131072 compatibility facts. |
| `feature-contract-matrix.md:531-538` | Registry/bus/gateway/replay share one Assembly identity; module gets detached read + restricted builder; module supplies forward requests; V1 Core write is WrittenPitch; module effects address owned score/Part ExtensionBlock. |
| `domain-transaction-integration.md:42-47` | Integrated construction reuses the existing bus; catalog is immutable; ready catalog has no register/unregister/replace/version/change-event API. |
| `domain-transaction-integration.md:275-299` | Route, strict decode, target ownership, effect set, inverse, isolated candidate, validation, one commit/history/event and undo/redo reuse one pipeline. |

## 4. Current extension persistence

| Evidence | Exact current surface |
|---|---|
| `score-document-model.md:172-180` | `ExtensionOwner = score | part`; block has namespace, positive schemaVersion, owner and JSON object payload. |
| `score-document-model.md:182-185` | `(owner, namespace)` is unique; Core validates envelope only; unknown payload round-trips in JSON-value semantics. |
| `src/core-kernel/validation/validate-score-semantics.ts:390-427` | Runtime semantics enforce namespace grammar, positive version, existing Part owner, owner+namespace uniqueness and JsonValue object payload. |
| `feature-contract-matrix.md:555-568` | Compatible contributions participate; missing/incompatible known blocks yield lossless read-only; unknown blocks remain opaque; migration is deterministic, detached and namespace-owner scoped. |

## 5. Current Registry/capability posture

| Evidence | Exact current surface |
|---|---|
| `registry-capability.md:10-12` | K1-4 supports startup-frozen command/selector contribution categories for existing Core abilities; dynamic plugin lifecycle and domain behavior are outside K1-4. |
| `registry-capability.md:24-31` | Capabilities distinguish registry, command, selector, score read and event access. No capability implies another. |
| `registry-capability.md:63-75` | Manifest strict decode, compiled binding table, official/system-trusted acceptance, Host-only assembly, no ready builder/change event and privacy-safe summary. |
| `registry-capability.md:93-98` | Modules invoke through capability gateway; Registry stays authorization/dispatch, not a second state/write owner. |

## 6. Current read/event surface

| Evidence | Exact current surface | Gap |
|---|---|---|
| `domain-transaction-integration.md:317-329` | Integrated reads expose write/validation availability; modular committed facts carry namespaced command identity and affected ScoreAddresses; event sequence remains Core-owned. | There is no domain-owned query/selector ABI for custom derived views. |
| `registry-capability.md:10,68-73` | Existing Core selectors can be exposed through gateway capabilities and retain accepted behavior. | Selector registration currently describes compiled Core entries, not arbitrary domain query handlers. |

## 7. Explicit current exclusions

`feature-contract-matrix.md:711-721` excludes from Core VNext completion:

- Note/chord lifecycle and articulation lifecycle;
- Guitar data/rules;
- runtime module discovery/install/unload/replace/hot reload;
- third-party sandbox/host/process/signature/permission lifecycle;
- generic patch, JSON path, array-index target and mutable document getter;
- implicit history merge, collaboration and UI/render/playback/audio/persistence/package IO.

These are not one category. The reservation task separates them into:

- safe future versioned gates;
- product Host/Adapter responsibilities;
- permanent violations of Core ownership.

## 8. Confirmed bottlenecks

| Bottleneck | Current workaround | Future reservation |
|---|---|---|
| Module high-level command needs several Core structural edits | UI/module adapter creates CVN-5 Core+module batch | typed one-level Core operation expansion in a new version lane |
| Module UI needs custom derived query | read snapshot and compute outside Core | domain selector contribution gate |
| Part-owned block becomes too coarse | payload map keyed by stable entity IDs | new Score schema + migration if evidence justifies finer owner/block identity |
| Module install/update | create product with a new startup manifest/session | Assembly generation + package Host |
| Render/playback/import/export extension | external services read snapshots and submit commands | per-adapter versioned contribution contracts outside Core |

## 9. Protected truths

- one `ScoreDocument`;
- one submit/transaction/history/replay/event owner;
- frozen Assembly per Session;
- V1 exact contracts and failure meanings;
- explicit capability and namespace ownership;
- deterministic, detached, bounded inputs/outputs;
- lossless unknown/missing/incompatible extension handling;
- no generic mutation or active Registry mutation.
