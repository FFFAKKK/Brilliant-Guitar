# AI Agent 控制面设计 v0.1

日期：2026-09-18  
状态：控制面基线；A2/A3 首个垂直切片已实施  
关联：[AI Agent 架构优化方案](agent-architecture-optimization-plan-v0.2.md) · [AI Agent 架构基线](agent-architecture-v0.1.md) · [A3 Run Core 设计与实施](agent-a3-run-core-design-v0.1.md)

## 1. 这一步要解决什么

Capability 解决的是：

```text
系统能安全完成什么业务动作
```

控制面解决的是：

```text
面对用户目标，Agent 下一步应该做什么，什么时候停止，如何证明已经完成
```

控制面不能只是：

```text
用户输入 -> 模型 -> 工具 -> 模型 -> 回复
```

商业级实现必须是一个受约束的闭环：

```text
理解目标
  -> 确定任务边界
  -> 装配最小上下文
  -> 选择允许的能力
  -> 请求模型决策
  -> 校验模型决策
  -> 执行 Capability
  -> 记录结果和证据
  -> 验证状态
  -> 继续、询问、确认或结束
```

模型可以提出下一步，但只有控制面可以决定这一步是否允许执行。

## 2. 控制面边界

### 2.1 控制面拥有的职责

- 任务目标和任务状态；
- 当前 Run 的生命周期；
- 当前用户、工作区和文档作用域；
- 可用 Capability 和本次 Run 的 Toolset；
- 上下文预算和输出预算；
- 审批、取消、超时和重试策略；
- Invocation 的派发和结果归档；
- 结果验证和任务完成判断；
- 运行事件、诊断和恢复信息。

### 2.2 控制面不拥有的职责

- 不持有乐谱的第二份权威副本；
- 不实现音符、节拍、指法或转调算法；
- 不直接执行 Kernel Command；
- 不决定一个领域结果是否符合音乐规则；
- 不把模型生成的文本当作执行事实；
- 不通过修改上下文来伪造工具结果；
- 不绕过 Application Capability 做“快捷写入”。

## 3. 最小运行时对象

第一版只保留四个运行时对象：

```text
Agent Run
  一次用户任务的完整生命周期

Agent Turn
  Run 中的一次模型决策回合

Capability Invocation
  对一项 Application Capability 的一次调用

Agent Event
  Run 中发生过的不可变事实记录
```

暂时不把 `Plan`、`Step`、`SubAgent` 做成独立持久化对象。它们可以作为模型输出或事件中的结构化数据存在，等任务恢复和评测证明确实需要时再提升为独立实体。

### 3.1 Run

Run 是用户可以理解和管理的单位：

```text
runId
workspaceId
userId
createdAt
goal
status
documentScope
policySnapshot
toolsetSnapshot
budget
lastKnownDocumentVersion
```

Run 必须绑定创建时的策略和工具集快照。不能在运行中静默扩大权限。

### 3.2 Turn

Turn 是一次模型决策边界：

```text
turnId
runId
inputContext
modelRequest
modelResponse
requestedActions
validatedActions
status
```

一个 Turn 可以提出零个、一个或多个工具调用，但每个调用都必须单独经过校验和审计。

### 3.3 Invocation

Invocation 是能力执行边界：

```text
invocationId
runId
turnId
capabilityId
contractVersion
input
authorization
baseDocumentVersion
status
result
evidence
```

Invocation 的 `input` 是经过 Gateway 验证后的业务输入，不是模型原始 JSON。

### 3.4 Event

Event 记录已发生的事实，例如：

```text
run.created
turn.started
model.decision.received
invocation.requested
invocation.succeeded
approval.requested
document.version.changed
run.completed
```

事件用于诊断、回放和恢复，不直接作为当前状态的唯一读取接口。当前状态仍由 Run Store 或状态投影提供。

## 4. 控制循环

### 4.1 推荐的主循环

