# Agent 插件归属与装配合同方案 v1

日期：2026-09-20\
状态：小阶段设计基线，尚未修改插件平台公共合同\
前置：[插件平台、UI 贡献、工作流与固定会话重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)

## 1. 本阶段结论

Agent 必须作为 `PluginPlatform` 管理的 `product` 插件进入固定会话，但插件平台与 Agent Runtime 的职责不能合并：

```text
PluginPlatform
  负责身份、启用集合、固定会话、授权事实和贡献所有权

Trusted Shell
  根据当前会话 Grant，把宿主实现收窄为类型化端口并完成装配

Agent Plugin
  负责 Provider、Run、工具/工作流执行、预算、审批、回执、恢复和验证
```

Agent 不能再获得整个 `WorkbenchClient`，也不能用自己的 `setEnabled()` 形成第二套插件生命周期。取消 Run 只取消 Run，不停用插件；用户修改启用状态只影响下一次固定会话。

## 2. 当前实现的结构性问题

当前 `WorkbenchApp` 同时承担了平台装配和 Agent 内部装配：

```text
WorkbenchApp
  -> createAgentPluginRuntime(score.client)
  -> createAgentAssistantSession(runtime, score.client, workflows)
```

这会造成四个问题：

1. `AgentPluginRuntime.setEnabled()` 与 `PluginPlatform` 都能决定 Agent 是否运行，生命周期有两个权威来源。
2. Agent 收到完整 `WorkbenchClient`，实际权限大于它声明和使用的权限。
3. Provider、Recovery 和执行服务即使不属于当前插件会话也会先被创建，再依赖设置状态关闭。
4. `applicationSettings.agent.enabled` 被用来驱动运行时，再反向同步插件平台，持久设置和插件会话互相追赶。

此外，当前 `PluginHostServiceGrantV1` 只是冻结的授权记录，不是已经绑定实现的 typed port。平台文档也明确由单独的可信执行适配器解析实现。因此不能把“Grant 已存在”误认为“Agent 已经受到端口级隔离”。

## 3. 目标装配链

```text
restore desired plugin set
  -> PluginStartupController selects this session
  -> PluginPlatform validates Agent manifest and host-service requirements
  -> PluginPlatform freezes Agent grant and marks Agent active
  -> Trusted Shell resolves the frozen grant into AgentPluginHostBindingsV1
  -> Agent plugin assembly creates Provider / Recovery / Assistant services
  -> Agent view consumes the already assembled runtime
```

Agent 未进入当前会话时：

```text
no AgentPluginHostBindingsV1
no Agent Provider session
no Agent Recovery session
no Agent Run controller
no Agent UI contribution in the resolved view set
```

固定会话运行期间不支持热启用、热停用或热卸载，因此不增加 `draining`、`unloading` 或“工作流执行中等待卸载”等状态。

## 4. 最小装配依赖合同

下面的 TypeScript 仅定义目标形状和职责，不表示本阶段已经批准修改公共 SDK：

```ts
interface AgentPluginHostBindingsV1 {
  readonly bindingVersion: 1;
  readonly plugin: Readonly<{
    id: "brilliant.agent.assistant";
    version: string;
  }>;
  readonly provider: AgentProviderHostPort;
  readonly scoreRead: ScoreReadPort;
  readonly scoreChangeSets: ScoreChangeSetPort;
  readonly commit: AgentCapabilityPort;
  readonly runStore: AgentRunStorePort;
  readonly receipts: AgentInvocationReceiptPort | null;
  readonly workflows: WorkflowDirectory;
}
```

合同原则：

