# CVN-4 Part Staff Voice Lifecycle

> **规划状态：** 已建立正式 Trellis 子任务与隔离分支；本文件已基于已归档验收的 CVN-3 收敛。它只授权规划工件，不授权生产源码或测试实现。后续必须经用户审阅并获得单独的执行指令，才可运行 task.py start 或修改生产/测试代码。

## 1. 目标与产品价值

CVN-4 在既有 brilliant-score-1 领域模型和已验收的 CVN-1 命令事务脊柱、CVN-3 文档工厂与 Measure 生命周期之上，补齐通用 Core 层的 Part、Staff、Voice 与 Event staff-assignment 生命周期编辑能力。交付物是固定的十五个可回放命令，而不是通用补丁、数组索引接口或运行时扩展机制。

完成后，产品可以以稳定 ID 和 owner-local 锚点编辑乐谱层级，同时保留严格未知输入边界、候选态原子提交、精确逆操作、undo/redo/replay、checkpoint/dirty、确定性事件与 affected-address、扩展块保留，以及语义有效但 profile 不支持时仍提交的既有分层。

## 2. 权威、依赖与已确认基线

权威顺序：

1. 已独立验收并归档的 CVN-1 与 CVN-3 可观察行为；
2. 父任务的 feature-contract-matrix.md，特别是 CVN-FC-010、011、030、031、041、060 至 070、100 至 102、120、121、140、142；
3. 父任务 PRD 的 CVN-D006 至 CVN-D009 及 CVN-R004；
4. 当前 Core 规格；
5. 本正式 PRD、design.md 与 implement.md；
6. 父任务中的 CVN-4 条件预规划与当前层级证据；
7. 历史归档。

| 记录 | 值 | 用途 |
|---|---|---|
| CVN-3 source/test | d9500f5a8ac285071586ba8eda380370eafd022f | 受验收的功能基线 |
| CVN-3 acceptance | 3691d93e934c4fe44d3d34e313acd257deae154c | 独立复审通过记录 |
| CVN-3 archive | 7b727af0a55e22f878e1d7a744f0426deef37cf2 | 归档与父依赖推进记录 |
| CVN-3 acceptance session | 18d7e4541e1f1247ba5c98976af9a4131955e7e2 | 验收会话记录 |
| CVN-4 planning base | 4e5612b0a0e586184a74e951e5b3a2394f8cc5c0 | 本分支的干净规划基线 |

CVN-4 依赖已验收/归档的 CVN-1 和 CVN-3；不依赖 GD-0、CVN-2、官方模块运行时或 Guitar。CVN-5 会消费本任务，因此本任务必须独立定义可组合但不提前批处理的单命令语义。

| 父合同 | 本任务要求 | 验收重点 |
|---|---|---|
| CVN-FC-010 | R003、R018 | bounded unknown capture 与资源边界 |
| CVN-FC-011 | R016、R017 | no-op、原子候选、历史、重放 |
| CVN-FC-030/031 | R002、R011 | 稳定锚点与 owner-local 解析 |
| CVN-FC-041 | R002、R018 | 固定命令目录、版本与目标 |
| CVN-FC-060 至 063 | R004 至 R014 | Part/Staff/Voice/Event 语义 |
| CVN-FC-070 | R005、R013、R014 | 所有权级联与引用冲突 |
| CVN-FC-100 至 102 | R010、R015 | 封闭失败联合、优先级与隐私 |
| CVN-FC-120/121 | R016 | 语义与 profile support 分离 |
| CVN-FC-140/142 | R017 至 R020 | 命令矩阵、兼容性与质量门禁 |

## 3. 固定完成面

| 总目录序号 | ID | 目标 | 负载 |
|---:|---|---|---|
| 11 | core.part.insert | document | PartAnchor + complete Part |
| 12 | core.part.remove | part | Record<string, never> |
| 13 | core.part.move | part | PartAnchor |
| 14 | core.part.set-name | part | exact name |
| 15 | core.part.set-instrument | part | complete InstrumentDescriptor |
| 16 | core.staff.insert | part | StaffAnchor + StaffDefinition |
| 17 | core.staff.remove | staff | Record<string, never> |
| 18 | core.staff.move | staff | StaffAnchor |
| 19 | core.staff.set-definition | staff | lineCount + defaultClef |
| 20 | core.voice.insert | part | measureId + VoiceAnchor + complete Voice |
| 21 | core.voice.remove | voice | Record<string, never> |
| 22 | core.voice.move | voice | VoiceAnchor |
| 23 | core.voice.set-default-staff | voice | staffId |
| 24 | core.voice.set-sequence-start | voice | Fraction start |
| 25 | core.event.set-staff-assignment | event | inherit-default or staffId |