```text
while run is active:
    context = build_context(run)
    toolset = resolve_toolset(run, context)
    decision = ask_model(context, toolset)
    actions = validate_decision(decision, run, toolset)

    if actions is empty:
        outcome = evaluate_no_action(decision, run)
        if outcome requires user input:
            pause for user
        else:
            complete or fail run
        continue

    for action in actions:
        invocation = authorize_and_create_invocation(action)

        if invocation requires approval:
            pause for user approval

        result = execute_capability(invocation)
        append result and evidence

        if result is outcome-unknown:
            stop automatic retry
            enter recovery

        if result is mutation:
            verify authoritative state

    if completion_criteria_satisfied(run):
        complete run
```

### 4.2 模型输出的三种合法结果

模型每次只能产生三类控制面可识别结果：

```text
message
  给用户的说明或问题

tool_calls
  请求调用一个或多个已暴露的 Capability

finish
  声明任务已经达到某个完成原因
```

`finish` 不是模型单方面结束任务的权限。控制面仍要检查：

- 用户目标是否已经覆盖；
- 必需的 Capability 是否成功；
- 写入是否已经提交；
- 结果是否经过权威状态验证；
- 是否存在未处理的警告或冲突。

## 5. 上下文装配

### 5.1 上下文不是“把当前应用状态全部塞给模型”

上下文由控制面根据任务装配：

```text
固定指令
  -> 用户目标
  -> 工作区作用域
  -> 当前选区
  -> 最小状态摘要
  -> 已验证的工具结果
  -> 当前策略和预算
  -> 最近必要的对话内容
```

默认不放入：

- 完整 ScoreDocument；
- 完整 notation；
- 完整 playback source；
- 全部历史事件；
- 全部 Capability Descriptor；
- 与当前任务无关的 UI 状态；
- 未经验证的模型推测。

### 5.2 渐进式读取

控制面使用 Query Projection 的分层设计：

```text
初始：
  score.read-overview

模型判断需要结构：
  score.read-structure

模型判断需要局部内容：
  score.read-range

模型判断需要特定实体：
  score.read-entity
```

这是一种按需扩展上下文的方法，不是强制的树状调用流程。

### 5.3 Context Item 必须带来源

每个注入上下文的事实至少带有：

```text
sourceType
sourceId
documentVersion
scope
retrievedAt
trustLevel
```

示例：

```text
sourceType: capability-result
sourceId: score.read-range
documentVersion: 42
scope: measures 12..20
trustLevel: authoritative
```

模型生成的分析结论只能标记为 `derived`，不能和 Kernel 事实混为一类。

### 5.4 版本混合规则

如果上下文同时包含多个文档版本：

```text
version 42 的 overview
version 43 的 range
```

控制面必须显式标记这种混合状态，并在需要写入时重新读取和校验。不能让模型误以为所有内容来自同一个状态。

## 6. Toolset 装配

### 6.1 工具集不是固定全量列表

Toolset 由三步得到：

```text
应用能力目录
  -> Agent 插件允许列表
  -> 当前 Run 策略过滤
  -> 当前任务 Toolset
```

过滤依据包括：

- 能力类型；
- 当前用户授权；
- 是否需要打开文档；
- 是否允许文件或网络副作用；
- 当前任务是否需要写入；
- 当前预算；
- 当前文档作用域；
- 能力版本兼容性。

### 6.2 Tool Descriptor 的结构

模型可见的 Descriptor 建议是：

```text
id
name
description
inputSchema
outputSummary
preconditions
sideEffects
requiresApproval
scopeLimit
costClass
failureModes
```

下面这些信息不进入模型 Tool Descriptor：

- Rust 类型路径；
- Kernel 内部枚举；
- 真实文件路径；
- 其他能力的内部实现；
- 没有启用的能力；
- 未经授权的写入能力。

### 6.3 工具结果中的 next

能力结果可以带机器可读的后续提示：

