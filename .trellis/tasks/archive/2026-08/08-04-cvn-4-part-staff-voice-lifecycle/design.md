# CVN-4 Part Staff Voice Lifecycle Design

## 1. 状态与设计权威

本设计把父任务的条件预规划转为可执行但尚未激活的方案。功能基线是 CVN-3 受验收 source/test 提交 d9500f5a8ac285071586ba8eda380370eafd022f，正式规划分支基线是 4e5612b0a0e586184a74e951e5b3a2394f8cc5c0。用户尚未单独授权生产实施，因此这里定义机制、边界、测试和回滚，不引入源码变更。

所有可观察行为以 PRD 的 R001 至 R020 和 AC001 至 AC035 为准；父 feature matrix 与 active Core specs 高于本设计。发生任何 schema、public-surface 或 ownership 偏差时，停止实现并回到父级任务评审。

## 2. 设计目标与冻结区

### 2.1 目标

- 用既有 single submit(unknown)、transaction、history、replay 和 event owner 实现 15 个有限命令；
- 对 Part/Staff/Voice 的位置变化只使用稳定 ID 和 owner-local anchors；
- 让每个 effect 从 candidate 取得精确 inverse，保证失败原子性；
- 保持 unknown extensions、已验收 CVN-1 trace、CVN-3 49/10/10 surface 和 persisted brilliant-score-1；
- 用固定测试 fixture 证明级联、引用冲突、逆操作、支持分层与 public-surface 计数。

### 2.2 冻结区

不得修改：

- src/core-kernel/domain/score-document.ts 与 src/core-kernel/domain/address.ts；
- src/core-kernel/codec/decode-score-document.ts、factory、command-bus、runtime、replay；
- events、read、migration、Guitar、module runtime 与产品层；
- CVN-1 characterization expected JSON 和 CVN-3 surface expected JSON；
- 既有六个 legacy-v1 command 的输入路径与公开行为。

可增加类型导出，但 root runtime value export 的 allowlist 必须保持 49。private effect、resolver records、codec helpers 和 index data 不越过 Core 私有边界。

## 3. 公共命令合同

### 3.1 锚点与负载类型

~~~ts
type PartAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-part"; readonly partId: string };

type StaffAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-staff"; readonly staffId: string };

type VoiceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-voice"; readonly voiceId: string };

interface InsertPartPayloadV1 {
  readonly anchor: PartAnchor;
  readonly part: Part;
}
interface MovePartPayloadV1 { readonly anchor: PartAnchor; }
interface SetPartNamePayloadV1 { readonly name: string; }
interface SetPartInstrumentPayloadV1 { readonly instrument: InstrumentDescriptor; }
interface InsertStaffPayloadV1 {
  readonly anchor: StaffAnchor;
  readonly staff: StaffDefinition;
}
interface MoveStaffPayloadV1 { readonly anchor: StaffAnchor; }
interface SetStaffDefinitionPayloadV1 {
  readonly lineCount: number;
  readonly defaultClef: Clef;
}
interface InsertVoicePayloadV1 {
  readonly measureId: string;
  readonly anchor: VoiceAnchor;
  readonly voice: Voice;
}
interface MoveVoicePayloadV1 { readonly anchor: VoiceAnchor; }
interface SetVoiceDefaultStaffPayloadV1 { readonly staffId: string; }
interface SetVoiceSequenceStartPayloadV1 { readonly start: Fraction; }
interface SetEventStaffAssignmentPayloadV1 {
  readonly assignment:
    | { readonly kind: "inherit-default" }
    | { readonly kind: "staff"; readonly staffId: string };
}
~~~

Part/Staff/Voice remove 均使用 Record<string, never>。所有 command envelope 固定 commandVersion 1；catalog 追加顺序、targets、Registry title keys、sourceModuleId core.commands、apiVersion 1 和 command:execute capability 由 PRD 第 3 节精确表驱动。

### 3.2 Strict bounded path

十五个新 ID 都标为 inputBoundary vnext-bounded-v1，最终共有十九个 VNext bounded ID，原六个 V1 ID 保持 legacy-v1。路径固定：

1. descriptor-first outer envelope 检查；
2. safe integer commandVersion；
3. known ID lookup；
4. target kind 比较；
5. strict capture，深度上限 64、own data property 上限 1,048,576；
6. cloned/frozen typed decode；
7. target、owner、anchor 预备；
8. private candidate effect application；
9. final semantic validation；
10. support classification、commit/history/event。

现有 ScoreComponentDecodeContext(true) 与 Part、InstrumentDescriptor、StaffDefinition、Clef、Voice、Fraction decoder 被复用。command adapter 不得访问用户属性、执行 getter、动态调用 untrusted 方法或信任非 plain payload。

## 4. 私有 owner 与 anchor 解析

### 4.1 Resolver 扩展

ResolvedScoreEntity 仅在 private resolver 侧增加 Voice ownership data：