十五个 Registry title key 同样固定：

| Command ID | Title key |
|---|---|
| core.part.insert | core.command.insert-part.title |
| core.part.remove | core.command.remove-part.title |
| core.part.move | core.command.move-part.title |
| core.part.set-name | core.command.set-part-name.title |
| core.part.set-instrument | core.command.set-part-instrument.title |
| core.staff.insert | core.command.insert-staff.title |
| core.staff.remove | core.command.remove-staff.title |
| core.staff.move | core.command.move-staff.title |
| core.staff.set-definition | core.command.set-staff-definition.title |
| core.voice.insert | core.command.insert-voice.title |
| core.voice.remove | core.command.remove-voice.title |
| core.voice.move | core.command.move-voice.title |
| core.voice.set-default-staff | core.command.set-voice-default-staff.title |
| core.voice.set-sequence-start | core.command.set-voice-sequence-start.title |
| core.event.set-staff-assignment | core.command.set-event-staff-assignment.title |

全部十五个 envelope 固定为 commandVersion 1、inputBoundary vnext-bounded-v1，并经已有 submit(unknown) 入口执行。不得添加别名、generic setter、property bag、public array index、before anchor、cascade/reassign flag、目标种类、地址种类、public submit 方法或 public runtime value。

完成后的根 runtime 导出严格为 49；Core catalog 严格为 25；Registry command descriptor 严格为 25；持久化 schema 保持 brilliant-score-1。新增的命令与锚点 TypeScript 类型可沿已有 contracts 导出链增长，private effect、ownership record、decoder 和 helper 不得成为 root runtime 导出。

## 4. 要求

### CVN4-R001 — 已验收基线

正式执行只能从已独立验收并归档的 CVN-3 开始；任务记录必须保留 source/test、acceptance、archive 与 activation 基线提交，并且激活前工作树干净。

### CVN4-R002 — 固定目录与封装

只能按第 3 节的精确顺序追加十五个 ID、版本、目标、锚点与 payload。移除命令使用精确空对象；所有 Registry descriptor 使用 sourceModuleId core.commands、apiVersion 1、requiredCapabilities 为 command:execute，以及固定 title key。

### CVN4-R003 — 单一入口和严格输入

全部十五个命令通过既有 submit(unknown) 端口和 descriptor-first bounded VNext capture。未读、getter、Proxy、accessor、symbol、sparse、cycle、extra field、非安全整数、深度 65 或属性数 1,048,577 必须稳定返回封闭失败，不调用调用方代码且不抛出。

### CVN4-R004 — Part 插入

Part insert 接收 complete Part，以 global Measure 顺序校正该 Part 的 complete measureContents coverage；所有后代 ID 必须全局唯一，引用必须可语义验证，且不得凭空引入 Part-owned extension。

### CVN4-R005 — Part 删除与所有权

Part remove 必须原子移除 Part aggregate，包括其 Staff、所有 Measure content 内的 Voice/Event/Note 后代，以及全部 top-level Part-owned ExtensionBlock；不得删除 score-owned 或其他 Part-owned extension。

### CVN4-R006 — Part 删除精确逆操作

Part remove 的 inverse 从当前候选态派生，必须恢复 Part 值、所有后代和每个 Part-owned ExtensionBlock 的原始混排位置与 payload。扩展移除按降序 index，inverse 重插按升序 index。

### CVN4-R007 — Part 移动

Part move 只改变 ScoreDocument.parts 的 owner-local 顺序；不得重排 extensions。原位置等价移动为 no-op，move 先从原列表移除 target，再在剩余列表中解析 anchor。

### CVN4-R008 — Part 属性替换

set-name 保留精确字符串，不 trim；set-instrument 以完整 InstrumentDescriptor 替换。两者在请求状态与当前状态完全相等时为 no-op，并遵守语义拒绝与 profile-unsupported commit 分层。

### CVN4-R009 — Staff 插入

Staff insert 仅将 StaffDefinition 插入目标 Part 的 staves；不得隐式创建 Voice、不得改变任何默认 Staff 或 Event assignment。

### CVN4-R010 — Staff 删除引用冲突

若同一 Part 内任意 Voice.defaultStaffId 或任意显式 Event staffId 引用目标 Staff，Staff remove 必须以 command.reference-conflict 拒绝，不得提供 cascade 或 reassign flag。只有通过显式 Voice/Event 命令解除引用后，删除才可提交。

### CVN4-R011 — owner-local Staff/Voice 锚点

