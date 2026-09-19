# AI Agent A6.4 OpenAI Provider Adapter 设计 v0.1

日期：2026-09-18
状态：已实现首个非流式真实 Adapter
前置：[A6.3 系统凭据存储](agent-a6-system-credential-design-v0.1.md)

## 1. 这一阶段解决什么

A6.4 第一次把现有 Agent Control Plane 接到真实模型，但不把 Agent 的控制权交给供应商：

```text
Run Controller
  -> 统一 AgentProviderRequest
  -> 最小化 Provider Turn 投影
  -> Tauri IPC
  -> Rust OpenAI Adapter
  -> OpenAI Responses API
  -> 候选 AgentDecision
  -> Decision Validator
  -> Capability 审批与执行
```

OpenAI 只负责推理和提出候选动作。Run 状态、权限、审批、能力执行、完成验证和恢复仍由应用控制面负责。

## 2. 为什么不让模型直接调用内核

供应商的 function call 是模型输出，不是系统授权。两者必须分开：

```text
模型：我建议调用 score.read-summary
控制面：该能力本回合是否开放、合同版本是否匹配、输入是否有效
能力面：通过统一 Capability Gateway 执行
```

因此 Rust Adapter 只把 OpenAI `function_call` 解码成：

```text
callId
capabilityId
contractVersion
input
```

它不会直接访问乐谱 Service，也不会执行 Capability。

## 3. 为什么网络请求放在 Rust

主要原因不是 Rust 比 TypeScript 更适合写 HTTP，而是安全边界：

```text
WebView / TypeScript
  -> 永远拿不到 API Key

Rust Host
  -> 从系统凭据库内部读取
  -> 固定调用 OpenAI HTTPS 端点
  -> 限制请求、响应和超时
```

这样 API Key 不会进入 React state、普通设置、模型上下文、Run 快照或前端日志。

## 4. 最小化 Turn 合同

Provider 不接收整个 Run，也不接收完整应用状态。它只得到完成当回合决策所需的数据：

```text
providerId / modelId
runId / turnId
goal / runState
预算后的 contextItems
versionWarnings
本回合 tool descriptors
maxCalls
timeoutMs / maxOutputTokens
```

内部存储标识、被省略的上下文、Context 估算字段、Toolset hash 和验证函数不会穿过 Provider 边界。

这就是“按职责投影”，不是把一个大对象换一种序列化方式继续传输。

## 5. OpenAI 工具映射

每个 Capability 会被映射成一个本回合临时 function tool。工具名是安全的供应商协议名，真实 `capabilityId` 保存在宿主侧映射表中，模型不能通过伪造工具名绕过目录。

另外暴露两个控制工具：

```text
agent_send_message
  -> 形成 message 候选决策

agent_finish
  -> 形成 finish 候选决策
  -> 最终完成仍需 Completion Verifier
```

不向模型暴露 `cancelled` 完成原因。用户取消属于控制面事实，不能由模型自行宣布。

第一版使用 `tool_choice: required`，避免自由文本和函数调用混杂成含糊协议。Capability 参数暂不依赖供应商完成最终校验，应用内的 Decision Validator 仍是权威验证点。

## 6. Provider 会话与就绪状态

Provider Session 负责控制面健康状态，并在真正 ready 时交出 `AgentProviderPort`：

```text
checking
  -> missing credential -> authentication-required
  -> configured credential -> ready
  -> credential store unavailable -> unavailable/error
```

`ready` 目前表示凭据存在、Adapter 可以发起请求；密钥有效性和模型访问权在首次真实请求时验证。这样设置页不会通过额外收费请求做健康检查。

Runtime 同时要求：

```text
snapshot.status == ready
并且
session.getProvider() != null
```

否则不会允许启动 Run，避免“界面看起来已就绪，但没有模型执行端口”的假状态。

## 7. 取消与超时

仅让 TypeScript Promise 停止等待并不等于取消宿主网络请求。本阶段增加了 Turn 级取消槽：

```text
AbortSignal
  -> Tauri cancel command(runId, turnId)
  -> Rust cancellation registry
  -> tokio::select!
  -> 丢弃 reqwest future
```

取消槽只在请求期间存在，请求完成后立即移除；重复的同 Run/Turn 请求会被拒绝。超时由 Rust HTTP Client 执行，不能由模型扩大。

## 8. 错误分类

供应商细节不会直接泄漏到 Agent 核心。宿主统一分类为：

```text
authentication-required
timeout
rate-limited
model-unavailable
provider-unavailable
request-rejected
response-incomplete
response-invalid
response-too-large
cancelled
```

错误响应正文不会被回传到前端，避免把供应商返回的未知内容、请求片段或诊断细节带入 UI 和日志。

## 9. 商业级防线

当前实现已经具备：

```text
系统凭据库内部取 Key，无明文回读 IPC
固定 Provider 与模型 allowlist
固定 HTTPS 端点
请求大小、响应大小、上下文数和工具数上限
超时和输出 Token 上限
严格 DTO unknown-field 拒绝
调用 ID 去重
控制工具与 Capability 工具禁止混用
供应商工具名到 Capability ID 的宿主侧映射
响应 usage 结构校验
Fake Transport 确定性测试，不产生真实费用
Turn 级宿主取消
```

第一版不自动降级 Provider，也不在认证失败后偷偷换模型。用户选择仍是唯一配置事实。

## 10. 与成熟方案的对应关系

OpenAI Responses API 提供 function calling、工具选择、输出 Token 限制和 usage；本项目只使用它作为模型协议，不采用供应商托管的完整 Agent loop。

原因是本项目已经拥有自己的：

```text
Run 状态机
Capability 合同与审批
Durable Run Store
恢复协调器
完成验证器
插件生命周期
```

如果再让供应商托管整个 Agent，会出现双状态机、双工具执行器和不明确的恢复所有权。

参考：

- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI Models](https://developers.openai.com/api/docs/models)
- [OpenAI API error codes](https://developers.openai.com/api/docs/guides/error-codes)

## 11. 验证结果

```text
Rust Provider、取消、凭据与宿主测试：52/52
Workbench 测试：待最终整体验证
TypeScript production typecheck：通过
真实收费请求：未执行
```

## 12. 下一阶段

A7.1 做第一个可用的端到端助手 Run：

```text
简洁的任务输入
从 AgentPluginRuntime 取得 ready Provider
构造 AgentRunController
执行 score.read-summary 垂直切片
展示消息、审批、运行状态和可恢复失败
```

先让一个真实用户任务完整跑通，再加入流式文本、更多音乐 Capability、Provider 指标与自动化评测。这样每个增强都建立在可验证的产品闭环上。