~~~ts
type ResolvedVoiceEntity = {
  readonly kind: "voice";
  readonly voice: Voice;
  readonly content: PartMeasureContent;
  readonly measureId: string;
  readonly part: Part;
};
~~~

Event 与 Note resolved variant 同样携带 content、measureId 和 part。现有 public target/selector result 不改变。这样 Voice/Event/Note command 与 affected-address builder 均从一次权威解析取得 owner facts，不在多个 adapter 中重复扫描或按数组 index 推测归属。

### 4.2 Anchor 算法

新增 private helpers：resolvePartAnchorInIds、resolveStaffAnchor、resolveVoiceAnchor、previousPartAnchor、previousStaffAnchor、previousVoiceAnchor 及 family-specific move insertion helpers。它们共享唯一匹配、global-existence、owner-local 与 move-after-removal 逻辑。

- start 对应 index 0；after-* 对应唯一 owner-local stable ID 后；
- anchor ID 全局不存在：command.anchor-not-found；
- anchor 全局存在但不属于当前 owner：command.anchor-wrong-owner；
- move 的 anchor 恰为 target：command.anchor-self-reference；
- move 先确认 target 在原 owner list，再移除 target，在剩余 list 解析 anchor；
- canonical 结果与原 owner list 相同：no-op。

Part owner 是 ScoreDocument.parts；Staff owner 是一个 Part.staves；Voice owner 是一个 PartMeasureContent.voices。Voice insert 的 target 为 Part，payload.measureId 必须定位该 Part 的 content。不存在 global Measure 是 command.target-not-found；存在 Measure 但目标 Part 缺 content 是内部一致性故障，不得通过替代扫描掩盖。

## 5. 命令语义

### 5.1 Part family

**insert-part-bundle** 接收完整 Part。preflight 验证其 measureContents 与全局 Measure 集合完全覆盖、没有缺失/重复/额外 measure ID，再按 global Measure order canonicalize content；final semantic pass 检查 descendant global IDs、references、Staff/Voice/sequence legality。forward insert 的 extension records 固定为空。

**remove-part-bundle** 先从 current candidate 捕获完整 Part 与所有 top-level Part-owned extension 的 cloned values/indices，再移除 aggregate 和匹配 extension。最后 Part 的拒绝由 final semantic.part-required 给出。inverse 将 aggregate 插回 previous PartAnchor，并按原 extension index 恢复混排。

**move-part** 只重排 ScoreDocument.parts，ExtensionBlock array 深度不变。**replace-part-name** 不 trim，只对 exact string equality no-op。**replace-part-instrument** 存储完整 replacement value，遵守 semantic/profile split。

### 5.2 Staff family

**insert-staff** 只将 decoded StaffDefinition 插入目标 Part.staves；不生成 Voice，不替换 Voice.defaultStaffId，也不修改 Event assignment。

**remove-staff** 在删除前扫描同一 Part 的所有 contents/voices/events：任一 Voice.defaultStaffId 或显式 Event staffId 匹配即返回 command.reference-conflict。该失败不携带 raw reference list 或 internal path。删除后让 existing semantic pass 处理最后 Staff 的 semantic.staff-required。

**move-staff** 使用 Part owner-local anchor；cross-Part anchor 可区分为 command.anchor-wrong-owner。**replace-staff-definition** 是完整 lineCount/defaultClef replacement，exact equality no-op，非法 line count 通过 final semantic atomic rollback。

### 5.3 Voice and Event family

**insert-voice** 定位 target Part + payload.measureId 的 PartMeasureContent，按 VoiceAnchor 进入该 content 的 voices。final semantics 对 global unique ID、owner Part 的 Staff reference、sequence legality 负责；无关 contents 不得改变。

**remove-voice** 移除 target Voice 及它拥有的 Event/Note 子树，保持 sibling Voice、other contents 与 extensions。最终 Voice 的删除得到 semantic.voice-required；inverse 恢复原 voice value、position 和 descendant order。

**move-voice** 限制在单一 PartMeasureContent；cross-Measure 或 cross-Part anchor 是 command.anchor-wrong-owner。**replace-voice-default-staff** 只接受 owner Part 的 Staff，exact equality no-op。**replace-voice-sequence-start** 使用 canonical Fraction，完整 sequence semantics 与 support split。**replace-event-staff-assignment** 的 inherit-default 删除 explicit field；staff assignment 必须属于 event 所在 Part；effective assignment 不变时 no-op，不移动 Event、不改 Voice default 或 sibling。

## 6. Effect、inverse 与原子性

CoreEffect 只能追加这些 narrow variants：

1. insert-part-bundle
2. remove-part-bundle
3. move-part
4. replace-part-name
5. replace-part-instrument
6. insert-staff
7. remove-staff
8. move-staff
9. replace-staff-definition
10. insert-voice
11. remove-voice
12. move-voice
13. replace-voice-default-staff
14. replace-voice-sequence-start
15. replace-event-staff-assignment

