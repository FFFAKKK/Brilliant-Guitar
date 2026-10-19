# 插件平台、UI 贡献、工作流与固定会话重构方案 v1

日期：2026-09-20。
状态：**目标架构与迁移依据**。当本文与 A7.11 或更早的“统一 Application Capability”方案冲突时，以本文为准。

统一贡献补充：第 7 节纳入 UI 包内插件的共同最小声明、最大可选扩展及空值边界；详细 UI 接口限制集中维护于 [插件设计与编写原则](../design/frame-visual/plugin-design-v0.1.md)。补充属于目标契约，不改变后文各阶段历史实施记录的含义。

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

插件作者仍然只使用一个 `definePlugin()` 入口。贡献按公开接口组织，整个插件不按功能、视觉、动画等分类；UI 包内也可以有不产生视觉内容的功能插件。一份包可以组合多种接口，无需到多个平台分别注册。

下面仅示意多接口贡献的组合结构，省略了共同基础声明中的名称、插件版本与宿主接口兼容要求；它不是完整的合法最小声明，也不是当前 SDK 的可执行示例。完整声明的语义要求见第 7.1 节，正式字段映射需在协议评审中确定。

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

这是目标作者体验，不要求一次性修改当前 SDK 形状。平台内部仍使用职责独立的目录，但插件只提交一个包。示例中的 `tier` 继续表示平台信任与装配角色，第 10 节的权限上限保持；贡献接口分组不成为互斥的插件类型。

注意：不新增一个全局 `operations` 贡献点作为 `applicationCapabilities` 的换名版本。直接访问通过类型化 Host Service Port；工作流步骤通过 `WorkflowRuntimeContext` 中的受限端口绑定。将来的低代码 Workflow IR 使用启动时验证和绑定的符号步骤，不获得任意函数或脚本执行权。

### 7.1 最小贡献：所有插件共同必备

最小贡献统一指基础声明，不按每个插件所实现的功能重新定义。共同语义为：**稳定身份、可读名称、插件版本、宿主接口兼容要求**。它们必须非空、类型和格式合法，身份唯一，兼容要求可验证。插件实现版本与宿主接口版本分别表达，不相互替代。

贡献所有者由平台根据已验证身份绑定，不允许插件自报另一个所有者。沿用现有插件包身份与 UI namespace 的映射，避免形成两套身份或生命周期。平台已有的等级、激活、执行域、签名及授权合同按原条件执行；共同集合不意味着这些既有合同可以省略。

基础声明合法且所有可选贡献为空，是合法的最小插件声明。不强制面板、图标、动画、生命周期钩子或至少一项公开功能，也不生成 UI 占位。会话需要的某个接口没有提供者时，仍按依赖和启动政策处理；基础声明合法不代表业务能力已经可用。

### 7.2 最大贡献：开放接口及其上限

最大贡献是框架允许在基础声明之上按需增加的可选扩展集合，不是默认全权授权。一份插件可以组合 UI 内容、功能／查询／编辑适配、输入、绘制、动画、命令、菜单、快捷键、设置、状态订阅或呈现扩展。已有工作流、乐器、播放和 Kernel 模块继续遵循各自合同；不要求插件填满任何一组。

每个接口都必须规定两种限制：

- **范围**：目标区域或对象、允许读取与写入的状态、可获得的类型化端口、允许替换的行为及所有权。
- **程度**：适用的数量、层级、频率、时长、并发、载荷及资源预算，以及冲突和超限处理。

UI 包内详细矩阵以 [插件设计主稿第 7.2–7.3 节](../design/frame-visual/plugin-design-v0.1.md) 为准。具体数值按对应接口与宿主容量验证决定；没有完成合同和可执行限制策略的候选接口保持未开放。声明期预检范围、引用和静态限制，运行期执行动态预算；诊断应定位所属插件、贡献或字段，不能仅依靠作者自律。

实际扩展能力受宿主开放接口及第 10 节有效授权共同限制。合并型接口明确组合顺序，独占型接口明确提供者选择或拒绝规则；没有加载顺序隐式覆盖。插件设置可以调整当前已装配能力的表现，不能增加会话贡献拓扑、载入新代码或扩大授权。

