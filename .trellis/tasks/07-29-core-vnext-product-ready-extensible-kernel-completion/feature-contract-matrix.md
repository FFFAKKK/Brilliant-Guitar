# Core VNext Feature Contract Matrix

> **Lifecycle:** PARENT PLANNING CONTRACT / USER REVIEW REQUIRED / NO PRODUCTION ACTIVATION.
> **Authority:** 本文件是 Core VNext 可观察功能、边界条件和验收数据的父级唯一明细合同。`prd.md` 定义目标与优先级，`design.md` 定义内部机制，`implement.md` 定义交付顺序；三者与本文件冲突时，先停止对应 child，并回到父级规划消除冲突。

## 1. 合同使用规则

1. 本文件锁定公共 ID、版本、target、payload、锚点、状态变化、失败优先级、资源上限、fixture 和决定性测试。
2. Child 可以细化私有文件拆分、私有类型名和局部算法，但必须逐行追踪到这里的 `CVN-FC-*` 编号；公共或可观察行为的变化需要父级重新评审。
3. `MUST` 表示发布阻断条件，`MUST NOT` 表示明确排除，`MAY` 只用于不影响公共观察结果的内部选择。
4. 所有示例类型均为只读数据合同；公开结果、diagnostics、facts、issues、snapshot 和事件必须 detached 且 deeply frozen。
5. 本任务只冻结规划。任何 `src/**`、`test/**` 或 active spec 实施仍由独立 child 的批准状态控制。

## 2. 有限完成定义

### CVN-FC-001 — VNext 完成面

Core VNext 完成时必须同时具备：

- 当前六个 Core V1 命令的行为兼容；
- 本文件列出的二十二个新增语义命令；
- 一个纯函数式 `createScoreDocument(unknown)` factory；
- startup-frozen 官方模块贡献 assembly；
- 一个 state/transaction/history/replay/event owner；
- Core-first、module-catalog-order 的完整 validation/classification pipeline；
- hostile-input、compatibility、reliability、scale 和 deterministic replay 门禁。

命令总目录固定为 **28 个**。Guitar 规则、UI、渲染、播放、物理文件 IO、动态插件生命周期、协同编辑和通用 patch 不属于该数字，也不属于 Core VNext 完成条件。

### CVN-FC-002 — 版本与演进

- 28 个命令的首个合同均使用 `commandVersion: 1`。
- 既有六个 ID、target、payload、result、history、replay 和 event 语义保持 V1 行为。
- 新 ID 只通过 `CoreCommandEnvelope` 的追加 union 与精确导出 allowlist 暴露。
- 已发布字段不重命名、不重新解释；新增 optional 字段也需要独立兼容评审。
- `brilliant-score-1` 保持当前持久化 schema。新命令只操作现有可无损表达的结构。
- ready assembly 没有 register/unregister/replace/reload API、registry version counter 或 registry-changed event。

## 3. 所有新增入口的共同边界

### CVN-FC-010 — Strict unknown boundary

新增 factory、命令、batch、manifest 和 module contribution decoder 统一遵循：

1. 只接受 `Object.prototype` 或 `null` prototype 的普通 record，以及 dense Array。
2. 在读取值前先检查 own property descriptor；accessor、Proxy trap 异常、symbol key、稀疏数组、cycle、额外字段和不可读 descriptor 返回稳定数据失败。
3. 不调用输入对象上的方法、迭代器、`toJSON`、coercion hook 或用户 getter。
4. 字段按合同定义的固定顺序读取；diagnostics 按路径再按 code 排序。
5. 接受的数据先 clone，再 deep-freeze；调用方后续 mutation 不影响 decode、history 或 replay。
6. 所有整数先验证 `Number.isSafeInteger`；所有 number 先验证 finite。
7. 文档实体 ID 按原字符串逐码元比较，不 trim、不大小写折叠、不自动重命名。
8. 新入口的输入图最大深度为 `64`，单次入口最多检查 `1,048,576` 个 own data properties；超限使用本文件的 resource-limit failure。

Depth 以 root 为 `0`，每跨一个 object/array property 增加 `1`；property count 包含 array index 与普通 record key。Decoder 在首次观察到 `limit + 1` 时停止，因此 failure 的 `actual` 固定为 `limit + 1`，不继续遍历输入以计算完整大小。

第 8 项只约束 VNext 新入口及 batch 外层。CVN-1 对既有六个命令只做 no-getter/no-throw 的行为保持修复，不借此缩小 V1 已接受的数据规模。

### CVN-FC-011 — State result rules

| 结果 | documentVersion | undo | redo | dirty/checkpoint | committed event |
|---|---:|---|---|---|---:|
| `committed` | `+1`，溢出前预检 | push 1 | clear | 按既有规则更新 | 1 |
| `no-op` | unchanged | unchanged | unchanged | unchanged | 0 |
| `rejected` | unchanged | unchanged | unchanged | unchanged | 0 |

