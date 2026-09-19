# AI Agent A4 恢复协调器与 Resume Cursor 设计 v0.1

日期：2026-09-18
状态：恢复协调器、显式 Resume、Controller Resume Cursor 与恢复面板插件已实现
前置：[A4 Durable Run Store](agent-a4-durable-run-store-design-v0.1.md)

## 1. 问题定义

应用重启后，Agent 不能简单地重新执行最后一步。最后一个 Capability 可能：

```text
从未开始
已经开始但尚未产生确定结果
已经完成但控制面尚未保存结果
明确失败或拒绝
正在等待用户审批或输入
```

恢复的第一职责是核对事实，不是继续调用模型。

## 2. 成熟实现的共同原则

本设计参考以下官方资料：

- [OpenAI Agents SDK Sessions](https://openai.github.io/openai-agents-js/guides/sessions/)：Session 可以替换为自定义持久化后端；恢复时继续使用同一 Session；支持用稳定 operation ID 实现原子、幂等的历史事务。
- [OpenAI Agents SDK Results](https://openai.github.io/openai-agents-js/guides/results/)：审批中断使用可序列化 `RunState` 恢复，而不是从头重新生成。
- [Microsoft Agent Framework Checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)：Checkpoint 保存执行器状态、待处理消息、请求和响应，恢复后从确定边界继续。
- [Microsoft Agent Framework HITL](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop)：待处理请求被保存，并在恢复 Checkpoint 时重新发出，而不是自动批准。
- [Google ADK BaseSessionService](https://google.github.io/adk-docs/api-reference/java/com/google/adk/sessions/BaseSessionService.html)：Session Service 明确管理 Session 和 Event，并通过追加 Event 更新状态。
- [Anthropic Web Search Tool](https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/web-search-tool)：长时间工具执行可以产生暂停状态，继续时需要保留并回传原工具调用内容和标识。

这些框架的 API 不同，但共同原则可以归纳为：

```text
稳定身份
持久化检查点
事件与状态分离
待处理人工请求可恢复
重试必须幂等
未知结果必须核对，不能猜测
```

## 3. 本项目的恢复链路

```text
AgentRunStore.listRecoverable()
  -> AgentRecoveryCoordinator
  -> CapabilityReceiptPort.lookup(invocationId)
  -> 生成确定性 Recovery Result
  -> 保存新的 Run Event
  -> UI 展示等待、恢复或人工处理状态
```

模型不参与以下判断：

```text
原调用是否已经开始
原调用是否已经完成
是否可以安全重试
待审批请求是否仍然有效
```

## 4. Capability Receipt

Rust Gateway 为每个稳定的 `invocationId` 保存回执：

```text
not-started
  -> started
  -> resolved(result)
```

执行顺序：

```text
原子保存 started
  -> 执行 Capability
  -> 原子保存 resolved(result)
  -> 返回结果
```

如果相同 `invocationId` 再次进入 Gateway：

```text
身份和参数范围一致 + resolved
  -> 重放原结果

身份冲突
  -> 拒绝

只有 started
  -> 返回 outcome-pending，不再次执行
```

当前回执验证稳定身份：

```text
invocationId
capabilityId
contractVersion
workspaceId
inputHash
```

`inputHash` 不由模型或 TypeScript 声明，而是在 Rust Capability Gateway 内计算：

```text
结构化 JSON input
  -> 对象键递归排序
  -> 保留数组顺序和 JSON 标量语义
  -> 添加固定领域前缀
  -> SHA-256
```

因此语义相同但对象键顺序不同的输入可以重放，而字段值、数组顺序或结构变化都会触发
`capability-receipt.identity-conflict`。恢复查询也必须提交原 Capability 身份和原始输入，由宿主重新计算
指纹，不能只凭 `invocationId` 返回结果。

旧版没有 `inputHash` 的回执不会自动迁移或重放。它只能进入核对路径，因为系统无法证明旧结果对应
当前输入。这是安全退化，不是兼容性故障。

## 5. 恢复分类

```text
waiting / approval
  -> awaiting-user
  -> 重新展示原审批，不自动批准

waiting / user-input
  -> awaiting-user

active / planning，无未决 Invocation
  -> recovering / host-interrupted
  -> ready-to-resume

Invocation receipt = resolved
  -> 将结果写回原 Invocation
  -> 不重新调用 Capability

Invocation receipt = not-started
  -> retry-available
  -> 只开放显式重试，不自动重试

Invocation receipt = started 或查询不可用
  -> outcome-unknown
  -> reconciliation-required

Invocation identity = conflict
  -> identity-conflict
  -> reconciliation-required
  -> 阻止自动 Resume 和自动重试
```

`identity-conflict` 与普通 `unavailable` 分开建模。前者表示持久化回执和当前 Invocation 的稳定身份
不一致，属于安全或数据完整性问题；后者才表示宿主暂时无法查询。两者都需要人工核对，但 UI、诊断和
审计必须能区分原因。

## 6. 为什么 Recovery Coordinator 不属于模型

这是确定性控制逻辑：

```text
相同持久化事实
  -> 必须产生相同恢复分类
```

如果让模型决定是否重试，会引入：

```text
重复写入
模型猜测宿主状态
不可复现的恢复行为
无法审计的权限决定
```

因此模型只能在恢复完成后继续规划，不能参与恢复事实判定。

## 7. Resume 与 UI Projection

恢复分类和继续执行是两个不同动作：

```text
recover(runId)
  -> 读取事实
  -> 写入 recovering 状态
  -> 返回 Recovery Result

resume(runId)
  -> 只允许没有未决 Invocation 的 recovering Run
  -> 写入 run.resumed
  -> 返回 active Run
```

`resume()` 不会自动再次调用 Provider 或 Capability。它只把经过核对的 Run 推进到统一的
`active / planning` 边界，再交给 Controller Resume Cursor 继续规划。

显式 Resume 会把无未决 Invocation 的各阶段归一到同一个 Controller 入口：

```text
recovering / preparing
  -> run.resumed
  -> run.prepared
  -> active / planning

recovering / executing
  -> run.resumed
  -> invocations.completed
  -> verification.continue
  -> active / planning

recovering / verifying
  -> run.resumed
  -> verification.continue
  -> active / planning
```

这样 Recovery Coordinator 负责“事实是否已经闭合”，Controller 只负责“从哪个规划轮次继续”。

UI 不应该直接消费内部状态机和 Receipt，而应该消费投影：

```text
awaiting-user
ready-to-resume
retry-available
reconciliation-required
terminal
missing
```

每个投影只暴露一个用户动作：

```text
approve / provide-input / resume / retry / reconcile / dismiss
```

这样 UI 是恢复流程的观察者和动作发起者，不会成为第二个 Agent 控制器。

## 8. 当前实现

```text
TypeScript
  AgentRecoveryCoordinator
  AgentRecoveryResumeError
  recovery-projection
  AgentInvocationReceiptPort
  TauriAgentInvocationReceiptPort
  恢复分类与状态推进

Rust
  CapabilityReceiptStore
  started / resolved 原子回执
  重复调用结果重放
  Tauri receipt lookup command
```

调用入口分离：

```text
workbench_invoke_capability_v1
  -> CapabilityCaller::Ui
  -> 普通 UI 能力调用，不进入 Agent Receipt

workbench_agent_invoke_capability_v1
  -> CapabilityCaller::Agent
  -> 进入 Receipt Store 和幂等执行边界
```

这不是为了让 UI 失去能力，而是为了让宿主能够审计“哪个调用来自 Agent”，并在未来对
Agent 单独应用策略、预算和审批规则。

## 9. Controller Resume Cursor

Controller 恢复时复用持久化的：

```text
Run identity
Workspace scope
Policy / Intent
Run events
Turn records
Invocation records and results
Context projections
```

它不会再次写入：

```text
run.created
run.prepared
```

也不会重新派发状态为 `succeeded` 的 Invocation。恢复入口只接受：

```text
相同 runId
active / planning
```

恢复游标同时读取两类证据：

```text
Turn 快照长度
事件链中的 verification.continue 数量
```

二者取更靠后的边界。原因是旧版本或极端崩溃窗口中，稳定状态事件可能已经落盘，但 Turn
快照尚未包含在最后一次提交里。事件是已经发生的事实，不能因为投影缺失而重复执行一轮。

新的 Controller 会在关键状态事件提交前先更新 Turn 快照，使后续检查点同时包含：

```text
模型决策
校验结果
Turn 状态
Invocation 状态
Run 状态事件
```

如果 Invocation 结果已经持久化，但对应的最小 Context Projection 缺失，Resume Cursor 会从已保存
结果确定性地补建 `capability-result:<invocationId>`。这是恢复投影，不是 Capability 重试。

## 10. 设计分工

```text
Receipt Store
  -> 证明 Capability 到底发生了什么

Recovery Coordinator
  -> 核对事实并把 Run 归一到可继续边界

Resume Cursor
  -> 从已持久化的执行位置继续请求模型

Run State Machine
  -> 约束每一步是否合法并留下可审计事件
```

这四者分开后，恢复路径不依赖模型猜测，也不依赖 UI 内存是否仍然存在。

## 11. 下一步

恢复投影已经通过 First-party UI Plugin 接入右侧面板：

```text
AgentRecoverySession
  -> AgentRecoveryCoordinator
  -> AgentRunStore / Invocation Receipt
  -> AgentRecoveryProjection
  -> AgentRecoveryPanel
```

`AgentRecoverySession` 是应用层适配器。React 组件不读取 Run Store、Receipt 或 Reducer，只能订阅不可变
恢复投影并发起受限动作。浏览器开发宿主会返回结构化 `unavailable`，不会尝试调用 Tauri IPC。

同一宿主会话中，成功执行“准备继续”的 Run 会被标记为已经接管，并从后续面板扫描中过滤。这个标记只存在
于当前进程内存：应用重启后，如果 Run 仍未进入终态，它会再次进入恢复核对。这避免了面板刷新把刚刚恢复为
`active / planning` 的 Run 立刻再次判为宿主中断。

当前按钮语义刻意限定为：

```text
准备继续
  = Recovery Coordinator 将控制状态归一到 active / planning
  != Provider 已重新开始生成
  != Capability 已重新执行
```

恢复面板是已安装但默认不激活的 First-party 插件贡献。用户启停与懒加载已经在
[A5 插件生命周期](agent-a5-plugin-lifecycle-design-v0.1.md)接入；Provider 配置和真正的 Controller Resume
入口仍需后续接入，因此不能把本阶段描述为完整 Agent 执行生命周期已经完成。

## 12. 下一步

```text
1. [已完成] 接入 Agent 插件启用状态与懒加载
2. [下一步] 接入 Provider 配置与 Controller Resume Request Factory
3. [后续] 开始 Proposal / Preview / Approval
4. [原则] 写能力必须使用同一 Invocation Receipt 幂等边界
```
