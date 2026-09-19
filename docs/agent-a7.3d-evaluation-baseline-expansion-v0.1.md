# Agent A7.3d 评测基线扩展 v0.1

日期：2026-09-18
状态：已实现，未执行真实收费 Provider 请求

## 目标

把 `score.read-metadata` 和 `score.read-structure` 纳入正式评测基线，并让评测 Executor 通过真实 `AgentIntentRouter` 选择 Capability。这样评测可以发现路由错误，而不是由测试代码预先指定正确工具。

## 当前基线

```text
score-summary.standard
score-summary.provider-failure
score-metadata.standard
score-structure.standard
```

每个成功 Case 都检查：

- 任务进入正确的最小 Capability；
- 未调用相邻但不需要的 Capability；
- Capability 轨迹精确且只调用一次；
- Completion Verifier 接受权威结果；
- 结果包含当前文档版本证据；
- 回答包含 Fixture 中可验证的事实；
- Turn、调用次数和耗时不超过预算。

Provider 失败 Case 禁止出现任何读取调用，避免失败后仍执行工具或伪造完成。

## Executor 的设计变化

评测链路现在是：

```text
Case goal
  -> AgentIntentRouter
  -> Capability-specific Run Policy
  -> Fake Provider candidate action
  -> Real AgentRunController
  -> Real Capability Port decoder
  -> Capability-specific Completion Verifier
  -> Deterministic Grader
```

Case 只声明任务和预期，不直接把正确 Capability 传给 Executor。若路由器把元数据问题错误地映射为概要能力，运行仍会完成，但 Grader 会因为必需能力缺失、禁止能力出现和精确轨迹不匹配而让 Case 失败。

## 为什么这接近商业级做法

商业级 Agent 不能只测试最终文本。相同文本可能来自模型猜测、错误工具或过期上下文。当前基线把质量拆成三层：

```text
路由正确性
执行与权限正确性
完成证据和回答事实正确性
```

后续每新增一个音乐 Capability，应同时新增至少一个成功 Case、一个相邻能力误选约束，以及必要的失败或边界 Case。

## 下一阶段

下一阶段进入 A7.4：第一组局部读取能力。建议先实现 `score.read-measure-range`，因为它能够验证范围参数、范围预算、局部上下文和文档版本一致性，而不会立刻引入写操作风险。