- Subscriber 在原子 adoption 后调用；subscriber throw/Promise rejection 不回滚已提交事务。
- Undo/redo 对一个语义事务移动一个 history entry，并分别产生一次版本递增和一次 committed event。
- Replay 只接受原始语义 envelope；stored effect、history entry、assembly handle 和 session log 均不属于 replay 输入。

## 4. Document factory

### CVN-FC-020 — 精确输入

```typescript
interface CreateScoreDocumentInputV1 {
  readonly factoryVersion: 1;
  readonly documentId: string;
  readonly metadata: ScoreMetadata;
  readonly initialMeasure: MeasureDefinition;
  readonly initialParts: readonly [
    InitialPartV1,
    ...InitialPartV1[],
  ];
  readonly extensions: readonly ExtensionBlock[];
}

interface InitialPartV1 {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly [StaffDefinition, ...StaffDefinition[]];
  readonly voices: readonly [Voice, ...Voice[]];
}
```

- Factory 固定创建一个 initial measure；`Voice.sequence` 可以为空，也可以携带适合该 measure 的 events。
- Core 为每个 `InitialPartV1` 生成一个 `PartMeasureContent`，其 `measureId` 等于 `initialMeasure.id`。
- 每个 voice 的 `defaultStaffId` 必须属于同一 initial part；event 的显式 `staffId` 同样必须属于该 part。
- `extensions` 可以为空；Part owner 必须引用 `initialParts` 中的 ID。
- 所有 ID、metadata、meter、pickup、instrument、staff、voice、event、note 与 extension 数据由调用方明确提供。Factory 不读取时间、随机源、locale、环境变量或文件系统。

### CVN-FC-021 — 精确输出

```typescript
type CreateScoreDocumentResult =
  | {
      readonly status: "created";
      readonly document: ScoreDocument;
      readonly support: ScoreSupportResult;
    }
  | {
      readonly status: "rejected";
      readonly failure:
        | {
            readonly code: "factory.invalid-input";
            readonly diagnostics: readonly DecodeDiagnostic[];
          }
        | {
            readonly code: "factory.semantic-invalid";
            readonly diagnostics: readonly SemanticDiagnostic[];
          }
        | {
            readonly code: "factory.resource-limit-exceeded";
            readonly limitKind: "input-depth" | "input-properties";
            readonly limit: number;
            readonly actual: number;
          };
    };
```

- 成功文档固定写入 `schemaVersion: "brilliant-score-1"`，并通过完整 Core semantic validation。
- 输出 document/support 与输入无引用共享。
- 该 factory 不创建、替换或重置活动 bus；调用方随后显式选择 Core-only 或 integrated construction。
- 同一输入重复调用的 encoded document 和 support 必须 deeply equal。

## 5. 稳定锚点

### CVN-FC-030 — 锚点类型

```typescript
type MeasureAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-measure"; readonly measureId: string };

type PartAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-part"; readonly partId: string };

type StaffAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-staff"; readonly staffId: string };

type VoiceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-voice"; readonly voiceId: string };
```

### CVN-FC-031 — 锚点解析

- `start` 表示 owner list 的第一个位置。
- `after-*` 表示紧随同一 owner list 内的稳定实体 ID。
- anchor ID 全局不存在：`command.anchor-not-found`。
- anchor 存在但 owner 不同：`command.anchor-wrong-owner`。
- move 的 anchor 指向被移动 target：`command.anchor-self-reference`。
- Move 先在原始 owner list 验证 anchor，再移除 target，再在剩余 list 中定位 anchor 并插入。
- Move 后规范位置与当前位置相同：`no-op`。
- 数组下标、tick、slot、隐式当前位置与“before”锚点均不进入公共合同。

## 6. 命令目录

### CVN-FC-040 — 保持不变的六个 V1 命令

| Command ID | Target | Payload |
|---|---|---|
| `core.document.set-metadata` | document | `{ metadata: ScoreMetadata }` |
| `core.note.set-written-pitch` | note | `{ writtenPitch: WrittenPitch }` |
| `core.event.set-note-value` | event | `{ noteValue: NoteValue }` |
| `core.voice.insert-notes-event` | voice | `{ anchor: SequenceAnchor; event: NotesRhythmicEvent }` |
| `core.voice.insert-rest-event` | voice | `{ anchor: SequenceAnchor; event: RestRhythmicEvent }` |
| `core.event.remove` | event | `{}` |

这些合同由 Core V1 characterization fixture 直接保护，本父任务不重新定义其细节。

### CVN-FC-041 — 新增二十二个 VNext 命令