- 所有字段都是已经按当前会话授权绑定的具体 typed port，不是字符串 Service Locator。
- Agent 不接收 `WorkbenchClient`、原始 Tauri Bridge、Kernel、凭据存储或 `PluginPlatform` 实例。
- `commit` 暂时保留旧 `AgentCapabilityPort`，仅承载已有 durable receipt、重放和崩溃恢复语义；它不是重新扩展通用 Application Capability 的许可。
- `scoreRead` 和 `scoreChangeSets` 是已经迁移的类型化领域端口。
- `workflows` 是当前固定会话的只读目录，内容由平台冻结，执行权仍在 Agent Runtime。
- Provider 端口只允许查询凭据状态和执行模型请求，永远不返回明文凭据。
- 文档变化通知是 Agent 输出事件，由 Workbench 订阅后刷新 UI，不作为 Agent 可调用的宿主权限。

## 5. Grant 与 Binding 的区别

二者必须分开：

| 概念 | 内容 | 所有者 | 是否包含实现 |
|---|---|---|---|
| `PluginHostServiceGrantV1` | 插件本会话获准使用哪些服务 ID | PluginPlatform | 否 |
| `AgentPluginHostBindingsV1` | 与 Grant 一致的最小 typed port 实例 | Trusted Shell | 是 |

建议的 Agent Host Service ID：

| Service ID | 绑定端口 | 说明 |
|---|---|---|
| `agent.provider` | `AgentProviderHostPort` | 模型请求与凭据状态 |
| `agent.run-store` | `AgentRunStorePort` | Run 持久化 |
| `agent.invocation-receipts` | `AgentInvocationReceiptPort` | 调用回执与恢复 |
| `score.read` | `ScoreReadPort` | 有界类型化读取 |
| `score.change-set` | `ScoreChangeSetPort` | prepare 与审批预览 |
| `score.commit` | 过渡提交端口 | 保留 durable commit 语义 |
| `workflow.directory` | `WorkflowDirectory` | 当前会话工作流目录 |

这些名字需要由插件平台负责人统一确认。Agent 分支不能私自把它们写进 Manifest 或平台 Registry。

## 6. Agent Runtime 状态机修订

插件生命周期状态与 Agent 执行状态必须分离。

插件生命周期由平台持有：

```text
configured -> selected -> active | failed
```

Agent Runtime 只在 `active` 后创建，内部状态建议为：

```text
initializing
  -> configuring
  -> ready
  -> running
  -> recovering
  -> unavailable
  -> error
  -> disposed
```

需要删除的语义：

- Agent Runtime 自己的 `disabled` 生命周期状态。
- Agent Runtime 对外公开的 `setEnabled(boolean)`。
- “关闭插件会取消 Run”的运行时分支。固定会话不允许在运行中关闭插件。

需要保留的语义：

- Provider 配置和热切换。
- 单 Run lease。
- Run 取消和 `AbortSignal`。
- Recovery 阻塞新 Run。
- Provider/Recovery 资源在应用退出或组合根销毁时释放。

## 7. Trusted Shell 的装配职责

`WorkbenchApp` 不应继续手工知道 Agent 的全部内部构造过程。目标是由一个 Agent 插件装配入口接收 scoped bindings：

```ts
createAgentPluginSession({
  bindings,
  providerSelection,
  onDocumentChanged,
});
```

装配入口内部创建：

- `AgentPluginRuntime`
- `AgentAssistantSession`
- Direct Tool Adapter
- Workflow Runtime/Action Runtime
- Recovery coordinator

`WorkbenchApp` 只负责：

1. 查询本次固定会话是否包含 Agent。
2. 请求 Trusted Shell 为 Agent 解析 bindings。
3. 把 Provider 选择等用户配置交给 Agent 插件。
4. 订阅 Agent 输出事件并刷新界面投影。
5. 在应用销毁时释放整个 Agent 插件会话。

## 8. 设置与启用状态

`applicationSettings.agent.enabled` 不能继续作为运行时生命周期权威。迁移完成后：

- 插件启用偏好只由插件激活存储维护。
- 当前会话是否启用只读 `PluginSessionPlanV1` / `PluginRuntimeInfo.active`。
- 设置页开关显示 `nextLaunchActive`，变更后显示需要重启。
- `agent.providerSelection` 仍属于 Agent 插件设置，不属于平台生命周期。
- 旧 `agent.enabled` 只允许作为一次性迁移输入，迁移后删除。