```text
next:
  - capabilityId: score.read-range
    reason: "需要查看局部音符"
  - capabilityId: playback.audition-range
    reason: "可以试听当前选区"
```

`next` 只是建议，不是自动执行指令。控制面仍需根据 Run Toolset 和策略重新判断。

## 7. 决策校验

模型输出进入执行前，至少经过五层检查：

```text
1. 结构校验
2. 能力存在性校验
3. Toolset 可见性校验
4. 参数合同校验
5. 策略和版本校验
```

### 7.1 结构校验

拒绝：

- 未知动作类型；
- 缺失调用 ID；
- 重复或格式错误的参数；
- 超出单回合调用数量；
- 嵌套执行指令。

### 7.2 能力和可见性校验

模型即使猜到了一个 Capability ID，只要它不在当前 Run Toolset 中，就必须拒绝：

```text
tool-not-exposed
```

不能因为该能力存在于全局 Catalog 就自动放行。

### 7.3 参数合同校验

参数必须由 Gateway 解析成具体类型。禁止把无类型 JSON 传进业务 Handler。

参数错误应返回结构化错误，例如：

```text
invalid-input
missing-precondition
scope-exceeded
version-mismatch
```

### 7.4 策略和版本校验

写入能力额外检查：

- 是否有用户批准；
- 是否指定 `baseDocumentVersion`；
- 版本是否仍然匹配；
- 作用范围是否在用户确认范围内；
- 是否超过本次 Run 的变更预算。

## 8. 状态机

### 8.1 为什么需要状态机

Agent 不是一次函数调用，而是一个可能持续较长时间的异步工作流。它会遇到：

- 模型需要继续思考；
- 工具正在执行；
- 用户需要补充信息；
- 用户需要审批；
- 文档版本发生变化；
- Provider 超时；
- 宿主进程重启；
- 工具已经发出但结果不确定。

如果只用布尔值表示这些情况，系统很容易出现非法组合：

```text
isRunning = false
isWaiting = true
isCompleted = true
hasError = true
```

这些字段可能同时为真，但系统无法解释它们的优先级和恢复方式。

状态机的价值是把生命周期变成有限的、可验证的合同：

```text
给定当前状态和事件，只允许少数几种下一状态
```

### 8.2 状态、事件和副作用必须分开

```text
Event
  已发生的事实，例如 invocation.succeeded

State Reducer
  根据旧状态和事件，计算新状态

Effect Executor
  根据新状态或待执行效果，调用模型、Capability 或通知 UI
```

Reducer 应该是纯逻辑，不直接调用模型、Kernel 或网络。这样可以：

- 对状态转换做单元测试；
- 用历史事件回放状态；
- 在进程重启后恢复；
- 区分“状态已经记录”和“副作用是否已经执行”。

### 8.3 Run 与 Invocation 是两台不同的状态机

一次 Run 通常包含多个 Invocation：

```text
Run
  -> score.read-overview Invocation
  -> score.read-range Invocation
  -> guitar.analyze-difficulty Invocation
  -> playback.audition-range Invocation
```

所以不能用一个状态表示二者。Run 管任务级生命周期，Invocation 管一次能力调用的执行和回执。

### 8.4 Run 状态：主状态与原因分离

初版不把所有组合都编码成独立状态，例如不同时创建：

```text
awaiting-input
awaiting-approval
awaiting-recovery
awaiting-cancellation
```

否则状态数量会随着等待原因持续增长。建议使用“主状态 + 阶段 + 原因”的模型：

```text
RunLifecycle:
  active
  waiting
  recovering
  terminal

RunPhase:
  preparing
  planning
  executing
  verifying

WaitReason:
  user-input
  approval
  cancellation-pending

TerminalReason:
  completed
  failed
  cancelled
```

组合示例：

```text
{ lifecycle: active,     phase: planning }
{ lifecycle: waiting,    phase: planning,   reason: user-input }
{ lifecycle: waiting,    phase: executing,  reason: approval }
{ lifecycle: recovering, phase: executing }
{ lifecycle: terminal,   phase: verifying,  terminalReason: completed }
```