| Gate | Command ID | Target | Payload summary |
|---|---|---|---|
| CVN-3 | `core.measure.insert` | document | anchor + definition + per-Part voices |
| CVN-3 | `core.measure.remove` | measure | `{}` |
| CVN-3 | `core.measure.move` | measure | measure anchor |
| CVN-3 | `core.measure.set-definition` | measure | meter + explicit pickup setting |
| CVN-4 | `core.part.insert` | document | part anchor + complete Part |
| CVN-4 | `core.part.remove` | part | `{}` |
| CVN-4 | `core.part.move` | part | part anchor |
| CVN-4 | `core.part.set-name` | part | name |
| CVN-4 | `core.part.set-instrument` | part | instrument descriptor |
| CVN-4 | `core.staff.insert` | part | staff anchor + StaffDefinition |
| CVN-4 | `core.staff.remove` | staff | `{}` |
| CVN-4 | `core.staff.move` | staff | staff anchor |
| CVN-4 | `core.staff.set-definition` | staff | lineCount + defaultClef |
| CVN-4 | `core.voice.insert` | part | measureId + voice anchor + Voice |
| CVN-4 | `core.voice.remove` | voice | `{}` |
| CVN-4 | `core.voice.move` | voice | voice anchor |
| CVN-4 | `core.voice.set-default-staff` | voice | staffId |
| CVN-4 | `core.voice.set-sequence-start` | voice | Fraction start |
| CVN-4 | `core.event.set-staff-assignment` | event | inherit or explicit staff |
| CVN-5 | `core.range.delete` | document | ScoreRange |
| CVN-5 | `core.range.transpose-written-pitch` | document | ScoreRange + Transposition |
| CVN-5 | `core.transaction.batch` | document | ordered raw envelopes |

不新增 note/chord lifecycle、generic property bag、generic replace、generic patch 或第二个 submit 入口。

## 7. Measure 命令

### CVN-FC-050 — `core.measure.insert`

```typescript
interface InsertMeasurePayloadV1 {
  readonly anchor: MeasureAnchor;
  readonly definition: MeasureDefinition;
  readonly contents: readonly [
    {
      readonly partId: string;
      readonly voices: readonly [Voice, ...Voice[]];
    },
    ...{
      readonly partId: string;
      readonly voices: readonly [Voice, ...Voice[]];
    }[],
  ];
}
```

- `contents` 必须与当前 Part ID 集合一一对应，无缺失、重复或额外 Part。
- Core 按当前 Part 顺序规范化 `contents`，忽略调用方排列对最终文档顺序的影响。
- 每个新 content 的 `measureId` 由 `definition.id` 生成；调用方不重复提供该字段。
- 新 measure、voice、event、note ID 必须满足全局唯一性；不自动改名。
- 每个 voice/event staff 引用必须属于对应 Part；sequence 必须符合新 measure 定义。
- 一次事务同时插入 global definition 与所有 Part contents；任一错误保留原状态。

### CVN-FC-051 — `core.measure.remove`

- 原子移除 target definition 与每个 Part 中相同 `measureId` 的完整 content aggregate。
- Aggregate 包括 Voice、Event、Note；inverse 保存其完整顺序与值。
- 删除后零 measure：`command.semantic-invalid`，包含 `semantic.measure-required`。
- Score/Part extension block 本身保持原样；安装且兼容的模块 validator 若发现 payload 中的领域引用失效，在最终 domain validation 阶段拒绝整个事务。

### CVN-FC-052 — `core.measure.move`

- 同时重排 `measureDefinitions` 与每个 Part 的 `measureContents`，最终 coverage 顺序与 global measure 顺序完全一致。
- Definition 和 contents 内部值保持 deeply equal。
- 已在规范位置返回 `no-op`。

### CVN-FC-053 — `core.measure.set-definition`

```typescript
interface SetMeasureDefinitionPayloadV1 {
  readonly meter: Meter;
  readonly pickup:
    | { readonly kind: "none" }
    | { readonly kind: "duration"; readonly duration: Fraction };
}
```

- target measure ID 固定；payload 不带 ID。
- `none` 明确删除现有 pickup，`duration` 明确设置。
- 所有 Part 下该 measure 的 sequence 在最终 Core semantic validation 中复核；任一超长 sequence 原子拒绝。
- meter 与 pickup 都与当前值相同返回 `no-op`。

## 8. Part / Staff / Voice / Event 命令

### CVN-FC-060 — Part lifecycle

| Command | Exact behavior |
|---|---|
| `core.part.insert` | payload `{ anchor: PartAnchor; part: Part }`；`part.measureContents` 必须对当前每个 global measure 恰好覆盖一次，并按 global measure 顺序规范化；Part/Staff/Voice/Event/Note ID 全局唯一；Part-owned extensions 不在该命令内创建。 |
| `core.part.remove` | 移除完整 Part aggregate 与 `ScoreDocument.extensions` 中 owner 为该 Part 的全部 block；inverse 保留两处原始顺序；删除最后一个 Part 以 `semantic.part-required` 拒绝。 |
| `core.part.move` | 只改变 `ScoreDocument.parts` 顺序；Part aggregate 与 Part-owned extension block 的 extension 数组位置均保持原样；已在规范位置为 `no-op`。 |
| `core.part.set-name` | payload `{ name: string }`；保留精确字符串，不 trim；与当前值相同为 `no-op`。 |
| `core.part.set-instrument` | payload `{ instrument: InstrumentDescriptor }`；完整替换 descriptor，复跑 Core semantic/profile 与 module pipeline；deeply equal 为 `no-op`。 |

### CVN-FC-061 — Staff lifecycle

