# 插件平台、UI 贡献、工作流与固定会话重构方案 v1

日期：2026-09-20。
状态：**目标架构与迁移依据**。当本文与 A7.11 或更早的“统一 Application Capability”方案冲突时，以本文为准。

## 1. 为什么重新规划

最初引入 `ApplicationCapability` 的动机是正确的：UI、Agent 和自动化不应该各自复制一份乐谱业务逻辑。A7.11 因此让 UI 与 Agent 共同经过：

```text
applicationCapabilities
  -> ApplicationCapabilityDirectory
  -> ApplicationCapabilityGateway
  -> Rust Capability Gateway
  -> Application Service / Kernel
```

这个方案解决了早期的重复合同和 Agent 任意调用问题，但继续扩展后出现了结构性问题：

1. UI 与 Agent 的控制需求不同。UI 已经处在可信交互流程中，通常只需要类型化调用、错误处理和版本约束；Agent 还需要工具暴露、预算、审批、回执、恢复和完成校验。
2. 为了共用 Gateway，普通 UI 调用也被迫理解 `caller`、Capability ID、合同版本和通用 Invocation 包装。
3. Agent 业务逐渐被拆成大量细小 Capability，模型工具、控制面计划和具体音乐功能开始互相耦合。
4. 插件平台既有 UI、乐器、播放和 Kernel Module 贡献，又出现一套全局 Application Capability 目录，平台职责开始向业务执行器膨胀。
5. 现有 UI 到 `WorkbenchClient`、Rust `ScoreSessionService` 和 Kernel 的类型化路径本来已经成立，再套一层通用 Gateway 并没有消除业务逻辑，只增加了适配和审计面。
6. 插件平台已经采用固定会话，运行中插件卸载是不可达状态，因此没有必要为工作流热注销设计 `draining` 等生命周期。

因此本次优化不是放弃“业务逻辑只实现一次”，而是改变共享位置：

> UI、Agent 直接工具和工作流不再共享一个前端通用 Application Capability Gateway；它们在类型化领域服务、Rust Application Service 和 Kernel 事务语义处汇合。

## 2. “去掉 Application 层”的准确含义

本文所说的“去掉 Application 层”，专指逐步移除当前前端兼容层：

- `ApplicationCapabilityContribution`
- `ApplicationCapabilityDirectory`
- `ApplicationCapabilityGateway`
- 插件 SDK 的 `applicationCapabilities`
- UI/Agent 共用的 `ApplicationCapabilityInvoker`
- 依赖 `callers: ["ui", "agent"]` 区分权限的通用调用入口

本文**不删除**以下权威层：

- Rust `ScoreSessionService` 等 Application Service
- Tauri 的可信进程边界
- Kernel Command Bus、查询、事务和撤销历史
- 文档 ID、文档版本、请求 ID、幂等和输入输出校验
- Agent 的审批、恢复、预算、回执与完成校验

这里删除的是重复的前端通用包装层，不是删除应用服务设计。

## 3. 两种执行方式

优化后的系统只有两种对业务能力的使用方式。

### 3.1 直接访问

适合单次、确定、已经有明确交互上下文的操作：

```text
First-party UI / Product Plugin
  -> scoped typed domain port
  -> WorkbenchClient / typed Tauri boundary
  -> Rust Application Service
  -> Kernel
```

“直接”不表示裸调 Kernel，也不表示插件可以任意调用 Tauri。它表示调用方使用平台授予的类型化、最小权限领域端口，例如只读乐谱端口或受版本约束的编辑端口。

第三方插件只能得到 Manifest 声明、等级允许且用户授权的 scoped facade。句柄不接受任意插件 ID、任意 Tauri command 或原始 Kernel 对象。

### 3.2 工作流访问

适合多步骤、需要组合、审批、暂停恢复或用户自定义的任务：

```text
Agent / Future Automation
  -> WorkflowDirectory
  -> WorkflowRuntime
  -> workflow-scoped typed ports
  -> Rust Application Service
  -> Kernel
```