这里的 `phase` 表示 Run 在任务流程中的位置；`lifecycle` 表示它当前是否能继续推进；`reason` 表示为什么暂停。三者不能互相替代。

### 8.5 Run 的合法转换

```text
created
  -> active(preparing)

active(preparing)
  -> active(planning)
  -> waiting(user-input)
  -> terminal(failed)

active(planning)
  -> active(executing)
  -> waiting(user-input)
  -> waiting(approval)
  -> terminal(completed)
  -> terminal(failed)

active(executing)
  -> active(verifying)
  -> waiting(approval)
  -> waiting(cancellation-pending)
  -> recovering
  -> terminal(failed)

active(verifying)
  -> active(planning)
  -> terminal(completed)
  -> terminal(failed)

waiting
  -> active(previous phase)
  -> terminal(cancelled)

recovering
  -> active(previous phase)
  -> waiting(user-input)
  -> terminal(failed)
  -> terminal(cancelled)
```

需要特别注意：

1. `completed`、`failed`、`cancelled` 是终态，不能再回到 `active`。
2. `waiting` 不是失败；它表示系统知道下一步需要什么。
3. `recovering` 表示系统正在确认未完成 Invocation 的结果，不能直接重新发送模型请求。
4. 审批和用户输入是等待原因，不应该与整个 Run 的主阶段混为一谈。

### 8.6 Invocation 状态

Invocation 的生命周期更接近一次受控执行：

```text
requested
  -> validated
  -> awaiting-approval
  -> dispatched
  -> running
  -> succeeded

requested / validated / dispatched / running
  -> rejected
  -> cancelled
  -> timed-out
  -> failed
  -> outcome-unknown
```

`outcome-unknown` 是商业级系统必须保留的状态：

```text
请求可能已经提交，但控制面没有获得确定回执
```

它和 `failed` 的区别是：

```text
failed:
  可以证明能力没有完成

outcome-unknown:
  不能证明能力有没有完成
```

此时不能直接生成新的 request ID 重试。必须先：

1. 查询原 Invocation 状态；
2. 回读权威文档版本或目标实体；
3. 判断原操作是否已经生效；
4. 再决定恢复、补偿或向用户报告。

### 8.7 审批是一个独立对象

审批不是简单的 `approved: true`，也不是 Run 状态的替代。它是一个具有范围和有效期的授权决定：

```text
approvalId
invocationId
requestedAt
requestedBy
affectedScope
proposedEffects
baseDocumentVersion
expiresAt
decision
```

批准必须绑定具体 Invocation 或 Proposal。不能出现：

```text
用户批准了“帮我修改乐谱”
```

然后让模型在之后任意扩大修改范围。

批准至少要绑定：

- 哪一项能力；
- 哪个文档版本；
- 哪个作用范围；
- 哪些预期副作用；
- 是否已经过期。

### 8.8 取消也必须有边界

取消分为两种：

```text
dispatch 前取消
  Invocation 尚未发出，可以直接取消

dispatch 后取消
  能力已经发出，需要等待能力响应、确认取消，或进入 outcome-unknown
```

因此用户点击取消时，控制面不应立即假装所有事情都停止了。对于无法中断的能力，Run 可以暂时进入：

```text
waiting(reason: cancellation-pending)
```

直到 Invocation 有确定终态。

## 9. 完成判断

完成判断由控制面负责，但必须基于可验证条件。

### 9.1 读取任务

例如“告诉我这首曲子有多少小节”：

```text
requiredCapability: score.read-overview
requiredField: measureCount
verification: result.documentVersion exists
```

### 9.2 分析任务

例如“分析这段是否适合初学者”：

```text
requiredCapability: guitar.analyze-difficulty
requiredEvidence: analyzedScope, sourceVersion, assumptions
verification: analysis covers requested range
```

