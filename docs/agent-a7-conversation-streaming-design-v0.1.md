# AI Agent A7.2 Conversation 与流式事件设计 v0.1

日期：2026-09-18
状态：A7.2a-f 已实现，尚未执行真实收费 Provider 请求
前置：[A7.1 首个用户 Run](agent-a7-first-user-run-design-v0.1.md)

## 1. 这一阶段先解决对象边界

现在的 `AgentAssistantSessionSnapshot` 只有一个 `goal` 和一个 `response`，适合证明首个闭环，但不能直接承载多轮对话、流式文本、工具进度和重试。

不能简单把 `response: string` 改成不断追加的字符串。商业 Agent 至少要区分：

```text
Conversation  用户看到的一段连续协作
Submission    用户的一次提交
Run           为完成一次提交而进行的一次受控执行
Provider Turn Run 内部的一次模型决策回合
Message       用户可见的稳定内容
Activity      用户可见的执行进度，不是模型隐藏推理
```

本项目已经使用 `Turn` 表示 Run 内部的模型决策回合，所以对话层使用 `Submission`，避免把“用户发了一句话”和“控制面请求了一次模型决策”混为一谈。

## 2. 为什么 Conversation 不能代替 Run

Conversation 是产品交互容器，Run 是控制面执行单位。它们生命周期不同：

```text
一个 Conversation
  -> 多个 Submission
  -> 每个 Submission 对应一个 Run
  -> 每个 Run 可以包含多个 Provider Turn 和 Capability Invocation
```

Conversation 可以持续很久，但 Run 必须有明确的开始、终态、取消、预算和恢复语义。若把整个对话做成一个永不结束的 Run，将很难回答：

```text
本次任务何时完成
哪个请求被取消
哪次失败可以重试
费用和延迟属于哪项用户目标
崩溃后应该恢复哪一步
```

因此多轮 UX 不会删除 Run 状态机，而是在它上面增加一层轻量的 Conversation 投影。

## 3. 建议的 Conversation 合同

```text
AgentConversationSnapshot
  conversationId
  messages[]
  activities[]
  activeSubmissionId?
  activeRunId?
  composer
  issue?
```

### 3.1 Message

```text
AgentConversationMessage
  messageId
  submissionId
  runId?
  role: user | assistant
  status: pending | streaming | completed | failed | cancelled
  content
  createdAt
```

Message 是用户可见内容，不保存隐藏推理，也不承载 Capability 权限事实。

### 3.2 Activity

```text
AgentConversationActivity
  activityId
  submissionId
  runId
  kind: planning | reading | validating | waiting | recovering
  status: active | completed | failed | cancelled
  label
```

Activity 只表达可验证的工作阶段，例如“正在读取乐谱概要”和“正在验证结果”。它不展示模型 chain-of-thought，也不把供应商特有事件名暴露给 UI。

### 3.3 Issue

```text
AgentConversationIssue
  code
  scope: conversation | submission | run | provider | capability
  retryable
  message
```

UI 使用稳定的 issue code 决定是否显示重试、设置或恢复入口；原始 Provider 错误正文不进入合同。

## 4. 对话记录不是权威上下文

消息列表用于帮助用户理解协作过程，但不能原样成为下一次模型请求的全部上下文。

原因是：

```text
历史消息可能很长
旧回答可能已经过时
模型回答不是乐谱事实
工具结果可能包含只在旧版本成立的数据
消息中可能出现提示注入内容
```

下一次 Run 仍通过 Context Builder 构造上下文：

```text
当前用户 Submission
  + 当前权威乐谱事实
  + 经过预算和版本检查的历史任务摘要
  + 本回合最小 Toolset
```

Conversation history 只能作为一个可降级的上下文来源，不能越过 Capability 读取权威数据，也不能扩大工具权限。

## 5. 流式输出需要两层事件

供应商事件和产品事件必须分开。

### 5.1 Provider Stream Event

Provider Adapter 负责把 OpenAI、Anthropic 或其他供应商的 SSE/WebSocket 事件归一化：

```text
response-started
text-delta
tool-input-delta
usage-updated
response-completed
response-failed
```

这些事件属于协议适配层，不直接进入 React 组件。

### 5.2 Agent Progress Event

Run Controller 只向上层发布供应商无关的进度：

```text
message-started
message-text-delta
activity-started
activity-completed
message-completed
run-waiting
run-failed
```

这样更换 Provider 不会改变 UI 合同，Provider 新增未知事件时也不会破坏产品状态。

当前已经落实为两道边界：

```text
Provider Stream Reducer
  -> 校验 response.started、连续 sequence、Run/Turn 身份和终态

Run Progress Observer
  -> 只发布稳定的 Message / Activity 事件
  -> 不发布原始 tool-input-delta
  -> Observer 失败不改变权威 Run 结果
```

UI 接线增加第三道纯投影边界：

