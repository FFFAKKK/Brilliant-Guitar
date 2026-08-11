# Core VNext Product-Ready Extensible Kernel Design

## 1. Status and Authority

- Lifecycle: `PLANNING / DETAILED CONTRACT REVIEW CANDIDATE / USER APPROVAL PENDING`.
- Compatibility base: Pure Core Kernel V1 close baseline `d92a7586536ac8757c318ae6f75aabd8698f85ac`.
- Related candidate: GD-0 documentation candidate at `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/`; production activation still depends on its independent acceptance.
- Observable contract authority: `feature-contract-matrix.md` CVN-FC-001–143. This design may choose private organization only where that matrix leaves no public/state/history/replay/event difference.
- This document defines the target architecture and child-gate boundaries. It does not authorize changes under `src/**` or `test/**` and does not activate any child task.

## 2. Design Objective

把当前稳定但 Core-only 的执行链演进为稳定、可版本化、启动期冻结的产品级微内核。VNext 必须同时满足：

1. `ScoreDocument` 仍是唯一谱面真相；
2. `CommandBus` 仍是唯一 transaction/history/replay owner；
3. Core-only V1 公共路径保持兼容；
4. 官方领域模块通过同一执行链贡献语义，而不是复制执行链；
5. ready 后装配图保持不可变；
6. 结构编辑、范围变换和 batch 以语义命令表达；
7. Guitar、UI、渲染、播放、物理 IO 与第三方 Extension Host 保持外置。

## 3. First-Principles Invariants

### 3.1 State invariants

- 活动 session 中只有一个 current document、documentVersion、undo stack、redo stack、checkpoint identity 和 event sequence。
- rejected/no-op 保留整个 pre-call state；committed submit/undo/redo 各递增一次 documentVersion。
- 一个语义事务最多产生一个 history entry 和一个 `core.document.committed`。
- history 保存细粒度 forward/inverse effects，不保存整文档 before/after snapshot。

### 3.2 Determinism invariants

- ID、顺序、版本和 effect payload 均由输入或冻结 catalog 决定；runtime 不读取 wall clock 或 randomness。
- live submit 与 replay 使用同一 assembly、decoder、prepare、effect、validation 和 classification pipeline。
- 模块、validator、classifier、issue、affected address 与 effect 的顺序全部有规范化排序规则。

### 3.3 Boundary invariants

- 模块 manifest 是纯数据；compiled function binding 由产品 composition root 静态提供。
- 模块 handler 只接收 detached/frozen read context 和自身兼容 extension view。
- compiled handler 不进入 persisted document、public result、event、history export 或 registry summary。
- public input 遵循 descriptor-first、no-getter、no-throw 和有限工作量合同。

## 4. Stability Zones

### Zone A — Frozen public/persisted contracts

默认保持：

- `brilliant-score-1` persisted shape；
- Fraction、NoteValue、WrittenPitch、ScoreAddress/ScoreRange；
- `CommandBus.create()`、`replayCoreCommands()` Core-only 签名和结果；
- Core-only command envelope/result/failure unions 的既有六个成员与既有观察行为；VNext 只按 CVN-FC-041/100 追加成员；
- snapshot/selectors/checkpoint/dirty 与现有 event shape/order；
- K1-5 public Issue/Report 和 current-schema migration result；
- K1-4 Core-only Registry/Gateway 的现有行为。

内核脊柱重构修改 Zone A 时必须先返回父任务重新规划。

### Zone B — Compatibility adapters

允许内部改造，但必须证明行为深度相等：

- 六个 built-in Core command 的 decoder/prepare adapter；
- Core command catalog 到新 execution catalog 的装配；
- Core semantic validator 与 K1 profile 的默认 pipeline adapter；
- Core-only replay binding。

### Zone C — Refactor surface

本轮目标区域：

- private accepted-command representation；
- private nonempty effect set 与 inverse derivation；
- transaction coordinator；
- module-neutral private history entry；
- immutable execution/validation catalog；
- Registry assembly validation 与 gateway dispatch 内部分层；
- integrated factory、assembly identity 和 domain validation availability。

## 5. Target Architecture

```text
Product Composition Root
  -> strict startup manifest
  -> statically compiled official bindings
  -> build immutable Kernel Assembly (all-or-nothing)
       |- Registry summary/capabilities
       |- Frozen command execution catalog
       |- Frozen validator/classifier catalog
       |- Extension compatibility requirements
       `- Private assembly identity

Core-only factory ------------------------------.
                                                    v