### 9.3 修改任务

例如“把第 12 到 20 小节整体升高一个全音”：

```text
required:
  - target scope
  - base document version
  - proposal preview
  - user approval
  - mutation succeeded
  - authoritative re-read
```

模型说“已经升调”不构成完成。只有最终回读证明目标范围和版本已经变化，Run 才能进入 `completed`。

## 10. 失败、取消和恢复

### 10.1 失败分类

```text
user-error
  输入或作用域不合法

policy-rejected
  权限或确认不足

capability-failed
  业务能力执行失败

provider-failed
  模型服务或网络失败

version-conflict
  文档已被其他操作修改

outcome-unknown
  执行结果无法确定

host-interrupted
  宿主进程中断
```

不同失败分类必须有不同恢复策略。不能全部变成“再试一次”。

### 10.2 取消

取消分两种：

```text
cancel-before-dispatch
  尚未调用能力，可以直接取消

cancel-after-dispatch
  能力已经发出，需要等待能力返回或进入 outcome-unknown
```

取消请求不能保证已经提交的 Kernel Command 被撤销。能否撤销取决于能力合同和 Kernel 事务边界。

### 10.3 恢复

恢复优先依赖事件和权威状态：

```text
读取 Run 状态
  -> 找到未结束 Invocation
  -> 查询或回读其结果
  -> 重建上下文
  -> 继续、补偿或询问用户
```

恢复不能简单地把最后一条模型消息重新发送给 Provider。

## 11. 事件和可观测性

第一版就需要记录以下指标：

```text
run_count
run_completion_rate
run_user_cancel_rate
turn_count
invocation_count
tool_rejection_rate
capability_failure_rate
outcome_unknown_count
average_context_size
average_tool_result_size
document_version_conflict_count
```

每个 Invocation 至少关联：

```text
runId
turnId
invocationId
capabilityId
documentVersion
inputHash
resultStatus
latency
errorCode
```

不要默认记录完整用户乐谱或完整模型上下文。日志优先记录 ID、版本、范围、摘要和哈希。

## 12. Fake Provider 与回放

在接入真实模型前，先实现 Fake Provider：

```text
输入：上下文摘要和 Toolset
输出：预先定义的 message / tool_calls / finish
```

Fake Provider 用于验证：

- 模型请求是否包含正确的 Toolset；
- 工具参数错误是否被拒绝；
- 调用结果是否正确回注上下文；
- 多轮调用是否可以完成；
- 取消、超时和版本冲突是否正确；
- `outcome-unknown` 是否阻止盲目重试；
- Run 恢复是否可回放。

真实模型只负责验证“模型适应性”，不负责证明控制面正确。

## 13. 第一版最小闭环

建议先实现一个只读任务：

```text
用户：
  这首曲子有多少小节？第 12 到 20 小节适合练习吗？

控制面：
  1. 建立 Run
  2. 装配 score.read-overview
  3. 调用 overview
  4. 根据任务需要装配 score.read-range
  5. 调用 guitar.analyze-difficulty
  6. 验证分析范围和 documentVersion
  7. 返回答案和证据
```

这个闭环已经覆盖：

- 用户目标；
- 渐进式上下文；
- 动态 Toolset；
- Query Capability；
- Analysis Capability；
- 多 Invocation；
- 版本来源；
- 完成判断；
- Fake Provider 回放。

不需要先实现写入、多 Agent 或复杂长期记忆。

## 14. 下一步实施边界

下一阶段只设计和实现以下接口，不扩大范围：

```text
AgentRun
AgentTurn
CapabilityInvocation
AgentEvent
ProviderPort
ContextBuilder
ToolsetResolver
DecisionValidator
RunStateReducer
```

推荐顺序：

1. 先定义事件和状态转移；
2. 再定义 Fake Provider；
3. 再实现单轮和多轮控制循环；
4. 再接入 `score.read-summary`；
5. 最后接入真实 Provider。