```text
Run Progress Event
  -> Conversation Progress Projector
  -> Conversation Reducer
  -> AgentAssistantSession Snapshot
  -> UI
```

Projector 只翻译稳定的产品事件。`message.completed` 只能校正当前可见草稿，不能结束
Submission；`message.failed` 与 `message.cancelled` 也不能越过权威 Run Outcome 修改最终状态。

## 6. 最终决策仍然由 Promise 返回

建议保持现有控制流：

```text
provider.decide(request, signal, observer?)
  -> observer 接收非权威进度事件
  -> Promise 最终返回完整 AgentDecision
```

流式事件用于降低感知延迟，但不是最终事实。完整 Decision 返回后仍要经过 Decision Validator。

这比让 UI 或 Controller 自己拼供应商 JSON 更稳定，也让不支持流式的 Provider 继续实现同一个端口。

## 7. 流式工具参数绝不能边到边执行

工具参数的增量片段可能是不完整或非法 JSON：

```text
tool-input-delta
  -> 只在 Provider Adapter 内累积
  -> 收到完整结束事件
  -> 解析为候选 AgentDecision
  -> Decision Validator 校验
  -> Capability Gateway 执行
```

UI 可以显示“正在规划操作”，但不能根据部分工具参数提前显示确定性预览，更不能调用 Capability。

## 8. 持久化策略

不建议把每个文本 token 都写入 Durable Run Store：

```text
高频 delta
  -> 内存中的临时 UI 投影

完整 Message
  -> 完成后持久化

关键 Activity / Run 状态
  -> 作为粗粒度事件持久化
```

如果进程在流式文本中途退出，部分文本可以丢失；控制面根据最后一个 Durable Run 检查点恢复。不能为了保住几个字而把状态存储变成高频日志系统。

## 9. 取消与失败语义

```text
用户取消
  -> AbortSignal 中止 Provider
  -> 活动 Message 标为 cancelled
  -> 已完成的 Capability 结果仍按 Receipt 语义处理

流中断但没有完整 Decision
  -> 不能执行工具
  -> Run 进入 provider-failed 或可恢复状态

文本已流出但完成验证失败
  -> 文本不能标记为 completed
  -> UI 明确显示失败或等待状态
```

已经显示给用户的流式草稿和最终通过验证的回答必须具有不同状态，不能因为“屏幕上出现过文字”就宣布任务成功。

## 10. UI 设计原则

首版 Conversation UI 保持安静、紧凑：

```text
用户消息
助手消息
一行可折叠 Activity
底部输入区
停止按钮
必要时出现重试或恢复操作
```

不显示 token 级日志、原始工具 JSON、供应商事件名或隐藏推理。普通用户看到“现在在做什么”和“最后得到什么”，开发诊断进入独立的结构化观测面。

## 11. 与成熟方案的对应关系

- OpenAI Responses API 使用具有明确类型的语义流事件，例如文本 delta 和 response completed；本项目在 Provider 层接收这些事件，再投影为供应商无关的产品事件。
- Anthropic Streaming 将消息、content block、delta 和 stop 分层，并明确工具输入 delta 是 partial JSON；这支持本项目“完整累积并校验后才能执行”的规则。
- Microsoft Semantic Kernel 将 chat history 作为用户、助手、工具和系统消息的记录，同时提供 history reduction；这说明对话连续性和上下文预算需要同时设计。
- Microsoft Agent Architecture 区分服务端持有状态的 Agent Thread 与应用本地管理历史的 Agent。第一版继续由应用本地拥有 Conversation，避免供应商锁定和双重状态所有权。

参考：