工作流负责组织步骤，控制面负责预算、权限、审批、恢复和验证。模型只能提出意图或选择已暴露入口，不能自己拼接 Tauri 请求或直接执行 Kernel 命令。

Agent 可以有两类工具：

- **Direct Tool Adapter**：把一个受控的类型化领域方法投影为模型工具，适合简单查询或原子动作。
- **Workflow Tool Adapter**：调用一个插件注册的聚合工作流，适合多步骤任务。

Direct Tool Adapter 是 Agent 控制面的适配器，不是恢复 `ApplicationCapabilityGateway` 的另一种命名。

## 4. 目标架构

```text
Trusted Shell
  └─ PluginPlatform
      ├─ UI Contribution Host
      ├─ Workflow Directory
      ├─ Instrument / Playback Contributions
      ├─ Kernel Assembly Plan
      └─ Scoped Host Service Grants

UI Command / View
  -> typed domain port ----------------------┐
                                             │
Agent Direct Tool -> typed tool adapter -----┼-> Rust Application Service -> Kernel
                                             │
Agent Workflow -> WorkflowRuntime -----------┘
```

关键点：

- 系统只有一个 `PluginPlatform`，负责身份、生命周期、贡献所有权、权限上限、启动计划、冲突和诊断。
- PluginPlatform 不成为统一业务命令总线，也不执行工作流。
- 不再建立一个全局 Operation/Application Capability Directory 供 UI 与 Agent 共同调用。
- 类型化领域端口由可信宿主提供；插件平台只根据插件身份发放受限句柄。
- Workflow Runtime 集中，工作流所有权分散在各领域插件。
- UI Command Router 只处理菜单、快捷键、焦点、scope 和 enabled 状态，不承担业务执行与 Agent 工具发现。

## 5. 为什么这样更简单

### 5.1 共享业务语义，不共享所有调用机械

UI 与 Agent 都遵守同一份后端事务和领域规则，但 UI 不需要承担 Agent 的 Invocation、审批、回执和恢复协议。Agent 需要的额外控制留在 Agent Runtime。

### 5.2 插件平台只管理贡献，不吞并业务层

平台知道“谁贡献了什么、是否进入本次会话、可以获得哪些宿主端口”，但不知道“如何修改一个具体节拍号”。领域知识留在领域插件、Application Service 和 Kernel。

### 5.3 工作流按业务粒度聚合

一个领域插件可以一次注册多个工作流，不需要“一个工作流一个插件”，也不需要一个巨型插件拥有所有领域流程。例如乐谱插件可以注册：

- `score.inspect`
- `score.edit-metadata`
- 以后新增的和声分析或排版工作流

工作流内部可以复用相同的类型化服务方法。模型看到的是任务级入口，不是所有 prepare、commit 和内部查询。

### 5.4 固定会话消除热卸载复杂度

插件集合在启动时确定，运行期间不可改变。Workflow Runtime 不需要处理定义运行中消失、所有者热替换或依赖被卸载。

## 6. 插件与 UI 的边界

UI 应尽可能模块化为 `product` 插件，但以下 Trusted Shell 能力不能交给普通插件替换：

- 启动中心和固定会话装配
- 根错误边界和安全模式
- 插件签名、完整性与 Manifest 捕获
- 权限策略最终裁决
- Agent 批准确认外壳和最终确认控件
- 平台自身的生命周期与诊断根通道

可以插件化的 UI 包括：

- View、Panel、Dock Item
- Command、菜单项和快捷键绑定
- Component Extension
- 记谱交互适配器
- 乐器控制和播放输出
- 业务对话框内容

批准内容可以由领域插件贡献，但批准外壳、确认动作和审计写入必须由可信宿主持有，防止插件伪造确认界面。

## 7. 插件作者接口如何避免膨胀

插件作者仍然只使用一个 `definePlugin()` 入口。贡献按命名空间分组，而不是要求插件到多个平台分别注册：

```ts
definePlugin({
  id: "brilliant.score",
  tier: "product",
  requires: {
    hostServices: ["score.read", "score.edit"],
  },
  contributes: {
    ui: {
      views: [],
      commands: [],
      extensions: [],
    },
    workflows: [],
    instruments: [],
    playbackOutputs: [],
    kernelModules: [],
  },
});
```