当前不实现：

- 写入 Capability；
- Proposal 和 Preview；
- 长期记忆；
- 多 Agent；
- 动态第三方插件；
- 自动化后台 Run；
- 全量音乐工具目录。

## 15. 核心设计原则

```text
模型负责提出下一步，控制面负责决定能不能做。

Capability 负责完成动作，控制面负责组织动作。

Kernel 负责事实，Context 负责携带事实。

工具结果负责提供证据，模型文本不负责证明执行成功。

状态机负责表达不确定性，异常字符串不负责表达状态。

先建立可回放的控制循环，再接入不可预测的真实模型。
```

## 16. 状态机如何持久化

前面的状态机定义了“状态如何变化”，但还没有回答：

```text
状态保存在哪里？
进程重启后如何恢复？
状态记录和副作用执行之间出现故障怎么办？
```

商业级 Agent 不能只把当前状态放在内存里，也不能在重启后重新发送最后一条
模型消息。推荐使用一个轻量的、可回放的控制面存储：

```text
Event Store
  保存已经发生的 Agent 控制事实

Run State Projection
  保存每个 Run 当前状态，供 UI 和 Runtime 快速读取

Snapshot
  定期保存状态折叠结果，用于减少恢复时需要扫描的事件数量
```

关系如下：

```text
Event
  -> Reducer
  -> Run State Projection
  -> Context / UI / Recovery
```

这里不建议一开始就做完整的通用 Event Sourcing 框架。第一版采用“事件记录加当前
状态投影”的混合方案：

1. 事件是诊断、回放和恢复所需的事实记录。
2. Run State 是可查询的当前状态，不需要每次从头扫描全部事件。
3. Snapshot 只是性能优化，不改变状态转换规则。
4. Kernel 文档本身仍由 Kernel 管理，Agent Event 不成为第二份乐谱事实。

### 16.1 三种数据的职责

| 数据 | 解决的问题 | 是否作为事实依据 |
|---|---|---|
| Event | 发生过什么 | 是，针对 Agent 控制面 |
| Run State | 现在处于什么状态 | 是当前状态投影 |
| Snapshot | 如何更快恢复 | 否，是优化数据 |

例如：

```text
invocation.requested
invocation.dispatched
invocation.succeeded
```

这些事件可以折叠出：

```text
Invocation.status = succeeded
```

但不能只保存 `succeeded` 而丢失事件，因为之后无法判断它是否真的派发过、
是否经历过超时、是否发生过重试或结果是否曾经不确定。

## 17. Run Store、Event Store 与 Reducer

这三个组件不要混成一个“万能状态服务”。

### 17.1 Event Store

Event Store 只负责可靠地追加和读取事件：

```text
append(runId, expectedSequence, event)
read(runId, afterSequence)
```

它应该保证：

- 同一个 Run 的事件具有单调递增序号；
- `expectedSequence` 不匹配时拒绝追加，防止并发覆盖；
- 事件带有唯一 `eventId`；
- 重复提交同一个幂等键不会产生重复事实；
- 事件写入成功后不会被普通状态刷新悄悄覆盖。

Event Store 不负责：

- 调用模型；
- 调用 Capability；
- 解释音乐领域规则；
- 判断用户是否应该批准某项修改。

### 17.2 Run State Projection

Run State Projection 保存 Runtime 最常读取的结果：

```text
runId
lifecycle
phase
waitReason
terminalReason
lastEventSequence
activeTurnId
activeInvocationIds
pendingApprovalIds
lastKnownDocumentVersion
recoveryRequired
```

它可以由事件增量更新，也可以在损坏或迁移时由事件重新构建。

Projection 的关键原则是：

```text
Projection 可以重建，Event 不应被“修正成当前样子”。
```

如果发现当前状态不对，应该定位是哪一个事件或 Reducer 规则造成问题，而不是
直接手工把状态改成看起来正确的值。

### 17.3 State Reducer