| Command | Exact behavior |
|---|---|
| `core.staff.insert` | target Part；payload `{ anchor: StaffAnchor; staff: StaffDefinition }`；ID 全局唯一；只插入 definition，不隐式创建 Voice。 |
| `core.staff.remove` | target Staff；若同一 Part 任一 Voice `defaultStaffId` 或任一 Event 显式 `staffId` 引用 target，则以 `command.reference-conflict` 拒绝；删除最后一个 Staff 以 `semantic.staff-required` 拒绝。 |
| `core.staff.move` | 只在所属 Part 的 `staves` 中重排；跨 Part anchor 以 `command.anchor-wrong-owner` 拒绝。 |
| `core.staff.set-definition` | payload `{ lineCount: number; defaultClef: Clef }`；target ID 固定；deeply equal 为 `no-op`。 |

Staff 重指向通过显式 `core.voice.set-default-staff`、`core.event.set-staff-assignment` 或一个 `core.transaction.batch` 完成；remove 命令没有 cascade/reassign flag。

### CVN-FC-062 — Voice lifecycle

| Command | Exact behavior |
|---|---|
| `core.voice.insert` | target Part；payload `{ measureId: string; anchor: VoiceAnchor; voice: Voice }`；owner 是该 Part 的指定 PartMeasureContent；voice 至少满足 current semantic schema，ID 全局唯一，staff 引用属于 target Part。 |
| `core.voice.remove` | 移除 Voice 及其 Event/Note descendants；删除该 PartMeasureContent 的最后一个 Voice 以 `semantic.voice-required` 拒绝。 |
| `core.voice.move` | target Voice；payload `{ anchor: VoiceAnchor }`；只允许同一 PartMeasureContent 内重排，跨 measure 或 Part anchor 以 `command.anchor-wrong-owner` 拒绝。 |
| `core.voice.set-default-staff` | payload `{ staffId: string }`；Staff 必须属于 Voice 所属 Part；相同值为 `no-op`。 |
| `core.voice.set-sequence-start` | payload `{ start: Fraction }`；设置精确 canonical Fraction；复核 sequence bounds/duration；相同值为 `no-op`。 |

### CVN-FC-063 — Event staff assignment

```typescript
interface SetEventStaffAssignmentPayloadV1 {
  readonly assignment:
    | { readonly kind: "inherit-default" }
    | { readonly kind: "staff"; readonly staffId: string };
}
```

- `inherit-default` 删除 event 的显式 `staffId` 字段。
- `staff` 设置属于 event 所在 Part 的 Staff ID。
- 解析后的有效 assignment 与当前状态相同返回 `no-op`。
- 该命令不移动 event、不改变 Voice default，也不批量修改其他 event。

## 9. 删除与引用总规则

### CVN-FC-070 — Ownership cascade

| Removed target | Automatically removed owned data | Preserved / separately validated data |
|---|---|---|
| Measure | global definition；每个 Part 的 matching content；其 Voices/Events/Notes | score/Part ExtensionBlocks 原样保留；兼容模块复核引用 |
| Part | Staves；all measure contents；Voices/Events/Notes；该 Part-owned ExtensionBlocks | score-owned blocks；其他 Part |
| Voice | Events；Notes | Staff definitions；siblings；ExtensionBlocks |
| Event | Notes | Voice；Staff；ExtensionBlocks |
| Staff | none | 任一 Voice/Event 引用存在时严格拒绝 |

- Cascade 是每个语义命令的固定组成，不提供公开开关。
- Missing target 使用 `command.target-not-found`；remove 不做幂等成功。
- 任何 reject 的 encoded document、version、history、redo、checkpoint、dirty 和 event trace 必须与调用前 byte/deep equal。
- Undo 必须恢复被删 aggregate、unknown extension payload 和所有数组位置；redo 再次得到首次 commit 的 encoded document。

## 10. Range 命令

### CVN-FC-080 — 共同选择规则

- 输入沿用当前 `ScoreRange` 三个 discriminant。
- 反向 endpoints 按当前 `selectScoreRange` 的 musical/document order 规范化。
- endpoint 缺失：`command.range-endpoint-not-found`。
- Part/Voice owner 不一致：`command.range-owner-mismatch`。
- range 结构不合法：`command.invalid-range`。
- 遍历顺序固定为 measure order → Part order → Voice order → Event order → Note order；只适用的层级被保留。

### CVN-FC-081 — `core.range.delete`

| Range kind | Exact effect |
|---|---|
| `measure-range` | 删除 inclusive global measures 与每个 Part 的 matching contents；保留至少一个 measure；顺序与 inverse 规则等同多次 measure remove 的一个原子事务。 |
| `part-measure-range` | 对指定 Part 的 inclusive measure contents，把每个 Voice 的 `sequence.events` 设为空数组；保留 PartMeasureContent、Voice、sequence start 与 Staff。 |
| `voice-event-range` | 从指定 Voice 删除 inclusive events 及其 notes。 |

- 有效选择内没有 event 的 `part-measure-range` 返回 `no-op`。
- `voice-event-range` endpoints 本身保证至少一个 event，因此成功时为 changed。
- 删除全部 global measures 以 `semantic.measure-required` 原子拒绝。

