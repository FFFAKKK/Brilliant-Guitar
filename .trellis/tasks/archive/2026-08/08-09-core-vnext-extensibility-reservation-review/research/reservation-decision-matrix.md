# Extensibility Reservation Decision Matrix

## 1. Classification rules

| Classification | Entry condition | Current artifact effect | Future implementation effect |
|---|---|---|---|
| `ADOPT_CONTRACT_NOW` | Needed to keep current architecture evolvable without adding runtime scope | Parent/GD-0 wording and compatibility gates | CVN-2/CVN-6 implement current V1 under these rules |
| `DEFER_VERSIONED_GATE` | Valid product capability, but exact runtime/schema contract needs a separate evidence-backed task | Named future lane, owner, dependencies, stop conditions and scenarios | Independent task/version with its own limits/tests/review |
| `EXCLUDE_PERMANENTLY` | Conflicts with single truth, single transaction owner, deterministic replay or capability isolation | Explicit architectural prohibition | Replaced by a bounded mechanism rather than reintroduced |

## 2. Complete decisions

| ID | Capability | Classification | Current route | Reserved route | Decisive reason |
|---|---|---|---|---|---|
| ER-001 | Official domain command contribution | `ADOPT_CONTRACT_NOW` | `kernel.domain-commands.v1` | new version only for new semantics | Already required by CVN-2/CVN-6 |
| ER-002 | Domain validation/classification | `ADOPT_CONTRACT_NOW` | V1 `validate/classify` | versioned contribution | Required for complete semantic claims |
| ER-003 | Module-owned ExtensionBlock effects | `ADOPT_CONTRACT_NOW` | V1 owned score/Part block | new effect/API version | Stable namespace isolation |
| ER-004 | Module-to-Core WrittenPitch write | `ADOPT_CONTRACT_NOW` | V1 restricted builder | included in future superset only through new lane | Existing GD-0 requirement |
| ER-005 | Additive ABI/entry versions | `ADOPT_CONTRACT_NOW` | exact V1 | parallel new entry/API versions | Prevents V1 reinterpretation |
| ER-006 | Module Core-operation expansion | `DEFER_VERSIONED_GATE` | CVN-5 Core+module batch | typed one-level bounded Core-only expansion | Supports high-level domain commands without mutable document |
| ER-007 | Domain selector contribution | `DEFER_VERSIONED_GATE` | adapter computes from snapshot | read-only bounded selector lane | Adds efficient derived reads without new truth |
| ER-008 | Fine-grained Extension owner/block identity | `DEFER_VERSIONED_GATE` | Part/Score payload maps | new Score schema + migration | Persisted-shape decision needs scale evidence |
| ER-009 | Assembly generations | `DEFER_VERSIONED_GATE` | new startup/session composition | immutable package-set generations | Enables update/rollback while preserving Session determinism |
| ER-010 | Third-party package Host | `DEFER_VERSIONED_GATE` | official/system-trusted only | signed/sandboxed/capability-limited Host | Separate trust and operational problem |
| ER-011 | Renderer contribution | `DEFER_VERSIONED_GATE` | external renderer adapter | versioned render adapter entry | Layout is derived, not score truth |
| ER-012 | Playback contribution | `DEFER_VERSIONED_GATE` | external playback service | versioned playback adapter entry | Clock/device state stays external |
| ER-013 | Import/Export contribution | `DEFER_VERSIONED_GATE` | external persistence adapters | versioned IO adapter entries | Bytes/paths stay outside Core |
| ER-014 | Analysis contribution | `DEFER_VERSIONED_GATE` | snapshot consumer | read-only analysis entry + suggested commands | Inference is not persisted truth by default |
| ER-015 | UI Tool/Panel contribution | `DEFER_VERSIONED_GATE` | product composition | versioned UI Host entry | UI lifecycle is platform-owned |
| ER-016 | Explicit module dependencies | `DEFER_VERSIONED_GATE` | composition root manually selects modules | exact identity/version/schema dependency graph | Avoids direct module coupling |
| ER-017 | Active Assembly register/unregister/replace | `EXCLUDE_PERMANENTLY` | none | new generation + new Session | Live mutation breaks replay meaning |
| ER-018 | Mutable ScoreDocument/candidate access | `EXCLUDE_PERMANENTLY` | none | detached reads + typed commands/effects | Preserves atomicity and validation |
| ER-019 | Generic JSON patch/path/array-index target | `EXCLUDE_PERMANENTLY` | none | stable semantic commands/addresses | Prevents schema coupling and unstable inverses |
| ER-020 | Second module bus/history/replay/event owner | `EXCLUDE_PERMANENTLY` | none | one integrated Core owner | Prevents divergent state and undo |
| ER-021 | Module-supplied inverse | `EXCLUDE_PERMANENTLY` | Core/owner definition derives inverse | same rule in future versions | Inverse must match candidate truth |
| ER-022 | Implicit module-to-module handler calls | `EXCLUDE_PERMANENTLY` | none | public commands/batch + declared dependencies | Keeps ordering and capability auditable |

## 3. V1 / future boundary

### CVN-2 V1 implements

- typed V1 SDK data contracts;
- static compiled binding parity;
- command/effect/namespace ownership;
- strict startup compilation and caps;
- deeply frozen catalog;
- no ready mutation API.

### CVN-6 V1 implements

- same-Assembly Registry/bus/gateway/replay;
- detached reads and restricted effect builder;
- WrittenPitch + owned ExtensionBlock effects;
- Core-first module validation/classification;
- availability, diagnostics and migration;
- atomic history/replay/event integration.

### CVN-5 V1 implements

- Core/module raw envelope batch from the same frozen Assembly;
- one candidate/final validation/commit/history/event;
- deterministic failure attribution and replay.

### Future gates implement

- ER-006 through ER-016 only after their own planning, exact contracts, limits, tests and user approval.

## 4. Parent-review triggers

The following facts force a new parent contract review:

- a future capability needs a V1 field reinterpretation;
- a new Core command/target/address or persisted field is required;
- caps, fixtures, failure priority or qualification budgets change;
- a future port requires active Registry mutation or a second state owner;
- CVN-5 batch is insufficient for the first accepted domain scenario;
- performance evidence shows Part-owned extension aggregation violates a product budget.

