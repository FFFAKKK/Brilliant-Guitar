# AI Agent A7.1 首个用户 Run 设计 v0.1

日期：2026-09-18
状态：已实现首个只读用户闭环
前置：[A6.4 OpenAI Provider Adapter](agent-a6-openai-provider-adapter-design-v0.1.md)

## 1. 这一阶段解决什么

A7.1 不再只验证单独的 Agent 基础设施，而是第一次让用户从 Workbench 中发起一项真实任务：

```text
输入“读取当前乐谱概要”
  -> Agent 判断需要 score.read-summary
  -> 应用执行 Capability
  -> Agent 基于结果完成回答
  -> 控制面验证任务是否真的完成
  -> UI 展示状态和结果
```

当前只开放一个只读 Capability。这样可以先验证完整闭环，再逐步扩大能力面，而不是一次把所有编辑权限交给尚未经过产品验证的 Agent。

## 2. 端到端结构

```text
Agent 助手面板
  -> AgentAssistantSession
  -> AgentPluginRuntime.beginRun()
  -> AgentPluginRunLease
  -> AgentRunController
       -> Context Builder / Toolset Resolver
       -> Provider Port
       -> Decision Validator
       -> Capability Gateway
       -> Completion Verifier
       -> Durable Run Store
  -> AgentAssistantSessionSnapshot
  -> UI Projection
```

这个结构中，模型只负责推理并提出候选动作。Run 的启动、并发、取消、工具范围、参数验证、实际执行、持久化和完成判断都由应用控制面负责。

## 3. 五个主要职责

### 3.1 UI Projection

UI 只消费稳定的投影：

```text
runtime snapshot
session snapshot
start / cancel / refresh / resume
```

组件不知道 OpenAI、Tauri IPC、Run 状态机或 Capability 的内部实现。这样以后更换模型、增加流式输出或移动面板位置时，不需要重写 Agent 核心。

### 3.2 AgentAssistantSession

它是用户任务的应用服务，不是第二套 Agent 状态机。它负责：

```text
校验用户输入和文档前置条件
取得唯一 Run Lease
组装本任务的 policy 和 budget
创建 AgentRunController
将领域 Run 结果投影成用户可理解的状态
```

它不直接访问乐谱内核，不自行解释模型工具调用，也不决定 Capability 是否允许执行。

### 3.3 AgentPluginRuntime

它负责插件级生命周期和运行资源：

```text
插件是否启用
Provider 是否就绪
Recovery 是否阻塞
当前是否已有活动 Run
Provider 切换或插件关闭时中止活动 Run
```

`beginRun()` 返回的 Lease 把 Provider、AbortSignal 和释放动作绑定在一起，确保一次 Run 使用同一份运行资源，并且同一 Runtime 只允许一个活动 Run。

### 3.4 AgentRunController

它是控制面的主循环。每一回合都要经过：

```text
构造最小上下文和工具集
请求 Provider 给出候选决策
验证候选决策
调用 Capability Gateway
记录事件和调用结果
验证是否满足完成条件
```

因此 Provider 返回 `finish` 不等于任务完成；只有 Completion Verifier 接受后，Run 才能进入完成终态。

### 3.5 Capability Gateway

Capability 是模型可使用的业务能力合同。当前 A7.1 只开放：

```text
score.read-summary@1
```

模型看不到 Workbench Client、Session Service、protobuf 或内核对象。它只看到本回合被控制面挑选出来的最小工具描述，并只能提交符合合同的输入。

## 4. 为什么需要 Run Lease

“Provider 已配置”不代表任何地方都可以直接调用它。Run Lease 增加了明确的资源所有权：

```text
取得 Lease
  -> Runtime 标记 running
  -> 其他任务不能并发取得 Lease
  -> cancel 中止同一个 Provider Turn
  -> finally 必须 release
  -> Runtime 回到可运行状态
```

这解决了三个商业产品常见问题：重复点击导致并发任务、切换 Provider 后旧请求继续返回、UI 取消但宿主网络请求仍在运行。

## 5. React 生命周期为什么单独处理