### CVN-FC-082 — `core.range.transpose-written-pitch`

```typescript
interface TransposeRangePayloadV1 {
  readonly range: ScoreRange;
  readonly transposition: Transposition;
}
```

- `measure-range` 选择所有 Part/Voice/Event/Note；`part-measure-range` 选择一个 Part 的所有 Voice/Event/Note；`voice-event-range` 选择一个 Voice 的 selected events/notes。
- Rest 被跳过。Notes event 中每个 note 独立调用 Core 当前的 `transposeWrittenPitch` 规则，成功结果写回 `writtenPitch`。
- `{ diatonicSteps: 0, chromaticSemitones: 0 }` 或选择内零 note 返回 `no-op`。
- 第一个失败 note 按 CVN-FC-080 规范顺序报告 `command.range-transform-invalid`，包含 note address 与 allowlisted reason；整个事务无变更。
- 不做 enharmonic 自动改写、不改变 sounding-transposition descriptor、不创建 domain placement 数据。

## 11. Explicit atomic batch

### CVN-FC-090 — Envelope and limits

```typescript
interface BatchCommandPayloadV1 {
  readonly commands: readonly [unknown, ...unknown[]];
}
```

- ID 固定为 `core.transaction.batch`，target 必须是当前 document。
- `commands` 必须 dense，child count 为 `1..100`；0 个、101 个、稀疏数组分别稳定拒绝。
- Child 是原始 semantic command envelope，可来自当前 frozen assembly 的 Core 或官方模块 catalog。
- Child 中出现 `core.transaction.batch` 时，外层返回 `command.batch-child-rejected`，其零基 `failedCommandIndex` 指向该 child，inner failure 为 `command.batch-nested`。
- Payload 中不出现 accepted command、effect、history、registry、catalog、assembly 或 gateway handle。
- 整个 transaction 展开的 primitive effects 上限 `131,072`；去重后的 canonical affected addresses 上限 `131,072`。

### CVN-FC-091 — 固定执行顺序

1. integrated write availability preflight；
2. outer envelope strict decode、version、ID、target；
3. batch payload dense/nonempty/100-child/nested/resource preflight；
4. 按 index 对每个 child 执行 outer decode → catalog unique route → strict contribution decode → target/owner/anchor preflight → prepare → effect contract validation → apply to同一个 isolated candidate；
5. 全部 child 完成后运行一次 Core semantic validation；
6. 按 frozen catalog order 运行所有适用 module validators；
7. 运行 Core profile，再按 catalog order 运行 module classifiers；
8. 生成 canonical facts/affected addresses，预留 version/history/event sequence；
9. 一次 adoption；
10. 发布一个 aggregate committed event。

Intermediate candidate 可以暂时违反只由后续 child 修复的 document semantic invariant；每个 child 自身的 envelope、target、owner、anchor、effect ownership 与 resource contract 仍立即验证。最终 candidate 必须完整通过步骤 5–8。

### CVN-FC-092 — Failure attribution

- Child 在 decode/route/target/prepare/effect 阶段失败：返回 `command.batch-child-rejected`，`failedCommandIndex` 为零基 index，`failure` 为该 child 的 frozen failure。
- Final Core/module semantic validation 失败：返回相应顶层 semantic/contribution failure，不伪造 child index，因为 intermediate invalidity 是合法 batch 语义。
- Version、history 或 event capacity 失败：返回对应顶层 failure。
- 任一失败丢弃 candidate；状态按 CVN-FC-070 保持。

### CVN-FC-093 — Commit/history/replay

- 所有 child effective no-op：batch `no-op`，redo 保留。
- 至少一个 child changed：documentVersion `+1`、history entry `+1`、redo clear、committed event `1`。
- History 保存原始 frozen batch envelope、按 child/effect 顺序的 effective forward sets、全局 reverse-order inverse sets 和 canonical affected facts；不保存整文档 snapshot。
- Assessment 聚合顺序固定为 child index；每个 child 内 Core first，再按 frozen module catalog order，再按 validator/classifier 返回顺序。
- Replay 在当前同一逻辑 assembly 上重新 route 每个原始 child；缺失、重复或不兼容 binding 原子拒绝，不使用历史 stored effects 代替解析。

## 12. 新增稳定失败

### CVN-FC-100 — Core VNext failure union

在既有 `CommandFailure` 与 GD-0 `KernelContributionFailure` 上追加：

```typescript
type CoreVNextCommandFailure =
  | CommandFailure
  | KernelContributionFailure
  | { readonly code: "command.anchor-self-reference" }
  | { readonly code: "command.reference-conflict" }
  | { readonly code: "command.invalid-range" }
  | { readonly code: "command.range-endpoint-not-found" }
  | { readonly code: "command.range-owner-mismatch" }
  | {
      readonly code: "command.range-transform-invalid";
      readonly address: Extract<ScoreAddress, { readonly kind: "note" }>;
      readonly reason:
        | "written-pitch-invalid"
        | "transposition-component-invalid"
        | "derived-pitch-alter-out-of-range"
        | "derived-pitch-octave-out-of-range";
    }
  | { readonly code: "command.batch-empty" }
  | { readonly code: "command.batch-nested" }
  | {
      readonly code: "command.batch-child-rejected";
      readonly failedCommandIndex: number;
      readonly failure: BatchChildFailure;
    }
  | {
      readonly code: "command.resource-limit-exceeded";
      readonly limitKind:
        | "input-depth"
        | "input-properties"
        | "batch-children"
        | "effects"
        | "affected-addresses"
        | "compatibility-facts"
        | "module-issues";
      readonly limit: number;
      readonly actual: number;
    };
```