Staff move 和 Voice move 使用稳定 ID、owner-local anchor。全局不存在为 command.anchor-not-found；存在于其他 Part、Measure content 或 owner 下为 command.anchor-wrong-owner；target 自锚为 command.anchor-self-reference。

### CVN4-R012 — Voice 插入定位

Voice insert 的 target 是 Part，并由 payload.measureId 选择该 Part 唯一的 PartMeasureContent。不存在的 global Measure 为 command.target-not-found；global Measure 存在但接受的 Part 缺少 content 是内部一致性故障而非自由扫描替代方案。

### CVN4-R013 — Voice 删除与后代

Voice remove 级联拥有的 Event/Note 后代，保留 sibling Voice、unrelated content 和 extensions；inverse 恢复原始 order 与值。删除最终 Voice 的结果由现有 semantic.voice-required 诊断决定。

### CVN4-R014 — Staff 重分配边界

Staff assignment 只能由 explicit Voice default-staff 命令、explicit Event assignment 命令或未来 CVN-5 batch 组合完成；Staff remove 不得自动修复引用。

### CVN4-R015 — 最后实体与失败优先级

删除最后一个 Part、Staff 或 Voice 必须经过最终语义校验，分别出现 semantic.part-required、semantic.staff-required 或 semantic.voice-required。失败优先级固定为可用性（以后整合时）、envelope、version、ID、target kind、payload/resource、target/owner/anchor、reference/effect、final semantic、profile/capacity/internal。

### CVN4-R016 — support 分层

语义有效但 profile 不支持的 candidate 必须 committed，并返回 support.status === unsupported。不得把支持限制错误映射为 semantic-invalid；该规则覆盖 instrument、Staff/Voice insert、sequence start 等适用路径。

### CVN4-R017 — 候选 effect 与事务事实

每个 private effect 在完整 effect set 中仅克隆源 document 一次，对当前 candidate preflight、从当前 candidate 派生 inverse、应用并将 inverse 前置。失败丢弃 candidate。成功后冻结 candidate/inverse；不得存储整份 ScoreDocument snapshot，也不得公开 effect/index。

### CVN4-R018 — 公共面和报告闭合

root runtime exports 固定 49，catalog/Registry 固定 25/25。command.reference-conflict 必须进入 public failure union、strict report decoder、Issue 映射与 exhaustive fixtures，且不得包含原始引用列表或私有路径。

### CVN4-R019 — 已验收行为冻结

CVN-1 characterization expected fixture 与 CVN-3 surface expected JSON 必须逐字节不变。CVN-3 surface collector 只能投影其冻结的 49/10/10 子集；CVN-4 使用独立 49/25/25 fixture。

### CVN4-R020 — 明确排除

不改变 persisted schema、domain/address model、factory、command bus/runtime/replay、events/read/migration，也不涉及 Guitar、module runtime、runtime registration、range、batch、UI、render、audio、IO 或 package/build 配置。任何超出预期 file surface 的需要必须先记录合同理由并回到父级评审。

## 5. 稳定失败与状态保持

所有 rejection 必须保持 encoded document、version、undo/redo depth 与 entries、checkpoint、dirty 状态和 event trace 与调用前深度相等。稳定失败分类包括：

- malformed/extra/hostile input：command.invalid-envelope；
- commandVersion 非 1：command.unsupported-version；
- 未知 ID：command.unknown-id；
- target kind 不匹配：command.target-mismatch；
- 深度/属性限额：command.resource-limit-exceeded，分别带 input-depth 或 input-properties、限制与实际值；
- 缺少 target、anchor、错误 owner、自锚、live reference：固定的 target/anchor/reference 失败；
- duplicate ID、coverage/reference/sequence/instrument/definition 语义问题：command.semantic-invalid 加既有排序 diagnostics；
- 合法请求与当前状态相同：no-op；
- 语义有效但 profile 不支持：committed 加 unsupported support。

## 6. 明确范围外与停止条件

以下任一情况不是本任务的实现选择，而是返回父级评审的停止条件：新增 schema/version/field、public target/address、十六个命令或别名、remove cascade/reassign flag、Part 内嵌 extension、whole-document replacement/generic patch/public index、第二个事务/history/replay/event owner、runtime registration/module integration、Guitar/product/UI/render/audio/IO 依赖，或任何已验收 CVN-3 可观察行为/fixture 改变。

## 7. 验收标准

### 基线、目录与输入

