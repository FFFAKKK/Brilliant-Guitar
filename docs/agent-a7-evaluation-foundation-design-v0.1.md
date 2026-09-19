# Agent A7.3a 评测基础设计 v0.1

日期：2026-09-18
状态：已实现，未执行真实收费 Provider 请求
前置：[A7.2 Conversation、Streaming 与 Task History](agent-a7-conversation-streaming-design-v0.1.md)

## 1. 为什么先做评测

增加 Capability 只会扩大 Agent 的动作空间，不会自动提高可靠性。没有固定任务、Fixture、预期工具轨迹
和失败条件时，团队只能观察几个演示结果，无法判断一次修改究竟提升了任务完成率，还是让模型偶然换了
一种说法。

A7.3a 建立以下最小闭环：

```text
Evaluation Case
  -> Executor
  -> Real AgentRunController
  -> AgentRunOutcome
  -> Observation
  -> Deterministic Grader
  -> Case Report
  -> Suite Report
```

评测不会绕过控制面，也不会直接调用 Capability。Executor 必须像产品运行一样经过 Provider Port、Decision
Validator、Capability Gateway、Run State 和 Completion Verifier。

## 2. 四个核心对象

### 2.1 Case

Case 描述稳定的测试意图，而不是 Provider 实现：

```text
id / title / category
fixtureId
goal
expectations
```

`fixtureId` 指向可复现的乐谱和环境。Case 不直接保存运行结果，也不把 Provider 的私有响应作为真值。

### 2.2 Observation

Observation 只能从权威 `AgentRunOutcome` 提取：

```text
terminalReason / failureCode
capabilitySequence / successfulCapabilityIds
verificationSatisfied / verificationEvidence
response
turnCount / capabilityCallCount / durationMs
```

它不读取 UI Conversation，也不把流式草稿、Activity 标签或隐藏推理作为评测事实。

### 2.3 Deterministic Grader

第一版检查可精确证明的条件：

```text
终态和失败码
必须调用与禁止调用的 Capability
可选的精确 Capability 轨迹
Completion Verification 与证据
稳定回答片段
Turn、调用次数和耗时上限
```

精确轨迹允许同一 Capability 重复出现，以支持分页、重新读取和版本刷新。Case 若期望失败，必须声明
具体失败码，不能使用“任何失败都算通过”的宽松规则。

### 2.4 Suite Report

Suite 顺序执行 Case，避免共享 Fixture 和宿主状态互相污染。单个 Executor 抛错只产生
`infrastructure-failed`，不泄露原始异常文本，也不会阻止后续 Case。

Suite 必须非空且 Case ID 唯一；Executor 对未知 Fixture 必须失败，不能静默套用默认数据。否则 CI 可能
在没有执行有效任务时产生“100% 通过”的假绿结果。

Suite 的主要门禁是 Case pass rate。`averageScore` 只是定位失败维度的诊断值；由于检查项数量不同，它
不能直接作为产品质量 KPI。

## 3. 为什么暂时不用模型评分

模型评分适合判断解释质量、音乐表达和开放式答案，但不应替代控制面断言。例如“是否调用了未经授权的
Capability”“失败后是否错误宣布完成”都必须用确定性规则判断。

后续可以增加独立的语义 Grader：

```text
Deterministic Grader 负责安全、合同、轨迹和预算
Semantic Grader 负责答案相关性、清晰度和音乐分析质量
Human Review 负责高风险样本和评分校准
```

语义评分不能覆盖确定性失败。一旦出现越权调用、错误终态或缺失完成验证，该 Case 仍然失败。

## 4. 第一组 Baseline

当前固定两个 Case：

```text
score-summary.standard
  -> 必须调用 score.read-summary 一次
  -> 必须通过 Completion Verification
  -> 必须携带 score-1@7 证据
  -> 两个 Turn 内完成

score-summary.provider-failure
  -> 必须终止为 provider-failed
  -> 不得调用 score.read-summary
  -> 不得伪造完成验证
```

Baseline 使用 `FakeAgentProvider` 和真实 Capability Port，不产生网络请求和模型费用。

## 5. 当前没有纳入的指标

OpenAI Provider Envelope 已包含 token usage，但当前 `AgentProviderPort.decide()` 只返回候选 Decision，usage
没有进入 Run Outcome。A7.3a 不为了评测方便修改权威 Provider 端口。

后续应新增独立的 Provider Observation 合同，再纳入：

```text
input / output / total tokens
首事件延迟与完整响应延迟
Provider request id
模型和 Provider 版本
估算费用
```

这些数据属于观测面，不应改变 Run 的成功、失败或 Capability 执行语义。

## 6. 与成熟方案的对应关系

- OpenAI 的评测最佳实践强调评测驱动开发、任务专用测试、记录数据和持续评测。本阶段先建立固定
  Baseline 和可重复报告，再扩大能力集合。
- Anthropic 建议尽早建立贴近真实分布的任务，并结合代码、模型和人工 Grader；本阶段先实现最稳定的
  代码 Grader，同时为语义 Grader 保留边界。
- Google ADK 将最终回答质量和工具轨迹作为不同评测维度；本阶段同样把 response、Capability
  trajectory 和完成验证分开。
- Microsoft Foundry 的 Agent Evaluators 区分任务遵循、工具调用、意图解析和流程质量；本阶段先覆盖
  可从现有 Run Outcome 确定性推导的部分。

参考：

- [OpenAI Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Anthropic Develop tests and evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- [Google ADK Evaluate agents](https://google.github.io/adk-docs/evaluate/)
- [Microsoft Foundry Agent evaluators](https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/evaluation-evaluators/agent-evaluators)

## 7. 下一阶段 A7.3b

下一阶段扩展只读音乐 Capability，但每个 Capability 必须和评测 Case 一起进入：

```text
score.read-metadata
score.read-structure
score.read-measure-range
score.read-selection
```

先实现 `score.read-metadata` 与 `score.read-structure`，验证模型能在 summary、metadata 和 structure 之间
选择最小能力，而不是把所有数据重新塞进一个大对象。