`BatchChildFailure` 是当前 assembly 可产生的非 batch-wrapper command failure；由于 nested batch 在 child route 前拒绝，failure graph 最多一层。

### CVN-FC-101 — Failure priority

当同一输入同时含多个问题时，固定选择：

1. integrated availability (`incompatible` 高于 `unavailable`)；
2. unreadable/invalid outer envelope；
3. unsupported command version；
4. unknown command ID；
5. target kind mismatch；
6. command payload shape/resource limit；
7. target/endpoint/owner/anchor resolution；
8. prepare/reference/effect contract；
9. final Core semantic；
10. final module semantic；
11. profile/classifier/fact contract；
12. version/history/event capacity；
13. isolated internal error。

Batch 在第 3 步以后按 child index 完成 2–8 的局部优先级；更高 index 的问题不覆盖更低 index 已确定的失败。

### CVN-FC-102 — Failure privacy

Public failure/issue/fact 中只保留 allowlisted code、module/contribution identity、canonical address/path、limit 数值与 frozen diagnostics。Stack、绝对源码路径、handler/effect object、extension payload、raw command payload、catalog object 与原始 thrown value不进入结果、log fixture 或 event。

## 13. Official module contribution seam

### CVN-FC-110 — 唯一入口与 ABI authority

- Additive registration entry 固定为 `kernel.domain-commands.v1`。
- Public application-facing declarations 以 `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/design.md` 中 `public-contract` fences 与 `.trellis/spec/core-kernel/backend/domain-transaction-integration.md` 为精确 authority。
- Module SDK minimum ABI 固定为 `CompiledDomainCommandContributionV1`：`apiVersion/moduleId/contributionId/extensionNamespaces/extensionRequirements/commands/validate/classify/effects` 九个字段。
- Manifest 只选择数据 descriptor；直接函数 binding 来自 composition root 静态 import，不从 manifest、document、extension payload 或网络反序列化。
- 只接受 `origin: "official"`、`runtime: "builtin" | "internal-module"`、`trust: "system-trusted"` 与所需 capability 完整匹配的 contribution。

### CVN-FC-111 — Assembly construction

Catalog construction all-or-nothing，并依次验证：

1. strict manifest/descriptor/API version；
2. module/contribution/registration identity parity；
3. origin/runtime/trust/capability；
4. unique module、contribution、command ID、effect kind、extension namespace；
5. command namespace、target kind、descriptor/handler parity；
6. requirement identity 与 exact supported schema-version list；
7. effect namespace/owner allowlist；
8. sync return、deep-freeze 与 absence of ready-state mutation API。

Contribution ABI V1 resource caps：

| Item | Inclusive maximum |
|---|---:|
| modules | 64 |
| domain contribution entries | 256 |
| total command descriptors | 4,096 |
| total effect definitions | 4,096 |
| total owned extension namespaces | 1,024 |
| supported schema versions per requirement | 256 |
| module issues returned by one callback | 1,024 |
| aggregate module issues per transaction | 4,096 |
| canonical compatibility facts | 131,072 |

单个 callback 返回第 1,025 个 issue 时使用 `command.contribution-contract-violation`；合法 callback 的 aggregate issue 到达第 4,097 个时使用 `command.resource-limit-exceeded`/`module-issues`。Assembly root 的 module/contribution 总量超限使用 `registry.invalid-startup-input`；某个 registration entry 的 commands/effects/namespaces/version list 超限使用 `registry.invalid-contribution` 并返回该 `registrationEntryId`；compatibility facts 到达第 131,073 个时使用 `command.resource-limit-exceeded`/`compatibility-facts`。所有分支保持零可调用 handler 或零活动 session。

### CVN-FC-112 — Runtime authority

- Core-only default assembly 继续支持既有 factory/registry/bus。
- Integrated registry、bus、gateway、replay 必须共享同一个 process-local private assembly identity。
- Module handler 只接收 detached read view 与受限 builder，不接收 mutable document、history、bus、registry、subscriber 或 raw session state。
- Module 只请求 forward effects；Core/owned effect definition 从 candidate 当前值推导 inverse，并逆序保存。
- 第一版 module-to-Core effect request 只开放 WrittenPitch replacement；module-owned effect 只替换/删除声明 namespace 与 score/Part owner 的 ExtensionBlock。
- Generic JSON patch/path、whole-document replacement、arbitrary callback mutation 与 module-supplied inverse 均排除。

## 14. Validation、compatibility 与 migration

### CVN-FC-120 — Changed-candidate pipeline

