# Agent A7.4 有界小节范围读取设计 v0.1

日期：2026-09-18
状态：已实现；未接入自然语言小节引用解析

## 目标

A7.4 增加第一个真正的局部读取能力：`score.read-measure-range`。它按稳定小节 ID 读取一段连续范围，只返回完成当前结构任务所需的最小数据，不构造或传输完整乐谱。

```text
startMeasureId + endMeasureId + maxMeasures
  -> 控制面验证合同与范围预算
  -> Rust Capability Gateway
  -> Application Query Service
  -> Kernel ScoreRange selector
  -> 规范化且有界的 ScoreMeasureRangeV1
```

## 为什么单独建立范围能力

概要、元数据、结构、范围不是同一个读取接口上的可选字段，而是不同成本和不同语义的 Capability。这样做有三个直接收益：

- 模型只看到任务需要的能力，减少误调用和大结果进入上下文；
- 控制面可以针对范围读取执行独立预算，而不是只限制返回字节；
- 内核继续掌握范围顺序、端点存在性和文档版本等权威事实。

这体现了能力面的原则：接口按业务意图分层，但底层可以复用同一套选择器和领域模型。不是每个 Capability 都要复制一套内核实现。

## 合同边界

输入合同：

```text
startMeasureId: 非空稳定 ID
endMeasureId: 非空稳定 ID
maxMeasures: 1..32
```

输出只包含：

```text
documentId
documentVersion
normalized startMeasureId / endMeasureId
measureCount
measureId + meter + pickupDuration
```

明确不包含声部、声部内容、事件、音符、渲染数据或完整 protobuf。后续读取内容时，应增加 `score.read-part-measure-range` 或事件级能力，而不是扩张本合同。

## 控制面如何约束它

Descriptor 声明 `scopeLimit: range` 和 `costClass: range`，并通过 `estimateRangeUnits` 把输入中的 `maxMeasures` 转成动态成本。Decision Validator 在任何宿主调用发生前比较：

```text
estimated range units <= run rangeBudget
```

超限动作以 `range-budget-exceeded` 被拒绝。宿主仍会检查实际返回数量不超过 `maxMeasures`，因此模型声明的预算和真实结果形成双重边界。

## 内核与 Application 层分工

Application Service 不读取完整 `ScoreSession`。它调用内核现有的 `SelectorRequestV1::ScoreRange`，由内核完成：

- 判断端点是否存在；
- 按文档顺序规范化反向范围；
- 返回范围内的小节定义；
- 绑定同一次选择结果的文档版本。

Application Service 只把内核结果投影成面向产品的 DTO。Capability Gateway 负责输入合同、错误分类和传输结果，不重新实现音乐领域规则。

## 为什么还没有直接接入用户会话

当前能力只接受稳定 ID。用户通常说的是“第 3 到第 8 小节”“当前选中的两小节”或“副歌前四小节”，这些都不是稳定 ID。

如果把自然语言路由直接接进来，模型就会被迫猜测 `measure-3` 是否代表第三小节；导入文档完全可能使用其他 ID，这会造成静默读错。因此下一层必须是独立的 `MeasureReferenceResolver`：

```text
用户引用
  -> 引用类型识别
  -> 结合当前文档版本和选择区解析
  -> 稳定小节 ID 范围
  -> score.read-measure-range
```

路由器负责选择“范围读取”这一能力族，引用解析器负责把人类位置表达转换成权威身份，两者不能混为一个字符串规则。

## 评测

正式基线新增 `score-measure-range.stable-ids`。它验证：

- 只暴露并调用 `score.read-measure-range`；
- 输入范围为 3，小节预算也为 3；
- Capability Port 接受严格输出合同；
- Completion Verifier 记录 `score-1@7` 文档证据；
- 最终回答包含规范化端点和实际数量；
- 全程只发生一次能力调用。

这个 Case 有意从稳定 ID Fixture 开始，不宣称已经覆盖“小节序号到稳定 ID”的自然语言解析。

## 下一阶段

A7.5 设计并实现 `MeasureReferenceResolver`。第一版只处理三种可验证引用：稳定 ID、用户可见小节序号、当前选择区。待解析结果带有文档版本和明确歧义状态后，再把范围读取接入 `AgentIntentRouter` 与 `AgentAssistantSession`。