Agent Runtime 和 Assistant Session 是 Workbench 组合根拥有的应用级资源，不是面板组件的临时状态。永久 `dispose()` 会清空监听器并使 Session 不可再次启动。

React StrictMode 在开发环境会额外执行一次 Effect 的 setup、cleanup、setup。如果 cleanup 直接永久销毁同一个应用级对象，第二次 setup 会继续使用已经失效的对象。

当前采用延迟释放协调器：

```text
Effect cleanup
  -> 登记下一个任务中执行 dispose

StrictMode 立即重新 setup
  -> retain 同一资源
  -> 取消待执行的 dispose

真正卸载
  -> 没有后续 retain
  -> 执行永久 dispose
```

这里的重要设计原则是区分：

```text
cancel：结束当前 Run，资源以后仍可复用
dispose：永久结束资源生命周期，不允许再次使用
```

## 6. 错误边界

用户界面不直接展示 Provider、Capability、IPC 或 Durable Store 抛出的原始异常正文。

```text
领域内可恢复失败
  -> Run 状态机中的结构化 failureCode
  -> 稳定的用户文案

控制面基础设施异常
  -> Session 捕获
  -> “Agent 运行服务暂时不可用，请重试”
```

原始供应商响应可能包含未知内容、诊断细节或请求片段，不属于面向用户的产品合同。后续观测系统应记录经过脱敏的结构化错误码，而不是把原始正文塞进 UI。

## 7. 当前产品行为

Agent 插件关闭时，不创建可运行的 Agent 环境；开启后才初始化 Provider 与 Recovery。

当前面板提供：

```text
任务输入
开始和取消
Provider / Model 状态
当前 Run 状态
最终回答
Recovery 任务
刷新状态
```

浏览器开发宿主不会模拟真实 Provider，也不会读取 API Key，而是明确显示“当前宿主无法启动 Agent”。真实模型调用只允许从 Rust/Tauri 宿主发起。

## 8. 与成熟方案的对应关系

这套设计不是照搬某一家 Agent SDK，而是吸收其稳定原则后保留本项目自己的控制面：

- OpenAI Function Calling 的基本往返同样是模型产生函数调用、应用执行函数、再把结果返回模型；其文档也建议减少初始工具数量，并把应用已经知道的参数留在代码侧。
- Anthropic Client Tools 明确由应用执行 `tool_use`，然后返回 `tool_result`。这与“模型提出动作，Capability Gateway 执行动作”一致。
- Microsoft Semantic Kernel 的 Function Invocation Filter 可以检查参数、处理异常、覆盖结果和终止自动调用。它对应本项目 Decision Validator、Capability Gateway 和 Completion Verifier 形成的控制管线。
- Google ADK 将 Event Loop、Resume、Cancel、Runtime Config、Sessions、Events、Observability 和 Evaluation 分开描述。它说明商业 Agent 不只是一次模型请求，而是一套可运行、可取消、可恢复、可观测的系统。

参考：

- [React StrictMode](https://react.dev/reference/react/StrictMode)
- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic Tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Microsoft Semantic Kernel Filters](https://learn.microsoft.com/en-us/semantic-kernel/concepts/enterprise-readiness/filters)
- [Google ADK Agent Runtime](https://adk.dev/runtime/)

## 9. 当前验证

```text
Workbench production typecheck：通过
A7.1 定向测试：6/6
Workbench 全量测试：304/304
StrictMode 延迟释放测试：通过
浏览器开发宿主 UI：通过
页面 console warning/error：无
真实收费请求：未执行
```

## 10. A7.2 建议

下一阶段不应立刻加入写入能力。建议先完成只读交互质量：

```text
流式文本和明确的思考/执行状态
同一面板内的多轮用户消息
结构化 UI issue code
更多音乐只读 Capability
Run 延迟、失败率和 Capability 命中指标
固定任务集的自动化评测
```

当只读任务的正确率、取消、恢复和可观测性稳定后，再进入写入 Proposal、Preview、Approval 和 Commit。这样写入能力建立在已经验证过的控制面上，而不是把风险交给提示词承担。