1. Core semantic validation；
2. exact-compatible module validator，按 frozen catalog order；
3. 任一 semantic issue 则原子 reject；
4. Core feature profile；
5. module classifier，按 frozen catalog order；
6. canonical affected/fact/event preparation；
7. one adoption；
8. isolated subscriber dispatch。

Module validator/classifier 只看到自己拥有且 exact-compatible 的 blocks，以及 detached Core read data。Incompatible/future block 对应的 decoder、handler、validator、classifier、effect 和 fact callback 调用次数必须为零。

### CVN-FC-121 — Availability

- Known block + exact supported version + contribution present：完整参与 pipeline。
- Known block + exact supported version + contribution absent：`required-contribution-unavailable`，lossless read-only。
- Known block + unlisted/future version：`required-contribution-incompatible`，lossless read-only。
- Mixed facts：failure code 选择 incompatible，返回完整 canonical mixed fact list。
- Unknown undeclared opaque extension：Core V1 lossless preservation，默认仍 writable，不声称已做领域验证。
- Submit/undo/redo/每个 replay write 在 decode 或 empty-history check 前共享 availability preflight；empty replay 是唯一不写路径，可原样成功。

### CVN-FC-122 — Migration

- Official extension migration 是 detached、deterministic、pure-data pipeline，不绑定活动 bus。
- 每次只由 namespace owner 读取/写入自己的 exact owner block；其他 block byte/deep equal。
- Migration 输入输出均通过 strict codec、Core semantic、compatible module validation 与 encode/decode round-trip。
- `brilliant-score-1` 字段变更、物理文件替换、自动保存、rollback 文件和 crash recovery 仍由后续独立 schema/persistence 工作负责。

## 15. 资源与性能门禁

### CVN-FC-130 — 没有隐式最大文档声明

Core VNext 不把 25,600 或 102,400 events 声明为可读取文档的硬上限。它们分别是 release-blocking representative fixture 与 deterministic stress fixture。单次新入口、transaction、assembly 和 facts 受 CVN-FC-010/090/111 的明确工作量上限控制；超过上限返回稳定结果，不产生部分状态。

### CVN-FC-131 — Representative fixture（精确 25,600 events）

- 200 measures，全部 4/4，无 pickup；
- 8 Parts；每 Part 1 Staff；
- 每个 PartMeasureContent 恰好 2 Voices；
- 每个 Voice `start = 0/1`，恰好 8 个 `1/8` events；even index 为一个-note Notes event，odd index 为 Rest；
- 总 events：`200 × 8 × 2 × 8 = 25,600`；总 notes：`12,800`；
- 所有 ID 由固定 seed 的纯生成器生成；
- 恰好 2 个 synthetic official contributions：一个 score-owned schema-1 block，一个在每个 Part 上的 part-owned schema-1 block；两者都有 validator/classifier，且 cross-module batch fixture 各含一个 changed command；
- long-history case 恰好保留 2,000 个 committed entries，不含 undo/redo 空洞。

### CVN-FC-132 — Stress fixture（精确 102,400 events）

- 400 measures、16 Parts、每 Part 1 Staff、每 PartMeasureContent 2 Voices、每 Voice 8 个交替 Notes/Rest eighth-note events；
- 总 events：`400 × 16 × 2 × 8 = 102,400`；总 notes：`51,200`；
- 从同一个 initial document 顺序提交并保留 10,000 个 deterministic semantic commands；
- 从相同 initial document replay 同一 10,000 envelopes；final encoded document、version、support、availability 与 per-command status sequence 必须 deeply equal；
- peak RSS `<= 2.0 GiB`，无 process crash、stack overflow、unhandled rejection、state divergence 或 whole-document-per-history-entry 证据；latency 先记录趋势，不作为首个 VNext release 的绝对阻断值。

### CVN-FC-133 — Reference environment 与采样

首个 release gate 固定使用：

```text
Node: v24.15.0
Platform: win32 x64
OS kernel visible to process: NT 10.0.26200.0
CPU: 13th Gen Intel(R) Core(TM) i9-13900HX
Logical CPUs: 32
Physical memory reported by Node: 39.7 GiB
Build: clean production build, no debugger/instrumentation
```

每个 operation：

1. 使用独立 fresh fixture/state；
2. 先执行 5 次未记录 warm-up；
3. 再执行 20 次 measured samples；
4. 使用 `performance.now()`；
5. median 为排序后第 10 与第 11 个样本的算术平均；
6. P95 为 nearest-rank 第 `ceil(0.95 × 20) = 19` 个样本；
7. 记录 generator/version/seed、Node/OS/CPU/memory、build hash、median、P95、peak `heapUsed` 与 peak RSS。

### CVN-FC-134 — Release budgets

| Operation | Fixture | P95 |
|---|---|---:|
| ordinary changed single-target submit | representative | `<= 100 ms` |
| undo one ordinary entry | representative | `<= 100 ms` |
| redo one ordinary entry | representative | `<= 100 ms` |
| immutable read state | representative | `<= 50 ms` |
| document snapshot creation | representative | `<= 50 ms` |
| 100-child changed atomic batch | representative | `<= 300 ms` |
| replay 100 changed semantic commands | representative | `<= 2,000 ms` |
| factory/decode + Core semantic + compatibility construction | representative | `<= 1,000 ms` |