Public CommandBus / Gateway -> Session Coordinator -> Transaction Coordinator
                                                     |- availability preflight
                                                     |- decode + route
                                                     |- prepare private effects
                                                     |- derive inverse/apply candidate
                                                     |- Core semantics
                                                     |- official validators
                                                     |- support classifiers
                                                     |- history/read/event candidate
                                                     `- atomic state adoption

Replay ---------------------- same frozen assembly and transaction coordinator
```

Core-only construction uses a private default assembly containing the existing six commands and Core validation/classification adapters. Integrated construction binds a larger official assembly, but does not create another bus implementation.

## 6. Private Execution Contracts

The following shapes are design-level private contracts. A child may rename a private symbol only when its contract trace records the replacement and characterization proves identical state/history/replay/event behavior; field meaning, ordering and ownership remain fixed.

```typescript
interface PrivateAcceptedCommand {
  readonly commandVersion: 1;
  readonly commandId: string;
  readonly source: {
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly envelope: unknown; // already detached, decoded and frozen
}

type PrivatePrepareResult =
  | { readonly status: "no-op" }
  | {
      readonly status: "changed";
      readonly effects: PrivateNonEmptyEffectSet;
      readonly affected: readonly ScoreAddress[];
    };

type PrivateNonEmptyEffectSet = readonly [
  PrivateKernelEffect,
  ...PrivateKernelEffect[],
];

interface PrivateHistoryEntry {
  readonly sequence: number;
  readonly command: PrivateAcceptedCommand;
  readonly forward: PrivateNonEmptyEffectSet;
  readonly inverse: PrivateNonEmptyEffectSet;
  readonly affected: readonly ScoreAddress[];
}
```

- `unknown` in the private accepted envelope represents an already decoded opaque value owned by its compiled binding, not a public unvalidated payload.
- History/effects remain private and are excluded from the Core root export.
- A handler that detects no effective change returns `no-op`. Any returned `status: "changed"` with an empty effect set is always `command.contribution-contract-violation`; this choice is fixed rather than child-selectable.

## 7. Effect Model

### 7.1 Principle

Modules request a narrow set of Core-applied effects. They do not receive a mutable document and do not supply arbitrary mutation callbacks, patches, JSON paths or splice programs.

### 7.2 Effect families

The private union may grow only through independently reviewed Core mechanisms:

- scalar/value replacement: metadata, WrittenPitch, NoteValue；
- ordered event insertion/removal；
- structural bundle insertion/removal/move for measure, Part, Staff and Voice；
- narrow owned-extension replacement/removal keyed by declared namespace and owner；
- later range/batch composition over the same primitive effect engine。

An official domain command that synchronizes Guitar placement and notation pitch therefore requests two effects in one set: a Core-owned WrittenPitch effect and a declared Part-owned extension effect. Core validates ownership and applies both to one isolated candidate.

### 7.3 Candidate and inverse algorithm

1. Clone the current document once for the transaction candidate.
2. For each forward effect in declared order:
   - validate effect kind, ownership, IDs and payload contract；
   - read the current candidate value and derive the matching inverse；
   - apply the forward effect to the isolated candidate；
   - update or invalidate only transaction-local lookup data。
3. Reverse the collected inverses before storing history.
4. Run the complete semantic/validation/classification pipeline.
5. Adopt candidate, history, read state and event sequence atomically.

This avoids cloning the entire document once per effect and preserves correct inverse semantics when later effects depend on earlier effects in the same transaction.

## 8. Frozen Assembly and Registry Responsibilities

Registry runtime is split internally into four responsibilities:

1. **Manifest decoding/normalization** — pure data, hostile-input safe；
2. **Compiled binding validation** — identity, API version, trust/runtime, capabilities, descriptor/binding parity, namespace/effect ownership and duplicate detection；
3. **Immutable assembly construction** — sorted catalogs, compatibility requirements and private assembly identity；
4. **Gateway dispatch** — capability checks and delegation to the assembly-bound bus/selectors/events。

The ready assembly and nested public summary data are detached and deeply frozen. There is no ready-state register/unregister/replace API, registry version counter or changed event.

Core-only `createKernelRegistry()` continues to construct the accepted Core V1 registry. Integrated creation is additive and must share its private assembly identity with its bus, gateway and replay entry.

CVN-2 owns the authoring SDK and all-or-nothing compilation of a detached frozen contribution catalog; it does not yet expose a writable integrated session. CVN-6 binds an accepted catalog to the existing bus/gateway/replay implementation and supplies compatibility, validation, classification and degraded-read semantics. This split prevents an SDK gate from shipping a partially validated stateful runtime.

