# AI Agent A6.1 Provider 基础合同设计 v0.1

日期：2026-09-18
状态：Provider 元数据合同、注册表、控制会话和插件生命周期接入已实现
前置：[A5 插件生命周期](agent-a5-plugin-lifecycle-design-v0.1.md)

## 1. Provider 不是 Agent

Provider 是模型供应边界：

```text
Agent Control Plane
  -> 统一模型请求
  -> Provider Adapter
  -> 具体云端或本地模型
```

Provider 负责协议、认证和模型响应适配，不负责：

```text
选择未经用户批准的 Provider
读取任意应用状态
决定 Capability 权限
直接执行 Capability
宣告 Run 已完成
```

模型返回的工具调用仍然只是候选动作，必须返回 Agent Control Plane 校验。

## 2. 成熟框架中的共同结构

- [OpenAI Agents SDK Models](https://openai.github.io/openai-agents-js/guides/models/) 将具体 `Model` 与按名称解析模型的
  `ModelProvider` 分开，并允许 Runner 使用自定义 Provider。
- [OpenAI Agents SDK Running Agents](https://openai.github.io/openai-agents-js/guides/running-agents/) 把
  `modelProvider` 作为 Runner 配置，而不是工具执行权限的一部分。
- [Microsoft Semantic Kernel AIServiceSelector](https://learn.microsoft.com/en-us/python/api/semantic-kernel/semantic_kernel.services.ai_service_selector.aiserviceselector)
  使用独立服务选择器解析 AI Service 与执行设置。

本项目采用相同的“供应商适配与 Agent 控制分离”原则，但不直接泄漏任何一家 SDK 类型。

## 3. 四个合同

### ProviderDescriptor

描述静态事实：

```text
provider ID
用户可读名称
本地或远端执行
凭据类型
可用模型列表；工具调用、流式输出、结构化输出支持由各模型声明
```

它不包含 API Key，也不表示当前已经连接成功。

### ProviderSelection

用户显式选择：

```text
providerId
modelId
```

第一版不做隐藏路由和自动云端降级。模型不能自行切换 Provider。

### ProviderRegistry

注册已经实现的 Adapter：

```text
register
list
has
createSession(selection)
```

Registry 不持有凭据、不发模型请求、不自动选择备用 Provider。未知 ID 和重复 ID 直接拒绝。

### ProviderSessionPort

描述插件激活期间的 Provider 控制状态：

```text
unconfigured
checking
authentication-required
ready
unavailable
error
```

它提供：

```text
getSnapshot
subscribe
refresh
dispose
```

插件关闭时必须取消订阅并调用 `dispose()`。

## 4. 控制面与执行面再次分离

```text
AgentProviderSessionPort
  -> 配置、认证、连接健康和生命周期

AgentProviderPort.decide()
  -> 接收统一 Turn 请求并返回模型候选决策
```

这两个端口不能合并：

```text
连接失败 != 一次 Turn 生成失败
缺少凭据 != Run 业务失败
插件关闭 != 取消某个模型文本结果
```

控制会话只有进入 `ready`，AgentPluginRuntime 才允许 `canStartRun`。

## 5. 插件生命周期接入

启用插件：

```text
创建 Provider Session
创建 Recovery Session
订阅两者
并行 refresh
聚合为 AgentPluginRuntimeSnapshot
```

关闭插件：

```text
取消 Provider 订阅
dispose Provider Session
取消 Recovery 订阅
回到 disabled
```

初始化中任一工厂或订阅失败时，Runtime 会清理已经创建的资源并进入稳定 `error`，不会留下半激活状态。

## 6. 当前安全边界

当前没有：

```text
明文 API Key 字段
浏览器 localStorage 凭据
真实 Provider HTTP 请求
自动 Provider 切换
供应商 SDK 类型进入 Run Controller
```

默认 `UnconfiguredAgentProviderSession` 让生命周期可以先真实运行，同时明确显示“尚未配置模型 Provider”。

## 7. 已验证行为

```text
Provider 描述与选择使用严格字段白名单
重复 Provider 注册被拒绝
未知 Provider 选择被拒绝
插件关闭时 Provider 被 unsubscribe + dispose
关闭后的旧 Provider 发布无法复活插件
认证缺失保持 configuring
Provider ready 且恢复清空后才允许启动 Run
部分初始化失败会释放已创建资源并进入 error
```

## 8. 后续顺序

### A6.2 非秘密配置（已完成）

```text
持久化 providerId / modelId
不持久化 API Key
设置界面显示数据是否离开本机
没有实现 Adapter 的 Provider 不可选择
```

详见 [A6.2 Provider 非秘密配置设计](agent-a6-provider-configuration-design-v0.1.md)。

### A6.3 系统凭据存储（已完成）

```text
Rust/Tauri 受控命令
操作系统凭据库
前端只获得 credential-present 状态
日志和错误中不得返回秘密
```

详见 [A6.3 系统凭据存储设计](agent-a6-system-credential-design-v0.1.md)。

### A6.4 第一个真实 Adapter（已完成）

```text
宿主侧网络请求或受控代理
统一请求与事件解码
超时、认证、限流、模型不可用错误分类
Token 与时间预算
Provider 只返回候选决策，不执行 Capability
```

真实 Provider 行为评测与 Fake Provider 的确定性控制面测试继续分开。

详见 [A6.4 OpenAI Provider Adapter 设计](agent-a6-openai-provider-adapter-design-v0.1.md)。
