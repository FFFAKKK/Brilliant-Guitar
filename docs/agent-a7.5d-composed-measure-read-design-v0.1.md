# A7.5d 语义小节读取组合能力

## 目标

向模型只暴露一个面向用户语义的能力：

```text
score.read-measures(reference)
```

模型可以表达三类引用：

```ts
{ reference: { kind: "ordinal-range", startOrdinal: 3, endOrdinal: 8 } }
{ reference: { kind: "stable-id-range", startMeasureId, endMeasureId } }
{ reference: { kind: "current-selection" } }
```

模型不提交文档版本、当前选择区端点或 `maxMeasures`。这些值属于应用的权威运行上下文，不能由模型声明。

## 调用链

```text
Model
  -> score.read-measures(reference)
  -> RunController 注入 invocation context sidecar
  -> MeasureReferenceAgentCapabilityPort
  -> score.read-measure-index       内部能力
  -> MeasureReferenceResolver
  -> 权威 rangeBudget 校验
  -> score.read-measure-range       原子能力
  -> 文档身份、端点和数量校验
  -> 以 score.read-measures 身份返回并持久化
```

Rust 继续提供稳定、最小、可复用的原子读取能力。TypeScript 控制面负责把用户语义转换成原子调用，不把引用解析规则塞进内核。

## 设计原理

### 1. 语义接口和原子接口分层

`score.read-measure-range` 要求调用方已经知道稳定小节 ID，适合应用代码，不适合直接交给模型。

`score.read-measures` 接受用户自然表达中的序号、稳定 ID 或当前选择区，适合模型。它是组合能力，不是新的数据源。

模型工具目录只包含组合能力。内部索引和原子范围读取仍可被控制面复用，但不会增加模型的选择负担。

### 2. Invocation context sidecar

`AgentCapabilityPort.invoke` 除模型工具请求外，还接收由 `RunController` 注入的上下文：

```ts
{
  workspace,
  rangeBudget,
}
```

sidecar 的意义是区分两类数据：

- 模型参数：模型可以提出的意图。
- 权威上下文：应用自己掌握的文档、版本、选择区和预算。

当前选择区的小节 ID 不进入模型上下文。模型只知道 `selectionAvailable`，实际端点只在控制面内使用。

### 3. 预算在解析后执行

序号范围可以初步估算，但稳定 ID 和当前选择区在读取索引前无法知道真实跨度。因此工具描述符不伪造范围估算值。

控制面先解析引用，再用权威顺序计算实际小节数，并在调用原子范围能力前执行 `rangeBudget`。这叫 late authoritative enforcement：校验发生得稍晚，但使用的事实更可靠，而且仍位于副作用之前。

### 4. 外层调用身份不丢失

内部调用可能使用 `score.read-measure-index` 和 `score.read-measure-range`，但 Run 中记录的能力仍是 `score.read-measures`。

这样审计记录回答的是“Agent 为用户执行了什么能力”，内部原子调用只是实现细节。内部结果必须重新投影为外层的 `invocationId`、`capabilityId` 和合同版本。

### 5. 不增加正常状态

引用解析、索引读取和范围读取都是一次 Capability 执行内部的步骤，仍属于 Run 的 `executing` 阶段。把每个内部步骤都升级为顶层状态会让状态机描述实现细节，并增加恢复组合数量。

当前版本把无法解析的引用返回为结构化拒绝。下一阶段可把 `selection-unavailable` 映射为 `waiting:user-input`，但只在确实需要用户补充信息时进入等待状态。

## 已落实

- 新增 `ScoreMeasureReferenceV1` 与 `ScoreReadMeasuresInputV1` 严格合同。
- 新增 `score.read-measures` 模型可见能力。
- 从模型目录移除 `score.read-measure-range`，保留其内部实现与解码器。
- `RunController` 注入工作区和范围预算 sidecar。
- 当前谱面选择转为带文档版本的小节选择快照。
- 模型上下文只暴露选择区是否存在，不暴露权威端点。
- 组合层校验索引版本、范围预算、返回文档身份、端点和数量。
- Assistant 路由、策略、预算、完成校验、评测基线和降级回答已接通。

## 下一步

A7.5e 应处理需要用户参与的恢复语义：

- `current-selection` 但没有选择区时进入 `waiting:user-input`。
- 文档版本变化时区分可自动重试和必须重新规划。
- 给用户展示简洁的问题，而不是底层 capability 错误码。
