# 超拍规则警告内核合同

状态：已完成内核实现与专项回归，工作台接线另行实施。

## 决策

超拍是可保存、可撤销、可重做的谱面状态，不属于文档结构损坏。内核继续拒绝无效时值、时间运算溢出、无效音高、重复 ID、缺失引用、无效事务和版本冲突。

现有 `SemanticReportV1`、`CoreDiagnosticV1`、`ScoreSupportV1` 的语义保持不变：其中出现的诊断仍表示阻断错误或功能配置结果。历史枚举值 `semantic.sequence-exceeds-measure` 为兼容旧协议而保留，但新内核不再把它发布为阻断诊断。

超拍使用独立代码：

```text
rule.sequence-exceeds-measure
```

这样旧调用方不会遇到 `ok=true` 但同时带有失败诊断的歧义。

## 警告报告

每条警告包含：

- `warningVersion`
- `code` 与 `messageKey`
- `partId`、`measureId`、`voiceId`
- `nominalDuration`：拍号或弱起定义的标称容量
- `actualDuration`：声部起点加全部事件时值后的精确终点
- `overflow`：`actualDuration - nominalDuration` 的规范化有理数

警告按文档顺序稳定生成，每个超拍声部一条。报告不写入 `ScoreDocumentV1`，而是从当前文档重新推导，所以修复超拍后自动消失，保存和重新打开后也不会出现过期标记。

## 读取接口

Rust 会话提供：

```text
KernelSession::read_rule_warning_page(
  document_id,
  document_version,
  offset,
  limit,
)
```

集成运行时提供私有协议操作：

```json
{
  "operation": "readRuleWarningPage",
  "reportVersion": 1,
  "documentId": "score-1",
  "documentVersion": 3,
  "offset": 0,
  "limit": 128
}
```

读取必须绑定当前文档 ID 和版本。旧版本返回 `report.stale-version`，错误文档返回 `report.document-mismatch`。页面大小上限为 4096，报告可分页读取，不需要在内核中长期保留完整警告数组。

## 一致性规则

- 创建和导入准入接受结构有效的超拍文档。
- 增量事务允许事件终点超过小节容量，并仍以单个原子历史项提交。
- 撤销、重做和重新建立会话后，警告从对应版本文档重新计算。
- 拍号、事件 ID、事件顺序、音高、时值和小节归属不被自动改写。
- K1 功能配置仍可把非完整小节归类为 `unsupported.sequence-duration`；这是功能配置结果，不阻止内核保存文档。
- `sequence.start` 超出小节、无效分数和时间运算溢出仍属于阻断错误。

## 后续宿主职责

工作台和桌面宿主接入前，不应单独删除现有容量保护。宿主需要在同一交付中完成警告读取、超拍布局、命中与选择、末尾插入锚点以及保存／重开显示，避免出现内核接受数据但界面无法呈现的中间状态。