## 9. Transaction Pipeline

For a writable integrated session, live submit follows exactly this order:

1. availability preflight；
2. strict outer envelope inspection and catalog routing；
3. exactly one contribution decoder；
4. target/ownership resolution and restricted handler context construction；
5. handler returns `no-op` or a nonempty effect request set；
6. effect contract validation, inverse derivation and isolated candidate application；
7. Core semantic validation；
8. applicable exactly compatible module validators in frozen order；
9. Core profile then applicable module classifiers；
10. canonical affected-address facts；
11. history/read/event candidate construction；
12. one atomic state adoption followed by isolated subscriber dispatch。

Any failure before step 12 returns the original state. Handler/validator/classifier/fact exceptions become stable allowlisted failures without stack, source path, payload or internal effect leakage.

### No-op

No-op preserves documentVersion, history, redo stack, checkpoint identity and events. It returns classification from the unchanged state and does not clear redo.

### Undo/redo

Undo/redo use stored reverse/forward effect sets, apply to an isolated candidate and rerun steps 7–11. Integrated read-only availability preflight occurs before empty-history checks, matching the GD-0 candidate contract.

### Replay

Replay accepts only semantic command envelopes. It never accepts stored effects or undo/redo session logs and uses the same assembly-bound path as live submit. Returned documents/results are detached from the live bus.

## 10. Validation, Compatibility and Degraded Read Mode

- Core semantic validation always runs first.
- Known official extensions are matched per block by namespace, owner and exact supported schema version.
- Each applicable contribution receives one canonical, detached view containing Core read data plus only its compatible blocks in owner order.
- Missing or incompatible required contributions produce explicit incomplete validation and a lossless read-only integrated session.
- Incompatible/future blocks reach zero decoder/handler/validator/classifier/effect/fact callbacks.
- Unknown opaque extensions retain Core V1 preservation and do not automatically make the session read-only.
- Module migration is detached and deterministic; it does not mutate an active bus or ready assembly.

## 11. Generic Structure Editing

### 11.1 Document creation

The fixed design is a deterministic pure factory, not a command submitted to an uninitialized bus:

```typescript
createScoreDocument(input: unknown): CreateScoreDocumentResult
```

The exact input/result unions are CVN-FC-020/021: one explicit initial measure, one-or-more explicit initial Parts, one-or-more Staffs and Voices per Part, caller-supplied IDs, explicit extensions, strict decode diagnostics and Core semantic diagnostics. On success it returns a detached semantically valid document that can be passed to `CommandBus.create()` or integrated construction. It does not read time/randomness and does not replace an active document.

### 11.2 Measure lifecycle

CVN-3 owns exactly four additions: `core.measure.insert`, `core.measure.remove`, `core.measure.move`, and `core.measure.set-definition`. Their targets, payloads and state rules are CVN-FC-030/031 and CVN-FC-050–053. In particular:

- anchors are `start | after-measure`, never indices；
- insert payload covers every current Part exactly once and is canonicalized into current Part order；
- insert/remove/move update global measure order and every Part's measure coverage atomically；
- set-definition uses explicit `pickup: none | duration` so omission never carries hidden meaning；
- inverse effects preserve removed definitions, contents and descendants required for exact undo。

### 11.3 Part/Staff/Voice lifecycle

CVN-4 owns exactly fifteen additions listed by CVN-FC-041: five Part, four Staff, five Voice and one Event staff-assignment command. CVN-FC-060–063 fixes every target and payload; child planning does not add aliases or generic setters.

- each command has one explicit owner target and caller-supplied IDs；
- removal follows CVN-FC-070: structurally owned descendants leave with their parent and are captured in inverse；
- Part removal includes its staves, every measure content, voices/events/notes and Part-owned extensions；
- Voice removal includes its events/notes；
- Staff removal preflights every Voice `defaultStaffId` and Event `staffId`; any live reference returns `command.reference-conflict` before effect preparation；
- reassignment uses `core.voice.set-default-staff`, `core.event.set-staff-assignment`, or an explicit batch；
- no generic `cascade: true`/reassign switch appears on remove commands；
- commands either preserve all invariants atomically or reject without partial cascade。

Measure removal follows the same aggregate principle: the global definition and every Part's matching measure content form one structural transaction. Removing a last required entity is rejected by the existing semantic invariant rather than creating a temporarily invalid committed document. Unknown Part-owned extension payload removed with a Part is stored in the inverse and restored deeply equal by undo.

