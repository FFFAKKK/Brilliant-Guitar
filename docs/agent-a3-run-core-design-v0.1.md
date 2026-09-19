# AI Agent A3 Run Core 设计与实施 v0.1

日期：2026-09-18  
状态：A3 已完成  
前置：[AI Agent 控制面设计](agent-control-plane-design-v0.1.md) · [AI Agent 上下文与工具集设计](agent-context-toolset-design-v0.1.md) · [A1 Capability Foundation](agent-a1-capability-foundation-design.md)

> **历史实施记录。** A3 的 Run 状态机、工具筛选、持久化和恢复原则继续有效；其底层统一
> Application Capability 调用路径是迁移兼容层，不是未来架构。新的业务入口采用 Direct Tool Adapter
> 或插件工作流，参见 [目标重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)。

## 1. A3 要证明什么

A1 已经证明统一 Application Capability 可以跨越 TypeScript、Tauri、Rust 应用层和
Kernel。A2 已经证明模型每一轮只能看到经过筛选的最小上下文和最小工具集。

A3 要证明的是：

> 即使没有真实模型，控制面也能确定性地推进一次任务，并能解释每一次状态变化、
> 工具调用和结束原因。

第一条闭环刻意只做读取：

```text
用户目标
  -> Context Builder
  -> Toolset Resolver
  -> Fake Provider 提出 score.read-summary
  -> Decision Validator
  -> Capability Port
  -> 权威结果回注 Context
  -> Fake Provider 提出 finish
  -> Completion Verifier
  -> Run completed
```

## 2. 为什么先用 Fake Provider

真实模型同时带来网络、费用、超时、流式协议和输出波动。如果一开始就接真实模型，
测试失败时很难判断问题来自控制面还是模型。

Fake Provider 使用脚本化决策：

```text
第 1 回合：期望看到 score.read-summary，返回 tool-calls
第 2 回合：期望上下文已有权威概要，返回 finish
```

它还会检查每一轮实际收到的 Toolset 和 Context 来源。因此它不是一个随便返回 JSON
的 mock，而是控制面合同的确定性回放器。

## 3. 状态机为什么使用判别联合

Run 状态不再是几个可以任意组合的布尔字段，而是有限状态：

```text
active      + phase
waiting     + phase + waitReason
recovering  + phase + recoveryReason
terminal    + phase + terminalReason
terminal failed 额外携带 failureCode
```

这样下面这些非法状态不能被类型系统表达：

```text
terminal 但没有结束原因
waiting 但不知道在等什么
recovering 但不知道为什么恢复
failed 但没有失败分类
```

`Run Reducer` 只接收旧状态和 Event，返回接受或拒绝。它不调用 Provider、不调用
Capability，也不更新 React。

## 4. Run 与 Invocation 为什么分开

Run 表示用户任务，Invocation 表示一次能力调用。一个 Run 可以包含多个 Invocation，
二者的失败语义也不同：

```text
Run active / planning
  可以等待模型下一步

Invocation dispatched / running
  表示请求可能已经离开控制面

Invocation outcome-unknown
  不能证明能力成功，也不能证明能力失败
```

当前 A3 同时实现了两套纯 Reducer。测试会拒绝例如：

```text
Run 在 planning 时直接接收 invocations.completed
Invocation 在 requested 时直接变成 succeeded
```

## 5. Effect 与状态转换如何配合

`AgentRunController` 是 Effect Executor。它可以请求 Provider 和 Capability，但每次推进
生命周期都必须先提交 Event 给 Reducer：

```text
turn.tools-accepted
  -> Run 进入 executing

invocation.dispatched
  -> Capability Port 才执行调用

invocations.completed
  -> Run 进入 verifying

verification.continue
  -> Run 回到 planning
```

Run Event 和 Invocation Event 都记录从 1 开始的顺序号。A3 只保存在内存中；A4 将由
宿主存储负责原子追加、幂等和单 Run 执行所有权。

## 6. Provider 没有执行权限

Provider 只返回三类提议：

```text
message
tool-calls
finish
```