当前浏览器入口存在“先 `start()`、后恢复启用配置”的已知问题。若不先修复启动顺序，Agent 即使按本方案移除自己的启停权威，也无法稳定进入当前会话。因此启动接线是本阶段的硬前置，不是 Agent 内部可以绕过的问题。

## 9. 分阶段实施

### 阶段 1：Agent 内部收窄

- 新增单一 Agent 插件装配入口。
- 用明确 bindings 代替完整 `WorkbenchClient`。
- 保留旧 commit adapter，但标注为过渡依赖。
- 为“未装配时不创建 Provider/Recovery”增加测试。

这一阶段可以在 Agent 分支完成，但真正调用装配入口仍需平台提供当前会话和绑定结果。

### 阶段 2：平台公共合同

- Agent Manifest 声明 Host Service requirements。
- Trusted Shell 新增按 `pluginId + frozen grant` 解析 typed bindings 的入口。
- Resolver 必须逐字段校验 Grant，不允许返回原始 Client 或通用 Service Locator。
- 插件平台启动链先恢复启用意图，再冻结当前会话。

这是跨模块公共合同变化，实施前必须由用户确认，并交由插件平台任务主责。

### 阶段 3：移除双重生命周期

- 删除 `AgentPluginRuntime.setEnabled()` 和 `disabled` 状态。
- 删除 `WorkbenchApp` 中设置状态驱动 Runtime、Runtime 反向同步平台的两个 Effect。
- 设置页启用开关改读平台的 `nextLaunchActive/restartRequired`。
- Agent 不在当前会话时，不创建任何 Agent 执行对象。

### 阶段 4：兼容层退出

- durable commit 获得独立 typed port 后，删除旧 `AgentCapabilityPort` commit 适配。
- 删除 `ApplicationCapabilityInvoker` 在 Agent 装配合同中的最后依赖。
- 删除旧 `applicationSettings.agent.enabled` 迁移字段。

## 10. 验收标准

- `PluginPlatform` 是 Agent 当前会话归属的唯一权威。
- Agent 未激活时 Provider、Recovery、Store 和 Assistant factory 调用次数均为零。
- Agent 代码无法访问完整 `WorkbenchClient`、原始 Kernel 或任意 Tauri command。
- bindings 中每个端口都能追溯到 frozen grant 中对应的 Service ID。
- 用户取消任务只中止当前 Run，插件仍保持 active。
- 用户修改启用状态只改变下一次启动计划，当前会话不变。
- Provider 切换不重建 Recovery session。
- 旧 commit receipt、重放、恢复和不确定结果处理测试保持通过。
- 工作流仍按原插件所有者注册；Agent 只消费统一只读目录，不接管工作流所有权。

## 11. 本阶段明确不做

- 不实现 Workflow IR 或低代码工作流编辑器。
- 不新增音乐领域工具或字段级工具。
- 不修改 Score 领域端口和 Kernel 事务。
- 不实现热插拔、热卸载或运行中插件切换。
- 不让 Agent 分支私自修改插件平台的 Manifest、Grant、启动或 Resolver 公共合同。

## 12. 需要用户确认的跨模块决策

继续代码迁移前，需要确认由插件平台任务实现以下公共变化：

1. 修复启动顺序，使持久启用意图在 `PluginPlatform.start()` 前恢复。
2. 为 Trusted Shell 增加从 frozen grant 到 typed bindings 的受控解析入口。
3. 允许 Agent Manifest 声明本方案中的 Host Service requirements。
4. 设置页的插件启用开关改由平台激活存储负责，旧 `agent.enabled` 只做迁移。

确认后，Agent 分支负责阶段 1 和阶段 3；插件平台任务负责阶段 2。双方通过稳定合同协作，不互相修改对方的内部状态机。