Part removal 使用 private IndexedExtensionBlock 记录 index/value；其他 effects 仅存 owner ID、target ID、anchor 或完整 replacement values。每个 effect set 的 applyCoreEffectSet 保持 CVN-1/CVN-3 已验收模型：内部 structuredClone 一次、current candidate preflight、derive inverse、apply、把 inverse prepend、任一失败放弃 candidate、成功 deep-freeze candidate 和 inverse set。不得注入 cloneDocument callback，不得公开 snapshot，不得用 generic path patch。

## 7. Affected addresses、history 与 events

使用已有 ScoreAddress kinds，按 kind/ID 去重且保留首次出现顺序：

| Command | canonical affected order |
|---|---|
| Part insert | document、inserted Part、its Staffs in order、then Voices/Events/Notes by global Measure order and stored descendant order |
| Part remove | removed Part、document、removed Staffs、then removed descendants by global Measure order and stored descendant order |
| Part move | moved Part、document |
| Part set-name/instrument | target Part |
| Staff insert | owner Part、inserted Staff |
| Staff remove/move | target Staff、owner Part |
| Staff set-definition | target Staff |
| Voice insert | owner Part、inserted Voice、inserted Events/Notes in order |
| Voice remove | target Voice、owner Part、removed Events/Notes in order |
| Voice move | target Voice、owner Part |
| Voice default-staff/sequence-start | target Voice |
| Event staff-assignment | target Event |

Part aggregate traversal 依据 global Measure order，而非 semantic-valid 但预先打乱的 measureContents stored order。history entry 记录的 affected facts 被 undo/redo 原样复用；同一 semantic envelope 的 replay 生成相同顺序。每个 committed command 一个 committed event；no-op/reject 零 event；checkpoint/dirty/redo 行为复用 transaction spine。

## 8. Catalog、Registry、failure/report 接入

catalog.ts 和 contracts.ts 追加 15 个 typed variants；execution-assembly.ts 将它们纳入 bounded-ID set 与 catalog/adapter parity；registry/builtins.ts 追加精确 15 个 descriptor/title keys。reports/strict-codec.ts 将 command.reference-conflict 放入封闭 failure decoder；reports/adapters.ts 只有在 TypeScript exhaustive mapping 要求时新增可见分支。index.ts 只可处理 type-export arrangement，不可增加 runtime export。

未知 command、wrong version、target mismatch、resource limits、anchor 与 semantic failures 复用既有 failure/result pipeline。reference-conflict 的 Issue details 仅含 allowlisted code/limit-style facts，不含 live reference identifiers、paths、payload 或 effect/index data。

## 9. Fixture 与测试设计

CVN-4 fixture 必须拥有至少三个有序 Parts、三个 global Measures、单 Staff 与多 Staff Part、两个不同 contents 的 Voice、inherit/explicit Event staff assignment、Notes 与 Rest events、score/Part mixed extensions、两个被删除 Part-owned blocks 分隔在其他 blocks 之间、supported/unsupported variants、semantic-valid pre-shuffled measureContents 与 deterministic IDs。

新增 fixture：cvn-4-score.ts、cvn-4-command-helpers.ts、cvn-4-surface.ts、cvn-4-surface.expected.json。新增 suites：part-lifecycle、staff-lifecycle、voice-lifecycle、strict-input、transaction-integration、public-surface。已有 command-internals、registry-contracts、kernel-failure-adapters、public-api、report/Issue、gateway、forbidden-dependency、CVN-3 surface projection 与 characterization 只作最小增量修改。

每个命令都至少覆盖 commit、defined no-op、invalid/extra/wrong target、missing target、applicable anchors、semantic/reference reject、encoded before/after、undo/redo/replay、checkpoint/dirty/redo/event、affected addresses、hostile input、64/65 与 property limits、caller mutation、extensions、failure-state equality 和 authorized gateway parity/denial。

## 10. 兼容性、性能与回滚

没有 schema migration；CVN-4 仅操作已存在的 brilliant-score-1 structures。owner lookup 只在必要域进行，Part descendants 以 global Measure order 一次式遍历；不引入全局 cache、二次 transaction owner 或 runtime registration。删除/逆操作值须 clone，避免 caller alias 与 candidate alias。

回滚顺序：Voice/Event properties、Voice structural、Staff、Part、private resolver/effect seams、fixtures/tests、CVN-4 surface collector。只有在 CVN-4 完全移除时，才恢复 CVN-3 collector 的完整 surface 采样；CVN-3 accepted source/schema/expected fixtures 始终不变。

## 11. 停止条件

一旦需要新 persisted field/schema、public target/address、generic patch、whole-document replacement、alias/第十六个命令、remove cascade/reassign、Part-embedded extension、第二 state owner、module/Guitar/product dependency 或接受的 CVN-3 观测行为变化，即停止并提交父级设计复审，而不是在私有实现中隐式扩张合同。
