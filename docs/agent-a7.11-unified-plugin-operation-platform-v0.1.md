# A7.11 统一插件操作平台 v0.1

日期：2026-09-19。

> **历史过渡方案，禁止作为新实现目标。** 2026-09-20 已决定移除 UI 与 Agent 共用的前端
> `ApplicationCapability` 注册、目录和 Gateway 层，改为“类型化直接访问 + 插件工作流”双路径。
> 本文只用于解释现有兼容代码的来源。目标架构、术语和迁移顺序以
> [插件平台、UI 贡献、工作流与固定会话重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)为准。

## 结论

系统只保留一个插件平台：`PluginPlatform`。它拥有插件包身份、启停、生命周期、贡献所有权和当前会话可见性。

`ApplicationCapabilityGateway` 不是第二个插件平台，而是应用操作的唯一执行边界。它消费插件平台生成的只读能力目录，不管理插件，也不保存另一份能力注册状态。

`WorkbenchCommandRouter` 只处理菜单、快捷键、组件按钮、启用状态和 UI scope。它是 UI 适配器，不是业务命令总线，也不是 Agent 工具目录。

```text
PluginPackage
  └─ applicationCapabilities
             ↓ registration / activation / ownership
       PluginPlatform
             ↓ read-only directory
   ApplicationCapabilityGateway
        ┌────┴────┐
   UI caller   Agent caller
        └────┬────┘
      Tauri caller boundary
             ↓
    Rust Capability Gateway
             ↓
 Application Service / Kernel Command Bus
```

## 三个概念为什么不能直接合并

### PluginPlatform

回答“谁提供能力、插件是否启用、能力当前是否存在、ID 属于谁”。它在启动阶段装配贡献，运行期只提供冻结的只读目录。

### ApplicationCapabilityGateway

回答“这个调用者能否调用、合同版本是否匹配、输入输出是否合法、执行结果是否属于本次 Invocation”。它不负责插件安装，也不理解 React UI 或 Agent 状态机。

### WorkbenchCommandRouter

回答“这个界面命令此刻是否可用、快捷键是否命中、应该触发哪个 UI 适配器”。业务命令需要写文档或读取权威事实时，适配器继续调用 Application Capability，不能把 React 回调当作业务实现。

如果把三者合成一个类，会同时混入启动生命周期、UI 临时状态、业务合同和执行恢复，形成更大的耦合。商业级架构需要统一事实源和执行入口，而不是让一个对象承担所有职责。

## 调用者身份

UI 与 Agent 使用同一种 `ApplicationCapabilityInvoker`，但拿到不同的 caller-scoped 实例。上层不能在请求参数中声明或切换自己的身份。

宿主暂时保留两个 Tauri RPC：

- `workbench_invoke_capability_v1` 固定产生 `Ui` 调用者。
- `workbench_agent_invoke_capability_v1` 固定产生 `Agent` 调用者，并持久化幂等回执。

两个 RPC 不是两套业务平台；它们是两个可信入口，最终进入同一个 Rust `capability::invoke`。Agent 的回执恢复语义不能为了表面上的“一个函数”而降级。

## 本次实现

1. Plugin API 升级为 `3.0`。
2. 原 `WorkbenchCapabilityRegistry` 更名为 `WorkbenchFeatureRegistry`。
3. 插件依赖从 `requires.capabilities` 更名为 `requires.hostFeatures`。
4. 插件 SDK 新增 `applicationCapabilities` 贡献。
5. `PluginPlatform` 校验能力合同、所有权和冲突，只暴露激活插件的只读目录。
6. 新增 `brilliant.score` 插件，集中拥有乐谱 Application Capability 合同与输入输出验证器。
7. UI 与 Agent 都通过 `ApplicationCapabilityGateway` 调用宿主。
8. Agent Port 删除具体乐谱能力解码表，不再自行维护第二份执行目录。

## 不变量

- 未启用插件的能力不可调用。
- 一个能力 ID 在当前会话只能有一个插件所有者。
- UI 不能调用 Agent-only 能力。
- Gateway 调用前校验注册、调用者、版本和输入。
- Gateway 调用后校验输出合同和 Invocation 身份。
- 插件验证器异常必须被分类，不能逃逸统一错误边界。
- Agent 状态机、审批、预算、恢复和完成校验仍属于控制面，不能下沉到 PluginPlatform。
- 模型不能直接调用 WorkbenchCommandRouter、Tauri RPC 或 Kernel Command Bus。

## 后续收敛

本次先统一真实执行路径。Agent 的模型工具描述、意图计划、组合能力和完成验证仍有第一方硬编码，下一切片应建立插件提供的 Agent Adapter Registry：它只把已激活的 Application Capability 投影为模型工具和控制面策略，不复制业务执行器。

在该 Registry 完成以前，不继续增加节拍号等具体 Agent 能力，避免把暂存硬编码继续扩大。