Reducer 是状态机的唯一转换规则：

```text
nextState = reduce(previousState, event)
```

Reducer 应当是纯逻辑，并且对非法转换明确拒绝。例如：

```text
RunLifecycle::Terminal
  + invocation.succeeded
  = invalid transition
```

这使得状态转换可以独立测试，也可以用同一份事件在测试、开发和生产诊断中重放。

## 18. 哪些内容需要持久化

持久化的标准不是“以后可能有用”，而是：

```text
进程重启后，如果没有它，系统是否无法安全决定下一步？
```

### 18.1 必须持久化

```text
Run 创建事实和用户目标
用户、工作区和文档作用域
策略和 Toolset 快照的标识或内容摘要
Run 生命周期和阶段变化
每次 Turn 的标识和完成状态
每次 Invocation 的输入摘要、状态和幂等键
派发、回执、超时和 outcome-unknown 事实
审批请求、批准范围、版本和过期时间
取消请求和取消执行边界
关键文档版本锚点
恢复所需的错误分类和下一步
```

### 18.2 可以重建或短期保留

```text
当前 Run State Projection
当前 Toolset 的完整描述
当前 Context Item 列表
模型请求的临时拼装结果
UI 展示用的进度文本
缓存的窄查询结果
```

它们可以由事件、Run 配置和 Kernel 当前状态重新生成。

### 18.3 默认不持久化

```text
完整 ScoreDocument
完整 React 状态
没有脱敏的完整模型上下文
不受控制的模型原始隐藏推理
没有任务价值的重复工具输出
```

需要审计时，可以保存：

```text
输入摘要
结果摘要
sourceId
documentVersion
scope
inputHash
outputHash
```

如果产品确实需要用户查看历史对话，再单独设计 Conversation Transcript，不能
让审计 Event 和聊天记录承担同一个数据模型。

## 19. Invocation 与副作用的可靠边界

最危险的故障窗口是：

```text
事件已经写入，但能力还没调用
能力已经调用，但事件还没写入
```

因此 Invocation 需要把“准备执行”和“已经执行”分开：

```text
invocation.requested
  -> invocation.validated
  -> invocation.dispatching
  -> invocation.dispatched
  -> invocation.running
  -> invocation.succeeded / failed / outcome-unknown
```

推荐流程：

```text
1. 校验模型动作
2. 写入 invocation.requested
3. 写入 invocation.validated
4. 持久化稳定的 invocationId 和 idempotencyKey
5. 记录 dispatching
6. 调用 Capability Gateway
7. 记录确定回执或 outcome-unknown
8. 根据回执推进 Run
```

`dispatching` 的意义是标记一个可能在崩溃时处于中间状态的窗口。恢复时不能把
它当作“肯定没调用”，也不能当作“肯定成功”。

### 19.1 幂等键

每个可能产生副作用的 Invocation 都需要稳定幂等身份：

```text
idempotencyKey = runId + invocationId
```

实际编码可以是哈希或独立字符串，但语义必须稳定。重试时优先复用原 Invocation
和原幂等键，而不是为同一件事生成一个全新的请求。

这要求 Capability 合同明确说明：

- 是否支持幂等；
- 重复请求如何返回；
- 如何查询原请求；
- 结果无法确定时如何确认；
- 是否可以安全补偿。

如果底层能力无法提供这些语义，控制面只能把它归类为高风险或不可自动恢复能力，
而不能假装它支持可靠重试。

## 20. 进程重启后的恢复流程

恢复不是“重新运行 Agent”，而是先恢复控制事实，再判断副作用边界：

```text
应用启动
  -> 读取未终止 Run
  -> 读取最后一个有效 Snapshot
  -> 重放 Snapshot 之后的 Event
  -> 重建 Run State
  -> 找到未终止 Invocation
  -> 查询原 Invocation 或回读 Kernel 权威状态
  -> 标记恢复结论
  -> 重新构建 Context 和 Toolset
  -> 继续、等待用户或终止
```