Representative benchmark process peak RSS 固定 `<= 1.0 GiB`。Portable CI 运行 candidate 与 accepted baseline 的同机 A/B；median 与 P95 的 candidate/baseline ratio 均 `<= 1.20`，并始终执行功能、determinism 和 resource-cap tests。绝对时间只在上述 reference environment 阻断发布。

## 16. 决定性验收矩阵

### CVN-FC-140 — 每个新增命令的最低 case set

每个 command 至少具备以下独立 tests：

1. strict valid commit；
2. equal/already-positioned no-op（确有 no-op 语义的命令）；
3. invalid envelope、extra field、wrong target kind；
4. target/anchor/owner missing 或 mismatch；
5. semantic/reference failure；
6. exact encoded before/after；
7. undo exact restore；
8. redo exact reapply；
9. replay equality；
10. checkpoint/dirty/redo-clear/event count；
11. getter/Proxy/sparse/cycle no-throw；
12. caller-mutation isolation；
13. unknown extension preservation；
14. integrated two-module validation/classification order（CVN-6 后适用）。

### CVN-FC-141 — Batch 专项

- 1 child、100 children、0 children、101 children、sparse children；
- Core-only、module-only、mixed Core/module；
- nested at index 0/99；
- child failure at index 0/50/99；
- intermediate semantic-invalid then repaired final valid；
- final semantic-invalid with no fabricated child index；
- all no-op；changed + no-op mixed；
- effect/affected limit exact boundary与 boundary+1；
- reverse inverse order；redo invalidation；replay catalog mismatch；
- each rejected case 的完整 pre/post state equality。

### CVN-FC-142 — Factory/structure 专项

- minimum one-measure/one-Part/one-Staff/one-Voice；
- multi-Part initial graph；
- duplicate IDs、missing coverage、wrong staff refs、invalid sequence；
- measure insert canonicalizes caller-shuffled per-Part contents；
- measure move keeps every Part coverage aligned；
- Part/Voice/Measure aggregate delete restores exact order/value；
- Staff reference conflict survives submit/undo/redo/replay state audit；
- last measure/Part/Staff/Voice diagnostic code exact。

### CVN-FC-143 — Module integration 专项

- all-or-nothing catalog with 0、1、2 contributions；
- duplicate identity/command/effect/namespace；
- descriptor/handler/requirement mismatch；
- unavailable/incompatible/mixed/unknown opaque matrices；
- callback throw、Promise-like sync hook return、malformed effects/issues/facts；
- same-assembly success与 cross-assembly/Core-only mismatch；
- no callback against incompatible/future block；
- failure privacy scan；
- root export allowlist、SDK export allowlist、forbidden Guitar dependency。

## 17. Child gate 输入与停止条件

每个 FC 组只有一个 primary owner；consumer gate 复用合同并增加集成证据，不获得改写权。

| Primary owner | Owned FC rows | Consumer / required output |
|---|---|---|
| Parent | CVN-FC-001/002/041 | finite catalog/version charter；CVN-7 final recount |
| CVN-0 | CVN-FC-010 | every later decoder；public guards/codecs characterization + hostile-input proof |
| CVN-1 | CVN-FC-011/040 | every later command；six-command deep parity + private spine/effect-set foundation |
| CVN-2 | CVN-FC-110/111 | CVN-6；typed SDK + detached frozen catalog, no writable integrated runtime |
| CVN-3 | CVN-FC-020/021/030/031/050–053 | CVN-4/5；factory + four exact Measure commands |
| CVN-4 | CVN-FC-060–070 | CVN-5/7；fifteen exact hierarchy/property commands |
| CVN-5 | CVN-FC-080–102 | CVN-7；two range commands + one batch command |
| CVN-6 | CVN-FC-112/120–122 | CVN-5/7；assembly-bound runtime + validation/profile/diagnostic/migration |
| CVN-7 | CVN-FC-130–143 | compatibility, scale, resource, deterministic integration evidence |

任一 child 若需要改变命令 ID/target/payload、cascade、range、batch attribution、failure priority、caps、fixture 或 budget，即触发父级规划复审；child 内不以“implementation detail”覆盖这些观察合同。

## 18. 明确排除与后续扩展点

- Note/chord insert/remove/move、multi-note chord editing 与 articulation lifecycle；
- Guitar string/fret/tuning/technique 数据或规则；
- runtime module discovery、install、unload、replace、hot reload；
- third-party sandbox/host/process/signature/permission lifecycle；
- generic patch、JSON path、array-index target、mutable document getter；
- implicit history merge、time-window compression、macro recording；
- collaboration、OT/CRDT、cross-session undo；
- UI/layout/render/playback/audio/persistence/package IO。

这些能力只通过后续独立、追加式、版本化规划进入；Core VNext 按 CVN-FC-001 与 CVN-7 evidence 关闭，不以“继续完善内核”无限扩张。
