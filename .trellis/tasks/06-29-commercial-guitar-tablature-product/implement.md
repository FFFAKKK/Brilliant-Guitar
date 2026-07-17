# Guitar Core Loop 实现计划

## 当前状态

- 阶段：Core K1-1、K1-2、K1-3 已正式验收并归档；K1-4 独立规划已于 2026-07-17 获批准，生产实现未启动。
- K1-3 验收基线：`7369eeac60fecea66c2c9164c04439625c2d78b0`，typecheck、build、102/102 tests、diff check 与 Trellis 校验通过。
- K1-3 决策源：`.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`。
- 活动代码契约：`.trellis/spec/core-kernel/`。
- 当前集成分支仍名为 `codex/k1-2-commands-transactions-history`，它只承载 Gate 收口，不是 K1-4 分支。启动 K1-4 时必须从当前已收口基线新建 `codex/k1-4-*` 分支。
- K1-4 的 PRD/design/implement 已审核通过；仍须先提交文档收口、创建独立 K1-4 分支并显式启动 Trellis 任务，之后才能写生产代码。

旧的“一次实现全部九类机制”计划已归档至 `.trellis/archive/core-kernel/2026-06-29-retired-product-implementation-plan.md`。它只能用于追溯，不能作为当前执行清单。

## 执行原则

- 每次只实现一个经批准的大型内核能力。
- 先读取对应任务与稳定规范，再写代码；不得从旧产品父任务反推已退役字段。
- 每轮说明该能力为什么存在、包含哪些子功能、每个新增/修改文件承担什么职责。
- Core 保持纯 TypeScript，不引入 UI、Tauri、VexFlow、Web Audio、物理文件 IO 或第三方插件运行时。
- 通用 schema 与产品支持面分离；合法但暂不支持的数据由 profile 报告，不通过缩窄 schema 处理。
- 不为未发布的旧 tick/slot 草案建立兼容层；发现真实外部消费者时先停止并规划迁移。

## 已完成 Gate：K1-1 Core Foundation

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
- [x] 按“文档合同与归档”“Core 候选实现”“测试与验收”形成三个可审查提交边界。
- [x] 用户完成代码与文档评审。
- [x] P1 修复 fast-forward 合入 K1-1 原分支并形成正式分支基线。
- [x] 合入后重新运行 typecheck、build、49/49 tests 与 diff check。

K1-1 不包含命令/history、snapshot/events、registry/capability、通用 report/migration、物理 `.bgp` IO 或 GuitarExtension。

## Core Gate 状态与后续顺序

### Block 2：Guitar Domain

在独立任务中定义 Part-owned `GuitarExtension`：

- namespace 与 schemaVersion。
- 标准 6 弦实际调弦。
- noteId 到 string/fret 的演奏位置映射。
- 吉他技巧 payload、引用规则、codec、semantic validation 与 `guitar.*` diagnostics。
- 未知/新版 Guitar payload 的降级与迁移策略。

该块不能把 guitar 字段塞回 Core Note/Event/metadata，也不能假设旧 `TechniqueData` registry 已存在。

### 已完成：K1-2 Commands / Transactions / History

K1-2 已独立验收并归档；其稳定合同包括：

- 命令目标使用 measure/part/staff/voice/event/note 稳定 ID。
- K1-2 只实现六种通用 Core 谱面命令；吉他弦品、技巧命令和扩展变更不在该已验收范围内。
- payload validation、事务隔离、内部 delta、细粒度 undo/redo 与 replay。
- 严禁公开 patch、JSON path、脚本式字段替换或可变整文档覆盖。

旧 `RhythmSlot` 地址和 Core `addTechnique/removeTechnique` 命令未被沿用。

### 已完成：K1-3 Snapshot / Selectors / Events

K1-3 已在 `7369eeac60fecea66c2c9164c04439625c2d78b0` 正式验收并归档。已固定文档版本、不可变 snapshot、六个纯 selector、精确 dirty checkpoint、两种提交后事件、同步/异步 handler 隔离和重入规则；事件不泄漏可变 `ScoreDocument` 或领域私有 payload 解释权。

### K1-4：Registry / Capability

> **规划已批准，生产实现未启动。** 权威执行源为 `.trellis/tasks/07-16-k1-4-registry-capability-startup-registration/implement.md`。只有完成文档提交、切换 `codex/k1-4-registry-capability-startup-registration` 并显式 task start 后，操作者才能按其 TDD 步骤实施。

批准范围固定为启动期原子 frozen Registry、command/selector 两类既有 adapter、七个 capability、模块 gateway、最小 summary 和 K1-4 本地失败合同；无 Registry version/event、module attribution、其他 contribution kind、第三方 runtime、Guitar Domain 或 K1-5 report。

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