它不能获得 Capability Port，也不能直接调用 Gateway。模型猜出未暴露的 Capability ID
时，Decision Validator 会拒绝整批决策，Runner 不会执行其中任何一项。

`finish` 同样只是提议：

- `finish.completed` 必须通过 Completion Verifier；
- `finish.failed` 或 `finish.cancelled` 不会伪装成用户取消或成功；
- 用户取消只能由控制面的取消事件产生。

## 7. Capability Port 的确定性边界

Runner 不依赖完整 `WorkbenchHostBridge`，只依赖收窄的 `AgentCapabilityPort`：

```text
invoke(CapabilityTransportRequest)
  -> CapabilityResult
```

`WorkbenchAgentCapabilityPort` 负责：

1. 根据能力 ID 选择严格结果解码器；
2. 调用统一 `invokeCapability` 宿主接口；
3. 校验 invocationId、capabilityId 和 contractVersion；
4. 区分确定失败和结果不确定。

如果请求可能已经发出，但回执丢失或身份不匹配，Invocation 进入
`outcome-unknown`，Run 进入 `recovering`，不会自动生成新 ID 重试。

如果用户在 Capability 已经发出之后取消，控制面也不能声称底层调用已经停止：

```text
Invocation -> outcome-unknown
Run -> waiting / executing / cancellation-pending
```

这与调用前取消不同。调用前取消可以直接结束 Run；调用后取消必须等待 A4 的宿主恢复
流程核对原 Invocation 或权威状态。

## 8. 权威结果如何回注上下文

成功的 Capability Result 会被转换为结构化 Context Item：

```text
kind: capability-result
sourceType: capability-result
sourceId: score.read-summary
documentId: 来自结果
documentVersion: 来自结果
trustLevel: authoritative
```

Runner 不保存第二份简化乐谱。它只保存完成后续决策所需的权威投影和来源元数据。

## 9. 完成校验

当前 `verifyScoreSummaryCompletion` 要求：

```text
存在 score.read-summary Invocation
Invocation 状态为 succeeded
Capability Result 状态为 completed
结果通过 ScoreSummaryV1 合同校验
```

因此模型仅输出“已经读取完成”不能结束 Run。完成权属于控制面，事实权属于 Capability
和 Kernel。

## 10. 已实施文件

```text
apps/workbench/src/agent/run-state.ts
apps/workbench/src/agent/invocation-state.ts
apps/workbench/src/agent/provider.ts
apps/workbench/src/agent/capability-port.ts
apps/workbench/src/agent/completion-verifier.ts
apps/workbench/src/agent/run-controller.ts
apps/workbench/test/agent-run-core.test.ts
```

## 11. 当前测试覆盖

```text
确定性两回合只读闭环
Run 与 Invocation 非法转换
猜测未暴露工具时零调用
Provider 失败
用户取消
Capability 发出后的取消等待核对
Capability outcome-unknown
Capability 回执身份不匹配
模型不能伪造用户取消或完成
Event 顺序号
```

## 12. A3 验收结论

A3 的四项验收要求已经全部满足：

1. 可以确定性演示用户请求、读取概要、生成回答、验证和完成。
2. Run 与 Invocation 的非法状态转换会被拒绝。
3. 调用前取消、调用后取消、Provider 失败、无效工具和不确定回执有不同结果。
4. 全部测试不需要网络、API Key 或模型费用。

## 13. A3 当前边界

本切片暂不包括：

```text
桌面宿主持久化
进程重启恢复
审批恢复后的继续执行
并发 Run 调度
真实 Provider
流式输出
Agent 插件面板
写入 Proposal 和 Preview
```

这些不是遗漏，而是后续里程碑的边界：

```text
A4 Durable Run Store
A5 Agent Plugin Lifecycle + Minimal UI
A6 Real Provider Boundary
```

下一步优先设计 A4 的宿主存储合同：哪些事件必须原子持久化、何时写检查点、如何识别
未结束 Invocation，以及重启后哪些状态可以自动恢复、哪些必须等待用户确认。