## 12. Range and Batch

`ScoreRange` remains the addressing input; persisted tick/slot/index targets remain excluded. CVN-5 owns exactly `core.range.delete`, `core.range.transpose-written-pitch`, and `core.transaction.batch`; range kind behavior and canonical traversal are CVN-FC-080–082.

The fixed batch form is a versioned semantic command submitted through `submit(unknown)`, rather than a second `submitBatch()` state-changing method. It accepts ordered raw semantic envelopes only when the session's frozen assembly uniquely resolves every Core or official-module child. It never accepts accepted-command objects, catalog/assembly handles or effects. CVN-FC-090–093 fixes:

- ordered child command envelopes；
- nested batch exclusion；
- child count `1..100`, input depth `64`, input properties `1,048,576`, effects `131,072`, and affected addresses `131,072`；
- failure index and deterministic failure priority；
- one candidate, validation pass, commit, version increment, history entry and committed event；
- replay equality and current-assembly catalog resolution；
- deterministic aggregated assessment: child index orders preparation/effects/affected facts/failure attribution; the final candidate produces one Core-first then frozen-module-catalog-order assessment without per-child validator/classifier reruns。

Child preparation and effect application are sequential against the same isolated candidate. Intermediate candidates may be semantically incomplete when a later child is intended to restore an invariant; strict envelope/target/ownership/effect checks still run per child, and the complete semantic/domain validation pipeline runs once after all children have prepared and applied. Any failure discards the whole candidate. If every child is an effective no-op, the batch is a no-op; otherwise it is one commit.

Decode/route/target/prepare/effect child failures use `command.batch-child-rejected` with a zero-based index. Final Core/module semantic failures remain top-level because attributing a legal intermediate invalidity to the final child would be false. Failure selection follows CVN-FC-100–102.

Range delete/transpose may compile to multiple private effects, but callers never see those effects.

## 13. API Evolution

- Existing V1 APIs remain available with their current signatures and behavior.
- Integrated APIs and official SDK contracts use explicit version discriminants.
- New capability is additive; deprecated APIs remain until a separately approved major-version removal plan exists.
- `brilliant-score-1` remains current while new commands operate on its existing structures. A persisted schema major version is introduced only when a required concept cannot be represented losslessly by the current schema or ExtensionBlock mechanism.
- Public export tests maintain exact allowlists for root APIs and separate allowlists for any approved official module SDK entrypoint.

## 14. Performance and Resource Bounds

- clone once per candidate transaction, not once per effect；
- public arrays must be dense and bounded before element traversal；
- batch/effect/address/module/compatibility limits are the exact CVN-FC-010/090/111 values；
- transaction-local indexes may be used, but no mutable cache crosses commit boundaries without an independently tested invalidation contract；
- final qualification records deterministic fixtures at small, medium, product-representative and stress score/history sizes。

The release-blocking representative fixture is fixed at 200 Measures, 8 Parts, exactly 2 Voices per Part/Measure and exactly 8 Events per Voice: 25,600 Events. It includes exactly two synthetic official module contributions and exactly 2,000 committed long-history entries. Event mix, note count, IDs and extension blocks follow CVN-FC-131.

On a recorded Windows reference environment, after warm-up and repeated sampling, the P95 budgets are:

| Operation | P95 budget |
|---|---:|
| Ordinary single-target submit, undo or redo | `<= 100 ms` |
| Immutable read or snapshot creation | `<= 50 ms` |
| 100-child atomic batch | `<= 300 ms` |
| 100-command deterministic replay | `<= 2 s` |
| Representative create/decode/semantic/compatibility pipeline | `<= 1 s` |

The completion/stress fixture is fixed at 400 Measures, 16 Parts, exactly 2 Voices per Part/Measure and exactly 8 Events per Voice: 102,400 Events, plus exactly 10,000 submitted and replayed envelopes. It is blocking for deterministic equality and peak RSS `<= 2.0 GiB`; its latency remains a recorded trend until a separate budget is approved.

Portable CI enforces deterministic results, bounded work and same-run candidate/accepted-baseline median and P95 ratios `<= 1.20`. Absolute timing gates run only on the CVN-FC-133 environment. Each operation uses five warm-ups and twenty measured fresh-state samples; P95 is nearest-rank sample 19. Every record includes generator/version/seed, median/P95, peak heap/RSS, Node/OS/CPU/memory and build hash.