### 20.1 不同 Invocation 状态的恢复策略

| 重启时状态 | 恢复动作 |
|---|---|
| `requested` | 重新进行校验，不直接执行 |
| `validated` | 检查 Run 是否仍有效，再决定是否派发 |
| `dispatching` | 查询原请求或回读权威状态，不能盲目重试 |
| `dispatched` | 等待回执或查询结果 |
| `running` | 查询能力状态；无法查询时进入 `outcome-unknown` |
| `outcome-unknown` | 人工确认、权威回读或补偿，不自动换新 ID |
| `succeeded` | 回放结果并继续完成判断 |
| `failed` | 按错误分类恢复或结束 |
| `awaiting-approval` | 恢复审批界面，不自动批准 |

### 20.2 Kernel 版本是恢复锚点

对于涉及乐谱的 Invocation，恢复时优先检查：

```text
documentId
lastKnownDocumentVersion
affectedScope
```

如果是读取任务，可以重新读取最新版本并明确标记版本变化。

如果是写入任务，必须确认：

```text
原 Invocation 是否已经提交？
目标版本是否发生变化？
受影响范围是否已经出现预期结果？
```

只有 Kernel 的权威读取或事务结果可以证明文档是否改变。Agent Event 只能证明
控制面曾经请求过什么。

## 21. 事件顺序、幂等与并发

状态机正确的前提是事件顺序明确。

### 21.1 顺序

同一个 Run 内的事件使用序号：

```text
sequence: 1, 2, 3, 4 ...
```

Reducer 只接受下一个预期序号。不同 Run 可以并行，但同一 Run 的状态转换不能被
两个执行循环同时推进。

### 21.2 幂等

至少需要三层幂等：

```text
Event 幂等
  同一个 eventId 不重复追加

Invocation 幂等
  同一个 invocationId 不重复执行逻辑

Capability 幂等
  可能产生副作用的底层调用可识别重复请求
```

三者不是同一个概念。Event 不重复写入，并不能证明外部能力没有被调用两次。

### 21.3 单 Run 串行

第一版建议对一个 Run 使用单一执行所有者：

```text
一个 Run 同时只有一个 Runtime Loop 负责推进状态
```

这样可以显著降低模型回合、审批、取消和恢复之间的竞态。多个 Run 之间仍然
可以并行，不需要一开始就设计复杂的分布式调度。

## 22. 状态机这一讲的结论

到这里，状态机的完整设计思路是：

```text
状态机
  规定允许的生命周期和转换

Event
  记录已经发生的控制事实

Reducer
  用纯逻辑把事件折叠成当前状态

Run Store
  提供当前状态的快速访问

Snapshot
  优化恢复速度，但不是新的事实来源

Recovery
  先确认副作用边界，再决定继续、补偿、等待或结束
```

这套设计的核心不是“保存更多数据”，而是避免在不确定时做出错误动作：

```text
不知道是否写入成功，就不能直接再写一次。
不知道用户批准了什么，就不能扩大修改范围。
不知道文档是否变化，就不能使用旧版本分析结果进行提交。
```

因此，状态机真正保护的是 Agent 的行为边界，而不只是 UI 上显示的进度。

## 23. 下一步：上下文与工具集装配

状态持久化完成设计后，下一个问题是：

```text
每一次模型决策，控制面究竟应该给它什么信息和哪些工具？
```

下一讲进入 `Context Builder` 与 `Toolset Resolver`：

```text
Run State
  + 用户当前请求
  + 当前文档版本和作用域
  + 已验证的 Invocation 结果
  -> Context Builder

Capability Catalog
  + Agent Allowlist
  + 当前策略
  + 当前任务阶段
  -> Toolset Resolver

Context + Toolset
  -> Provider
```

重点将从“状态如何可靠推进”转向“模型如何只看到完成当前任务所需的最小信息和能力”。
