# Guitar Core Loop 实现计划

## 当前状态

- 阶段：Core K1-1 代码与文档评审。
- 当前实现子任务：`07-13-k1-1-core-foundation`，状态 `review`。
- K1-1 决策源：`07-13-k1-1-foundation-replanning/design.md`。
- 活动代码契约：`.trellis/spec/core-kernel/`。
- K1-1 代码、测试和本轮文档收口仍是工作区未提交变更；当前 Git `HEAD` 仍代表旧基线。
- 未经用户评审确认，不创建提交，不启动 Guitar Domain 或 K1-2。

旧的“一次实现全部九类机制”计划已归档至 `.trellis/archive/core-kernel/2026-06-29-retired-product-implementation-plan.md`。它只能用于追溯，不能作为当前执行清单。

## 执行原则

- 每次只实现一个经批准的大型内核能力。
- 先读取对应任务与稳定规范，再写代码；不得从旧产品父任务反推已退役字段。
- 每轮说明该能力为什么存在、包含哪些子功能、每个新增/修改文件承担什么职责。
- Core 保持纯 TypeScript，不引入 UI、Tauri、VexFlow、Web Audio、物理文件 IO 或第三方插件运行时。
- 通用 schema 与产品支持面分离；合法但暂不支持的数据由 profile 报告，不通过缩窄 schema 处理。
- 不为未发布的旧 tick/slot 草案建立兼容层；发现真实外部消费者时先停止并规划迁移。

## 当前 Gate：K1-1 Core Foundation

已实现并进入评审的范围：

- [x] `ScoreDocument = metadata + measureDefinitions + parts + extensions`。
- [x] `Part -> Staff -> 每小节 Voice -> ordered Event -> Note`。
- [x] 规范化 `Fraction`、`NoteValue` 与安全整数精确运算。
- [x] WrittenPitch、Part transposition 与派生 SoundingPitch。
- [x] score/part-owned `ExtensionBlock` 与未知 JsonValue 语义保真。
- [x] strict `unknown -> decode`。
- [x] Core semantic validation。
- [x] `ScoreFeatureProfile` 与 K1 支持面验证。
- [x] 稳定 diagnostics、测试 fixture 与公共导出边界测试。
- [x] 活动稳定规范移除旧契约并建立明确 archive。
- [x] 产品上层文档同步至 `brilliant-score-1`。
- [ ] 用户完成代码与文档评审。
- [ ] 用户确认一次性提交计划后形成正式 Git 基线。

K1-1 不包含命令/history、snapshot/events、registry/capability、通用 report/migration、物理 `.bgp` IO 或 GuitarExtension。

## 后续 Gate 顺序

### Block 2：Guitar Domain

在独立任务中定义 Part-owned `GuitarExtension`：

- namespace 与 schemaVersion。
- 标准 6 弦实际调弦。
- noteId 到 string/fret 的演奏位置映射。
- 吉他技巧 payload、引用规则、codec、semantic validation 与 `guitar.*` diagnostics。
- 未知/新版 Guitar payload 的降级与迁移策略。

该块不能把 guitar 字段塞回 Core Note/Event/metadata，也不能假设旧 `TechniqueData` registry 已存在。

### K1-2：Commands / Transactions / History

必须先创建并审核刷新计划。至少重新确认：

- 命令目标使用 measure/part/staff/voice/event/note 稳定 ID。
- Core 命令处理通用谱面事实；吉他弦品和技巧命令由 Guitar Domain 提供并转换为受控扩展变更。
- payload validation、事务隔离、内部 delta、细粒度 undo/redo 与 replay。
- 严禁公开 patch、JSON path、脚本式字段替换或可变整文档覆盖。

旧 `RhythmSlot` 地址和 Core `addTechnique/removeTechnique` 命令不得直接沿用。

### K1-3：Snapshot / Selectors / Events

必须基于完成后的 K1-2 确认文档版本、事务边界、不可变 snapshot、selector 输入输出、提交后事件、异常隔离和重入规则。事件不得泄漏可变 `ScoreDocument` 或领域私有 payload 解释权。

### K1-4：Registry / Capability

必须重新判断每种 contribution 是否真的需要进入 Core。`ExtensionBlock` 是持久化信封，不是 registry contribution；吉他技巧不是默认 Core technique-definition contribution。不得为了兼容旧测试草案重新引入 `test.*` 技巧注册。

### K1-5：Errors / Reports / Migration

必须复用 K1-1 已发布的 `decode.*`、`semantic.*`、`unsupported.*` 诊断兼容面，再设计 operation errors、report shells 与 migration。外层报告不得吞掉具体诊断 code；物理 IO 仍属于外部模块。

### K1-6：Integration Gate

在前述分块分别评审后，验证通用 score foundation、Guitar Domain、命令、读模型、事件、registry 与报告能形成一条可回归链路；不得使用旧 tick/slot fixture 作为基准。

## 产品闭环后续顺序

Core/Guitar 基础通过后，再分别规划并实现：

1. Tauri/React 桌面壳与编辑会话。
2. 六线谱输入和五线谱/六线谱渲染适配。
3. Playback adapter，将 Fraction/NoteValue 派生为播放 tick/毫秒。
4. `.bgp` 物理包、原子保存、打开与恢复。
5. PDF/PNG 导出与 Guitar Pro 导入。

上述模块不得反向把 UI、播放、布局或物理文件状态写入 `ScoreDocument`。

## 每轮质量门禁

```powershell
npm run typecheck
npm test
git diff --check
python ./.trellis/scripts/task.py validate <task-dir>
```

完成声明前还必须复查活动文档中不存在把退役模型当作现行契约的引用，并向用户逐文件说明变更职责。