这是目标作者体验，不要求一次性修改当前 SDK 形状。平台内部仍使用职责独立的目录，但插件只提交一个包。

注意：不新增一个全局 `operations` 贡献点作为 `applicationCapabilities` 的换名版本。直接访问通过类型化 Host Service Port；工作流步骤通过 `WorkflowRuntimeContext` 中的受限端口绑定。将来的低代码 Workflow IR 使用启动时验证和绑定的符号步骤，不获得任意函数或脚本执行权。

## 8. 工作流注册和所有权

领域插件提交多个 `WorkflowContribution`，`PluginPlatform` 生成统一只读 `WorkflowDirectory`：

```text
brilliant.score
  ├─ score.inspect
  └─ score.edit-metadata

brilliant.guitar
  ├─ guitar.generate-fingering
  └─ guitar.check-playability
```

每个注册项保存：

- `workflowId`
- `contractVersion`
- `ownerPluginId`
- `ownerPluginVersion`
- runtime 类型
- 输入输出合同和所需 Host Service 权限

Agent 查询一个统一目录，但定义仍归原领域插件所有。不存在“把一个工作流插件注入另一个总工作流插件”的嵌套生命周期。

## 9. 固定会话生命周期

```text
configuring
  -> restore desired plugin set
  -> validate manifests and contributions
  -> create immutable session plan
  -> running
```

进入 `running` 后：

- 禁止注册、安装、卸载、启用、停用和升级当前插件集合。
- 用户操作只写入下一次启动计划，并设置 `restartRequired`。
- 当前 UI、Workflow Directory、Host Service Grants 和 Kernel Assembly 不变。
- 不实现热注销、热替换和 `draining`。

跨进程恢复不是热卸载问题。Run 必须固定工作流 ID、合同版本、所有者插件和所有者版本；重启后不匹配就拒绝恢复。

## 10. 安全等级与实际权限

插件等级保持：

1. `system`：平台基础设施，强制随产品装配。
2. `product`：官方业务插件，可以贡献业务 UI、工作流和受信任模块。
3. `third-party`：只能使用声明并获准的贡献点、声明式工作流节点和 scoped host ports。

等级只定义权限上限：

```text
effective grants
  = tier allowlist
  ∩ manifest requirements
  ∩ user grants
  ∩ current session policy
```

禁止 `host.all-access`。第三方插件不能获得原始 Kernel、任意 Tauri IPC、其他插件设置、凭据存储或插件管理权。

## 11. 三条实际调用链

### UI 直接调用

```text
Button / Command
  -> UI Controller
  -> ScoreReadPort / ScoreEditPort
  -> typed Tauri API
  -> ScoreSessionService
  -> Kernel
```

### Agent 直接工具

```text
Model intent
  -> Toolset Resolver
  -> Direct Tool Adapter
  -> Agent policy / version / receipt boundary
  -> typed domain port
  -> ScoreSessionService
  -> Kernel
```

### Agent 工作流

```text
Model intent
  -> Workflow Tool Adapter
  -> WorkflowRuntime
  -> approval / input / checkpoint / verify
  -> workflow-scoped typed domain ports
  -> ScoreSessionService
  -> Kernel
```

三条链路共享后端事实和事务，不共享一整套前端调用包装。

## 12. 从当前代码迁移

当前 `applicationCapabilities`、`ApplicationCapabilityGateway` 和两个通用 Capability RPC 属于过渡实现。迁移必须渐进完成，不能先删除再重建。