- [OpenAI Streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Anthropic Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Microsoft Semantic Kernel Chat History](https://learn.microsoft.com/en-us/semantic-kernel/concepts/ai-services/chat-completion/chat-history)
- [Microsoft Semantic Kernel Agent Architecture](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture)

## 12. 实施顺序

```text
A7.2a Conversation / Message / Activity / Issue 合同与 reducer（已完成）
A7.2b Fake Provider 流式事件和确定性测试（已完成）
A7.2c Run Controller progress observer（已完成）
A7.2d UI 消息列表和活动状态（已完成）
A7.2e Rust OpenAI SSE Adapter（已完成）
A7.2f 对话历史预算与任务摘要（已完成）
```

先用 Fake Provider 证明事件顺序、取消和失败语义，再接真实 SSE。这样测试失败时能够区分控制面问题和供应商协议问题，也不会产生真实请求费用。

## 13. A7.2a-f 验证

```text
Conversation reducer 场景测试：6/6
Provider Stream 与 Progress 定向测试：6/6
Progress -> Conversation 投影测试：2/2
A7.2f 新增历史场景测试：8/8
Workbench 全量测试：327/327
Desktop Rust 全量测试：55/55
Production typecheck：通过
Production build：通过
紧凑右侧 flyout：浏览器人工验证通过
真实 Provider 请求：未执行
```

当前实现已验证：流式文本拼接、可见 Activity 生命周期、结构化失败、取消后新 Submission、迟到旧 Run 事件隔离、Submission/Run 标识不可复用、Provider 流乱序与跨 Turn 拒绝、工具参数碎片隔离、Progress Observer 故障不影响权威 Run，以及完成/失败/取消任务的历史投影和预算边界。

UI 已经显示多轮 Message、每次 Submission 的 Activity 和结构化 Issue。浏览器宿主继续明确显示
Provider 不可用，不模拟真实模型；真实 SSE 已在 A7.2e 通过 Rust Provider Adapter 接入，当前仅使用
录制事件与 Fake Transport 验证，没有发送真实收费请求。

## 14. A7.2e OpenAI SSE Adapter

真实桌面 Provider 现在使用以下边界：

```text
OpenAI Responses SSE
  -> OpenAiSseDecoder
  -> AgentProviderStreamEventV1
  -> Tauri Channel
  -> WorkbenchClient validation
  -> OpenAiAgentProvider stream reducer
  -> Run Controller progress observer
```

Rust 请求显式启用 `stream: true`。SSE Decoder 支持任意网络 chunk 边界、LF/CRLF 分帧、未知事件忽略、
总字节上限和完整终态检查。它只向上投影：

```text
response.started
response.text-delta
response.tool-input-delta
response.usage
response.completed
response.failed
```

`response.completed` 中的完整 Response 仍由现有 Decision Decoder 解析。Capability 参数即使已经通过
Channel 到达 TypeScript，也不会被 Run Controller 执行或暴露给 UI；只有完整 Response 中的完整 JSON
经过 Decision Validator 后才能成为候选调用。

Tauri Channel 是非权威进度通道。WebView 关闭、Channel 发送失败或 UI Observer 抛错都不能改变最终
Provider 请求；取消仍通过 Run/Turn 精确绑定的 cancellation registry 完成。

当前 OpenAI 决策协议使用 `tool_choice: required`，用户可见回答通常位于 `agent_send_message` 或
`agent_finish` 的函数参数中。为了不把未闭合 JSON 当作回答展示，这些参数碎片不会转成文本 delta；
第一版会流式显示可靠 Activity，并在完整 Decision 校验后显示最终回答。后续若要实现真正的逐字回答，
需要为“用户可见文本”和“候选动作”设计独立的双通道输出合同，而不是放宽工具参数安全规则。

## 15. A7.2f 任务历史摘要与预算

多轮 UI 对话和模型上下文现在是两个不同对象：

```text
Conversation
  -> 面向用户的完整 Message / Activity / Issue

Authoritative Run Outcome
  -> Task History Entry
  -> AgentContextItem(kind = task-history)
  -> Context Builder
  -> Provider
```

不能直接把 Conversation 消息列表传给模型。UI 中可能包含流式草稿、取消前文本、展示标签和未来的交互
组件；这些内容并不都具有控制面权威性，也没有独立的 token、版本和信任等级。Task History 只保留完成
后仍有用的最小信息：任务目标、稳定结果或失败分类、Run/Submission 身份，以及 Workspace、文档 ID 和版本。

历史写入规则：

```text
completed  -> 保存裁剪后的 goal、最终 response、文档版本
failed     -> 保存稳定 failureCode，不保存 response 或流式草稿
cancelled  -> 不进入历史
waiting / recovering / 基础设施异常 -> 不进入历史
```

每条历史投影都使用 `trustLevel: derived` 和 `priority: low`。它不能覆盖当前用户目标、Run 状态、Workspace
范围或权威 Capability 结果。目标和回答还具有单条长度上限，Session 的内存历史也有独立保留上限，避免
长时间运行后无界增长。

隐式历史只允许在同一 `workspaceId + documentId` 内流动。切换作品后，旧作品摘要不会自动进入新作品的
模型上下文；未来若要比较多个作品，必须通过显式选择和检索 Capability 建立范围与授权。

`ContextBuilder` 现在按以下顺序处理历史：

```text
过期与非法估算过滤
  -> 去重
  -> historyTurnBudget 仅保留最近 N 个任务回合
  -> required / high / normal / low 优先级排序
  -> itemCountBudget 与 tokenBudget
  -> 文档版本警告
```

历史条目保留原始 `documentId` 和 `documentVersion`。当用户继续编辑乐谱后，旧任务摘要仍可提供对话连续
性，但 Context Builder 会产生 `version-mismatch`；模型必须把它理解为旧版本结论，而不是当前事实。

当前第一版历史属于 Session 内存投影，没有写入 Durable Run Store。下一阶段若需要跨应用重启的长期
记忆，应新增独立的 Conversation/Memory Store、迁移版本和删除策略，而不是把历史偷偷附加到单个 Run
记录中。