- [x] **CVN4-AC001:** formal task records accepted CVN-3 source/acceptance/archive commits and a clean activation HEAD.
- [x] **CVN4-AC002:** catalog IDs 11–25 exactly match section 3.1 in order, version and target.
- [x] **CVN4-AC003:** Registry contains exact 25 descriptors and the fifteen fixed title keys.
- [x] **CVN4-AC004:** runtime root export allowlist remains exactly 49.
- [x] **CVN4-AC005:** all fifteen commands reject hostile/extra/sparse/cyclic input without invoking caller code.
- [x] **CVN4-AC006:** depth 64/property 1,048,576 accept at the applicable boundary and 65/1,048,577 reject with exact facts.

### Part

- [x] **CVN4-AC007:** Part insert commits exact coverage in global Measure order.
- [x] **CVN4-AC008:** Part insert coverage/ID/reference failures preserve full state equality.
- [x] **CVN4-AC009:** Part remove deletes the full aggregate and only its owned extensions.
- [x] **CVN4-AC010:** Part remove undo restores exact mixed extension array positions and payload values.
- [x] **CVN4-AC011:** Part move changes only Part order and is no-op when already positioned.
- [x] **CVN4-AC012:** Part name preserves exact whitespace and no-op equality.
- [x] **CVN4-AC013:** instrument replacement proves commit/no-op/semantic rejection/profile unsupported behavior.

### Staff

- [x] **CVN4-AC014:** Staff insert adds no implicit Voice or reference mutation.
- [x] **CVN4-AC015:** Staff remove rejects a default-Staff Voice reference.
- [x] **CVN4-AC016:** Staff remove rejects an explicit Event Staff reference.
- [x] **CVN4-AC017:** after explicit reassignment, Staff removal commits and exact undo restores both commands independently.
- [x] **CVN4-AC018:** removal of final Staff reports exact semantic.staff-required path and full state equality.
- [x] **CVN4-AC019:** Staff move distinguishes missing, wrong-owner and self anchors.
- [x] **CVN4-AC020:** Staff definition replacement proves exact equality and invalid line-count rollback.

### Voice 与 Event

- [x] **CVN4-AC021:** Voice insert resolves target Part/Measure/content and preserves unrelated contents.
- [x] **CVN4-AC022:** Voice insert rejects global ID, Staff reference and sequence violations deterministically.
- [x] **CVN4-AC023:** Voice remove deletes Event/Note descendants and restores exact order/value through undo.
- [x] **CVN4-AC024:** removal of final Voice reports exact semantic.voice-required path.
- [x] **CVN4-AC025:** Voice move distinguishes cross-Measure, cross-Part, missing and self anchors.
- [x] **CVN4-AC026:** Voice default Staff replacement commits/no-ops/rejects wrong ownership exactly.
- [x] **CVN4-AC027:** sequence-start replacement proves canonical Fraction, bounds, no-op and unsupported separation.
- [x] **CVN4-AC028:** Event assignment proves explicit, inherited, no-op and wrong-owner cases.

### 事务、兼容性与质量

- [x] **CVN4-AC029:** each command proves exact encoded before/after, undo, redo and replay equality.
- [x] **CVN4-AC030:** each command proves checkpoint, dirty, redo and committed-event state rules.
- [x] **CVN4-AC031:** affected addresses match the design's canonical order and remain identical through undo/redo history facts.
- [x] **CVN4-AC032:** caller mutation and unknown extension preservation pass every relevant path.
- [x] **CVN4-AC033:** command.reference-conflict mapping is exhaustive, frozen and privacy-safe.
- [x] **CVN4-AC034:** CVN-1 expected characterization and CVN-3 expected surface JSON remain byte-identical.
- [x] **CVN4-AC035:** typecheck, build, focused tests, full tests, Trellis validation, diff checks and independent final review pass.

> **Independent acceptance (2026-08-09):** CVN4-AC001 through CVN4-AC035 are
> accepted at source/test commit
> `788594e670a1608ee2beabddcd217a9d340a5d30`. The initial review found one P2
> canonical-order defect in `core.voice.remove`; the narrow repair and exact
> submit/undo/redo regression were independently reproduced. Final verdict:
> P0/P1/P2 = `0/0/0`, with focused Voice tests `4/4`, full tests `312/312`,
> typecheck, build, Trellis validation, diff checking, and both protected hashes
> passing.

## 8. 规划收敛与执行门禁

所有 repository-answerable 范围问题已经由已验收依赖、父合同、预规划与当前层级证据回答；不存在未解决的产品范围问题。本阶段完成的交付仅为正式 PRD、设计、实施计划与上下文清单。

执行前的唯一门禁是：用户审阅该规划包并明确授权实施。授权后才可记录 activation evidence、运行 task.py start、进入 in_progress 并修改 source/test。没有此授权，本任务保持 planning。