| 当前结构 | 目标结构 | 处理方式 |
|---|---|---|
| `ApplicationCapabilityContribution` | 类型化领域端口合同或 Workflow 定义 | 按调用场景拆分 |
| `ApplicationCapabilityDirectory` | 无全局替代物 | UI 走端口，Agent 查工具或工作流目录 |
| `ApplicationCapabilityGateway` | typed client + Agent adapter | 消费方迁完后删除 |
| `callers: ["ui", "agent"]` | 宿主发放的 scoped port + Agent policy | 删除调用者自报模型 |
| `WorkbenchAgentCapabilityPort` | Direct Tool Adapter / Workflow Adapter | 保留恢复语义，改变业务入口 |
| 通用 capability Tauri RPC | 类型化 Tauri API；Agent 适配器保存回执 | 逐能力迁移 |
| Rust Application Service | 保留 | 继续作为权威用例和事务边界 |
| Kernel Command Bus / Query | 保留 | 继续持有领域规则与事实 |
| `WorkbenchCommandRouter` | 保留为 UI 交互路由 | 不成为业务总线 |

## 13. 实施阶段

### 阶段 A：文档和边界冻结

- 将本文设为目标架构。
- 把 A7.11 标为历史过渡方案。
- 暂停向 `applicationCapabilities` 增加新业务能力。

### 阶段 B：类型化直接端口

- 从现有 `WorkbenchClient` 和专用 Client 中整理 `ScoreReadPort`、`ScoreEditPort` 等最小接口。
- UI Controller 和第一方 UI 插件直接依赖这些端口。
- 平台根据插件身份提供 scoped host context，不暴露完整 Client。

### 阶段 C：Workflow Runtime Context

- 为 Workflow Runtime 定义版本化、最小权限的 `WorkflowRuntimeContext`。
- 将 `score.edit-metadata` 的 prepare、approval、commit 和 verify 从硬编码协调器迁入乐谱插件的 Workflow IR。
- Workflow IR 只允许有界 Operation、Condition、Request Approval、Request User Input、Verify 和受限组合节点。

### 阶段 D：Agent 双入口

- 简单查询通过 Direct Tool Adapter 调用类型化端口。
- 聚合任务通过 Workflow Tool Adapter 调用 Workflow Runtime。
- Toolset Resolver 根据意图、权限和预算选择少量工具，避免工具爆炸。

### 阶段 E：删除兼容层

- 确认 UI、Agent 和恢复路径不再依赖 `ApplicationCapabilityGateway`。
- 删除 `applicationCapabilities` SDK 字段、目录、Gateway 和 caller 分支。
- 删除或改造通用 Capability RPC，同时保留 Agent 调用回执和不确定结果恢复。

### 阶段 F：UI 贡献治理

- 收敛 `PluginPackage` 命名和贡献分组。
- 为 View、Command、Component Extension、Navigation 和 Dialog Slot 定义权限。
- 建立三级插件贡献白名单和失败隔离测试。

## 14. 审计和验收标准

实现或评审不得只检查“现有 Gateway 是否继续工作”，而要检查是否向目标架构收敛：

- 新 UI 业务功能是否直接依赖最小类型化端口，而不是新增 Application Capability。
- 新 Agent 聚合能力是否属于领域工作流，而不是在 Agent 核心添加领域分支。
- 简单 Agent 工具是否通过受控适配器，而不是暴露完整 Client。
- PluginPlatform 是否只管理贡献和授权，没有变成业务执行器。
- UI Command Router 是否保持 UI 职责，没有成为共享命令总线。
- 工作流是否归领域插件所有，并在统一目录中按 `ownerPluginId` 管理。
- 当前会话是否完全冻结，没有热插拔和 `draining` 分支。
- 第三方插件是否只能获得显式 scoped ports。
- Rust Application Service、事务、版本、幂等和 Kernel 权威是否保持不变。
- 旧的 Application Capability 兼容层是否只减不增，并有明确删除路径。

## 15. 明确禁止的回退设计

- 不把 UI 和 Agent 再次强制塞进同一个通用 Gateway。
- 不把 UI Command 暴露成模型工具。
- 不以 `operations` 为名复制一套全局 `applicationCapabilities`。
- 不让一个巨型工作流插件拥有所有领域工作流。
- 不让每个小函数、字段读取或节拍号修改都成为独立工作流。
- 不让模型、工作流定义或第三方插件直接访问裸 Kernel 或任意 Tauri IPC。
- 不为运行时插件卸载增加状态，因为固定会话已从根源上禁止该场景。
