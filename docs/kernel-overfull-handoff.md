# 内核交接：允许超拍谱面并报告规则警告（已完成）

产品规则见 [谱面编辑规则](score-editing-rules-proposal.md)。本交接记录已经落地的内核职责和验收条件；工作台操作、视觉与宿主接线由前端负责。内核与工作台合同的最终状态见 [超拍规则警告内核合同](kernel-overfull-rule-warning-contract.md)、[延迟声部起点规则警告合同](kernel-delayed-start-rule-warning-contract.md) 和 [内核宽容编辑与提示分级审计](kernel-tolerant-editing-policy.md)。

## 完成状态（2026-09-17）

- 内核使用独立的 `rule.sequence-exceeds-measure` 报告超拍，不再把它作为阻断性语义错误。
- 当声部起点晚于小节标称终点时，内核使用独立的 `rule.sequence-start-after-measure` 报告延迟起点；若该起点同时造成尾部超拍，优先报告起点警告。
- 创建、导入、事务提交、读取、撤销、重做、保存和重开均允许结构有效的超拍谱面。
- 警告绑定当前文档 ID、版本、小节和声部，并从当前文档重新推导。
- 浏览器宿主和 Rust 桌面宿主均已接入；工作台可以渲染、选择、继续编辑并保存超拍内容。
- 满拍和超拍小节的尾部可由鼠标与键盘显式定位；提示保持轻量，并可在应用设置中关闭。

## 用户可观察的目标

4/4 小节已有四个四分音符时，用户可在该小节末尾再加一个四分音符。该小节的拍号依旧是 4/4，五个音符与各自 ID、顺序、音高和时值都保留；内核提交这次原子事务并返回新文档版本。该小节出现非阻断的“超出 1 拍”规则警告。用户可继续编辑、撤销／重做、保存原生文件并重新打开；删除中间一拍并收拢后续音符后，警告消失。超拍可以持续存在，不是只在单次事务里的临时状态。

超拍违反当前拍号，必须向用户报告，但不构成文档结构损坏。零或无效时值、无效音高、重复 ID、缺失引用、不完整事务等仍拒绝；过期版本和锚点是操作冲突，也仍拒绝，不能误报成谱面结构错误。

## 实施时确认的内核边界

- `crates/brilliant-score-foundation/src/assessment.rs` 对超拍与延迟起点不再生成阻断性时间诊断；`SemanticReportV1.ok` 继续表示没有阻断性语义诊断。
- `crates/brilliant-score-foundation/src/rule_warnings.rs` 从当前文档推导 `SequenceExceedsMeasure` 与 `SequenceStartAfterMeasure`，通过规则警告页返回精确标称长度、实际值和超出量。
- `crates/brilliant-kernel-runtime/src/time_validation.rs` 的最终增量校验保留时值算术溢出等结构性错误，但允许可精确表示的超拍与延迟起点提交。
- 整谱候选验证、准入与功能配置评估在 `crates/brilliant-kernel-runtime/src/candidate/adoption.rs`、`runtime/integrated/engine.rs` 和 `crates/brilliant-score-foundation/src/feature_profile.rs` 等路径依赖 `report.ok`。只改增量校验会导致新建的超拍文档无法打开；只改整谱校验会导致之后无法编辑。
- 当前 `CoreDiagnosticV1` 只有 `code/messageKey/path/details`，没有严重度；直接把超拍放进原有失败诊断列表同时让 `ok=true` 可能破坏现有调用方假设。请提出版本化或兼容的“阻断错误／可接受警告”合同，并检查应用、迁移、编码／解码、历史回放及功能配置评估各入口的一致性。

## 已完成的内核交付范围

1. 给出内核 API 方案：哪些规则是提交前硬性校验，哪些是提交后可查询的谱面警告；说明警告如何关联**文档版本、小节 ID、声部 ID、超出量**，以便 UI 不把旧提示贴到新位置。`semantic.sequence-exceeds-measure` 已迁移为 `rule.sequence-exceeds-measure`；延迟起点使用 `rule.sequence-start-after-measure`。
2. 使同一有效超拍数据在**创建／导入准入、事务提交、读取、撤销／重做、原生编码与重新打开**路径上保持一致。文档格式若已有表达能力，优先不改 `ScoreDocumentV1`、事件 ID、音高或时值结构；不自动变更拍号、不裁剪事件、不暗中移到下一小节。
3. 提供稳定的警告读取／报告机制；每次状态变化后可从当前文档与版本重新推导，满拍后警告消失。警告报告不能使原本的结构性错误被放行，也不能使 `ok`、`Invalid`、`Unsupported` 的旧含义模糊。
4. 写内核级回归：4/4 从四拍到五拍再回四拍；后面已有小节时其数据不变；第五个音可被读取、选择所需的 ID 和位置可由投影获得；撤销、重做和原生文件往返后警告一致；无效时值、重复 ID、缺失引用及版本冲突仍拒绝；整谱与增量路径报告相同结果。

内核交付的是**允许保存且可诊断的文档语义与事务保证**，不是 UI 的自动收拢设置、键盘操作、SVG 绘制或播放策略。上述界面职责已通过应用层和工作台接线实现，播放与外部格式导出的超拍策略仍留给对应功能设计。

## 工作台接线结果

浏览器和桌面宿主已移除业务容量硬拒绝，并通过统一内核合同读取规则警告。VexFlow 使用宽容 Voice，页面布局、末尾锚点、选中命中、轻量警告、原生保存和重开流程均有回归覆盖。工作台不会自动改拍号、裁剪音符或把事件移入下一小节。
