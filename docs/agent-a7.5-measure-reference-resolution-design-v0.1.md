# Agent A7.5 小节引用解析设计 v0.1

日期：2026-09-18
状态：A7.5a-c 已实现；模型可见组合能力与用户会话接入待实现

## 问题

`score.read-measure-range` 使用稳定小节 ID，但用户使用的是位置语言：

```text
第 3 到第 8 小节
当前选中的小节
从 intro-a 到 ending-z
```

这些表达不是同一种身份。尤其不能把“第 3 小节”直接拼成 `measure-3`，因为导入乐谱的稳定 ID 可以完全不同。

## 核心分层

```text
模型提出 MeasureReference
  -> MeasureReferenceResolver
  -> version-bound stable ID range
  -> score.read-measure-range
```

第一版引用联合只有三种：

- `stable-id-range`：用户或可信上下文已经提供稳定 ID；
- `ordinal-range`：1-based 用户可见小节序号；
- `current-selection`：当前编辑器选择区。

模型只负责表达“用户指的是什么类型的引用”。控制面负责验证，权威索引负责把位置转换成身份，Capability 才负责读取内容。

## 为什么解析器不属于模型

模型可以提出候选引用，但不能决定文档事实。解析必须是确定性的，因为它需要保证：

- 序号来自当前文档顺序；
- 选择区来自同一文档和同一版本；
- 稳定 ID 确实存在；
- 反向范围按权威顺序规范化；
- 解析后的真实数量不超过 Run 的范围预算。

这和数据库查询中的名称解析类似：语言模型可以提出查询意图，但主键、版本和授权必须由应用系统确认。

## A7.5a 已实现的边界

纯 `MeasureReferenceResolver` 接受：

```text
MeasureReference
MeasureIndexSnapshot(documentId, documentVersion, ordered measureIds)
MeasureSelectionSnapshot | null
rangeBudget
```

成功时输出精确的 `ScoreMeasureRangeInputV1`，其中 `maxMeasures` 等于实际解析数量，而不是宽松地沿用最大预算。失败时返回结构化原因，例如：

```text
ordinal-out-of-range
selection-unavailable
selection-stale
measure-not-found
range-budget-exceeded
```

解析器是纯函数，因此可以被评测、恢复流程和未来不同 Provider 共同复用。

## 状态机如何参与

不应为“正在解析引用”增加一个新的顶层 Run 状态。状态机描述的是需要持久化和恢复的生命周期，不是每个函数调用。

- 正常解析：仍处于 `planning` 或 `executing`，只记录活动或事件；
- 选择区缺失且用户必须指定范围：进入 `waiting:user-input`；
- 选择区版本陈旧：刷新权威上下文后重试；
- 预算超限：拒绝候选动作，不调用能力。

这个原则很重要：状态机要覆盖可中断、可等待、可恢复的边界，而不是把所有内部步骤都变成状态。

## A7.5b 组合端口

`MeasureIndexPort` 已定义为控制面内部端口。请求必须携带工作区、预期文档 ID 和预期文档版本，返回值必须是带版本的小节顺序或结构化失败。

`MeasureReferenceReadService` 负责组合：

```text
MeasureIndexPort
  -> MeasureReferenceResolver
  -> score.read-measure-range
  -> identity/result consistency check
```

它会在调用范围能力之前拦截陈旧索引和未解析引用，并在完成后再次检查文档身份、版本、规范化端点和数量。端口抛出的内部异常会被转换为稳定分类，不进入用户回答。

## A7.5c 权威索引适配器

A7.5c 在 Rust `ScoreSessionService` 中维护版本绑定的小节索引。索引不是通过 Agent 查询时重新读取文档，而是在已有完整会话投影路径中顺带生成：

```text
create / import / successful edit / undo / redo
  -> one full session projection
  -> ScoreSessionRead + ScoreMeasureIndexV1
  -> atomically replace SessionEntry.measure_index
```

查询 `score.read-measure-index` 时先通过轻量 `ScoreOverview` Selector 核对当前文档身份、版本和小节数量，再复制缓存中的字符串 ID 数组。它不调用 `KernelSession::read_state()`，因此不会为一次序号解析深克隆完整乐谱。即使出现“内核编辑成功但宿主完整投影失败”的异常窗口，旧缓存也不会被当作当前事实返回；旧请求会得到 `score.measure-index-stale`。

索引输出是：

```text
ScoreMeasureIndexV1
  documentId
  documentVersion
  measureIds
```

该能力只允许 UI/internal caller 调用。它注册在 Rust Gateway 中以复用统一合同、错误分类和宿主传输，但没有加入 `FIRST_PARTY_CAPABILITY_CATALOG`，也没有加入 Agent capability decoder；Rust Gateway 还会拒绝 Agent caller 的直接调用。这是“可被控制面调用”和“向模型暴露工具”之间的明确边界。

TS `ScoreMeasureIndexPort` 把 UI capability 结果适配成 A7.5b 定义的 `MeasureIndexPort`，并稳定地区分不可用、陈旧、确定拒绝和可重试执行失败。

## 下一步架构

下一步增加模型可见的组合能力 `score.read-measures`：它接受 `MeasureReference`，内部完成解析和原子范围读取。底层 `score.read-measure-range` 保持稳定 ID 合同，继续作为可复用原子能力。

## 为什么采用组合能力

让模型先调用“解析引用”，再调用“读取范围”会增加一次模型回合，并把本可确定执行的步骤交还给模型。商业产品更适合让模型调用一个用户语义能力：

```text
score.read-measures(reference)
```

控制面内部组合：

```text
resolve reference -> validate budget/version -> read stable range -> verify completion
```

这样既保留原子能力的复用性，也让模型看到的工具保持少而清晰。