动画是同一包可以选择的表现接口，允许与功能组合。宿主持有目标许可、全局关闭／减少动效及冲突、取消策略；动画消费权威状态变化，不以结束时点决定业务提交。没有动画时采用即时／静态表现，快速更新和隐藏时按接口规定取消或暂停。UI 插件内部图标、按钮和内容视觉由插件自主设计，宿主约束承载与边界。

### 7.3 空值与失败

统一作者边界先校验共同基础声明，再规范化可选空值并验证实际条目：

- 基础声明整体或共同必填缺失、`undefined`、`null`，必填文字空白，类型／格式非法或不兼容：拒绝登记并给出字段诊断，不伪造默认身份或版本。
- 可选集合省略、`undefined` 或 `null`：规范为空集合；可选单项或钩子为空：按相应接口规范为未提供。不登记、不调用，也不渲染 `null/undefined` 字符串或假占位。
- 已提供集合的非法类型、空洞或无效条目、内部必填缺失、非函数钩子、未知字段及越权：明确拒绝，不静默过滤为“没有贡献”。合法 `false/0` 依字段语义保留。
- 必需接口或依赖缺失：明确启动失败或不可用；可选依赖缺失：仅依其声明的基线回退使相关贡献不可用，并报告原因。
- 已存在贡献执行异常、超限或返回非法结果：维持明确失败，按合同隔离、回滚或降级；不吞成空值后报告成功。取得的资源仍由其所有者清理。

未提供、暂不可用、无效与执行失败是不同状态。可选效果回退必须有依赖与状态隔离依据；核心必需项失败继续执行宿主一致性政策，不承诺所有失败都可忽略。

### 7.4 当前实现与迁移

上述语义是目标设计。本轮没有修改 SDK 或运行协议。备份 UI 作者入口 `defineUiPlugin` 当前只接受 `namespace/ui/commands/menuItems/shortcuts`；`ui` 必须是数组，可为 `[]`，其余三组可省略但显式 `null` 会失败。根级名称、插件版本、宿主接口兼容要求和新的功能／绘制／动画等统一接口尚未开放，具体事实见 [当前作者文档](../design/frame-visual/plugin-authoring.md)。

协议迁移要收敛既有平台身份和版本字段，明确新版本或兼容适配，保留旧输入的验证证据。不能因文档补充就无版本地放宽现有校验。先实现共同字段校验、可选空值规范化和诊断，再按具体需求开放受限接口；UI 内部扩展不新增父子插件运行层、全局服务定位器或重复命令总线。

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
  -> ScoreReadPort / ScoreChangeSetPort
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

插件安全与固定授权切片（2026-09-20）已经完成：

- `PluginHostServiceRegistry` 单独描述当前宿主实际提供的类型化服务，不复用 `hostFeatures`，也不保存服务实现。
- `PluginHostServicePolicy` 按 `tier allowlist ∩ manifest requirements ∩ user grants ∩ session policy`
  计算有效授权；服务不可用时同样拒绝启动插件。
- `third-party` 默认没有等级授权和用户授权，必须由宿主显式开放；`system` 和 `product` 当前把产品安装
  本身视为默认授权，但仍受等级上限和当前 Session Policy 限制。
- `host.all-access` 在 SDK、Manifest 捕获、宿主服务目录和策略输入处全部禁止。
- 解析成功的授权写入不可变 `PluginSessionPlanV1.hostServiceGrants`，运行中的启停设置不能改变当前授权。
- 平台目前只发布只读授权事实，没有向插件暴露通用服务定位器。具体类型化端口仍由后续 scoped host context
  和 `WorkflowRuntimeContext` 绑定。

### 阶段 B：类型化直接端口

- 从现有 `WorkbenchClient` 和专用 Client 中整理 `ScoreReadPort`、`ScoreEditPort` 等最小接口。
- UI Controller 和第一方 UI 插件直接依赖这些端口。
- 平台根据插件身份提供 scoped host context，不暴露完整 Client。

首个纵向切片（2026-09-20）已完成 `ScoreReadPort`：概要、元数据、结构、小节索引和有界小节范围现在通过独立的类型化宿主命令进入 `ScoreSessionService`，不再经由前端 `ApplicationCapabilityGateway`。Agent 查询由 `DirectScoreReadAgentPort` 适配到同一读取端口，并暂时把写入与回执继续交给旧兼容链；因此本阶段没有增加新的全局能力目录，也没有改变审批、回执或恢复语义。