CVN-7 must pin the exact reference environment and benchmark runner before its first release-gate measurement. A failing run may not be made green by silently changing the machine, runtime, fixture or sample method; any replacement requires a recorded equivalence rationale and renewed review.

## 15. Compatibility Matrix

| Path | Spine refactor | Later VNext capability |
|---|---|---|
| Core-only create/submit/undo/redo/read | Deeply equal | Existing behavior retained; new commands additive |
| Core-only replay | Deeply equal | New Core commands replayable |
| Core-only Registry/Gateway | Deeply equal | Existing summary/capabilities retained |
| Persisted `brilliant-score-1` | Unchanged | Remains current unless separately versioned |
| Unknown ExtensionBlock | Deeply equal | Preserved through all new operations |
| Aggregate removal | Not applicable | Owned descendants restore deeply equal; cross-reference conflicts reject atomically |
| Integrated official modules | Construction only after child approval | Same bus/history/replay/event pipeline |
| Runtime hot plug | Absent | Absent |

## 16. Delivery Dependency and Legacy-Gate Mapping

```text
CVN-0 -> CVN-1 -> CVN-2 -> CVN-6
              \-> CVN-3 -> CVN-4
CVN-2 + CVN-3 + CVN-4 + CVN-6 -> CVN-5
CVN-0 .. CVN-6 -> CVN-7
CVN-7 accepted -> resume Guitar Domain planning
```

The graph is dependency-based rather than numeric-order-based. CVN-3/4 may progress beside CVN-2/6 after CVN-1, but cross-module batch acceptance in CVN-5 waits for both the structural commands and the integrated validation/runtime seam.

Legacy roadmap ownership is reconciled without reopening GD-0's public declarations:

| Previous label | Core VNext owner |
|---|---|
| CK1.1-0 hostile-input guards | CVN-0 |
| CK1.1-1 official module SDK | CVN-2 |
| GD-2 behavior-preserving runtime foundation | CVN-1 |
| GD-2 integrated command/validation/replay seam | CVN-6 |
| GD-2 cross-module batch extension | CVN-5 |
| GD-1/GD-3/GD-4 Guitar work | resumes only after CVN-7 |

No old label creates a duplicate implementation task. Before CVN-2 starts, GD-0 must receive independent acceptance and active product/Core roadmap documents must record this ownership mapping.

### Requirement-to-gate traceability

| PRD requirement | Owning gate(s) | Decisive evidence |
|---|---|---|
| CVN-R001 finite charter | Parent, CVN-7 | fixed eight-gate graph and final closure audit |
| CVN-R002 contribution seam | CVN-2, CVN-6 | compiled catalog plus one unified atomic runtime path |
| CVN-R003 module SDK | CVN-2 | public SDK allowlist, hostile-input and two-module catalog fixtures |
| CVN-R004 structure operations | CVN-3, CVN-4 | factory and Measure/Part/Staff/Voice lifecycle matrices |
| CVN-R005 range/batch | CVN-5 | range commands and 100-child Core/module atomic batch matrix |
| CVN-R006 validation/compatibility | CVN-6 | complete/incomplete availability and deterministic call-order fixtures |
| CVN-R007 schema/migration | CVN-6 | detached migration round-trip and unknown-extension preservation |
| CVN-R008 input boundary | CVN-0, every later public decoder | descriptor-first/no-getter/no-throw regression matrix |
| CVN-R009 API compatibility | CVN-1, CVN-2, CVN-7 | Core V1 characterization and exact export allowlists |
| CVN-R010 reliability/scale | CVN-7 | fixed representative/stress benchmark evidence |
| CVN-R011 delivery model | Parent | child metadata, explicit dependencies and independent acceptance records |

## 17. Rollback Strategy

- Spine refactor is delivered as one independently revertible child task with no persisted schema change.
- Existing six-command adapters remain available until the new default assembly passes characterization parity.
- Removing integrated factories/catalog modules restores Core-only behavior without data migration.
- Capability children add new command definitions/effects behind frozen catalog entries; reverting one child removes only its additive surface and tests.
- Any mismatch in public V1 result, event trace, replay result or persisted document stops the child gate and returns to the last accepted baseline.

## 18. Design Review Gates

Before implementation activation:

- parent PRD/design/implement receive user review；
- GD-0 acceptance status and CVN-D011 roadmap mapping are reconciled before CVN-2；
- only the next dependency-satisfied child is created, and its own artifacts contain explicit dependencies and protected paths before `task.py start`；
- spine-refactor child defines a machine-readable characterization fixture before touching runtime internals；
- no production child starts merely because this parent design is approved。