第二个切片已将现有 `workbench_edit_v1` 收敛为 `ScoreEditPort`。这一步只整理 UI/第一方插件的类型化编辑边界；Agent 的 prepare、approval、commit 和 receipt 仍保留在兼容路径，等编辑端口具备变更集语义后再迁移。

第三个切片已将 Agent 的 prepare 阶段收敛为独立的 `ScoreChangeSetPort`。`FirstPartyPreparedMutationCoordinator` 现在只处理意图校验、版本绑定和审批预览，不再拼装通用 Capability 请求；`CapabilityBackedScoreChangeSetPort` 暂时把旧的 `score.prepare-*` 调用封装在适配器内部。这样先固定可复用的变更集合同，同时不改变提交回执、不确定结果恢复或旧宿主的行为；后续宿主提供类型化 prepare 命令时，只需替换适配器实现。

第四个切片（2026-09-20）已为速度和元数据事务提供类型化的 `workbench_score_prepare_*_v1` 宿主命令。桌面 Agent 会话通过 `ScoreChangeSetClient` 直接准备权威 ChangeSet，不再为 prepare 调用通用 Agent Capability RPC；旧 `CapabilityBackedScoreChangeSetPort` 仅作为旧宿主兼容实现。两条路径共享 Rust `score_change_set` 生成和哈希校验逻辑，避免合同漂移。commit 仍通过 `workbench_agent_invoke_capability_v1`，因为该入口持有持久调用回执、重放和崩溃恢复语义。

### 阶段 C：Workflow Runtime Context

- 为 Workflow Runtime 定义版本化、最小权限的 `WorkflowRuntimeContext`。
- 将 `score.edit-metadata` 的 prepare、approval、commit 和 verify 从硬编码协调器迁入乐谱插件的 Workflow IR。
- Workflow IR 只允许有界 Operation、Condition、Request Approval、Request User Input、Verify 和受限组合节点。

第一切片（2026-09-20）已落地版本化、不可变的 `WorkflowRuntimeContext`，其中只包含固定工作流身份、入口操作、操作白名单、工作区范围和 range budget。Direct Tool 与未来的 Workflow Step 通过同一个 `AgentActionRuntime` 进入现有 typed prepare/capability port；审批、持久回执、重放、恢复与完成校验仍由 `AgentRunController` 统一负责。审批继续和重试严格使用 Run 中持久化的工作流身份，调用方不能通过替换请求 intent 绕过插件所有者、版本或操作白名单。本切片尚未实现 Workflow IR、条件节点、步骤检查点或低代码编辑器。

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
- 按第 7 节确定共同最小声明的正式字段、协议版本及既有身份／版本映射。
- 统一可选空值规范化与字段诊断，区分未提供、不可用、无效和执行失败。
- 为按需开放的功能、输入、绘制、动画、配置等接口规定范围、程度、资源、依赖及冲突规则。
- 覆盖合法最小声明、全部可选为空、组合贡献、越权／超限、必需依赖缺失及旧协议迁移验收。

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
- 是否以所有插件共同的基础声明定义最小贡献，允许合法空扩展，没有新增功能插件分类。
- 是否区分可选集合为空和实际条目非法，保留合法 `false/0`，对必需失败与运行异常给出明确结果。
- 各开放接口是否同时有范围与可执行的程度限制，动画是否能关闭、取消且不改变业务成功条件。
- 目标贡献矩阵、当前作者 API 和协议迁移状态是否分别说明，没有把候选接口写成已实现。

## 15. 明确禁止的回退设计

- 不把 UI 和 Agent 再次强制塞进同一个通用 Gateway。
- 不把 UI Command 暴露成模型工具。
- 不以 `operations` 为名复制一套全局 `applicationCapabilities`。
- 不让一个巨型工作流插件拥有所有领域工作流。
- 不让每个小函数、字段读取或节拍号修改都成为独立工作流。
- 不让模型、工作流定义或第三方插件直接访问裸 Kernel 或任意 Tauri IPC。
- 不为运行时插件卸载增加状态，因为固定会话已从根源上禁止该场景。
