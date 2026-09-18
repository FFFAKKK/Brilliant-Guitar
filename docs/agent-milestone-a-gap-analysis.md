# AI Agent Milestone A 仓库差距分析

日期：2026-09-18  
依据：[AI Agent 插件架构基线 v0.1](agent-architecture-v0.1.md)  
状态：差距基线；A1-A3 首个垂直切片已实施，剩余差距继续按 A4-A6 收敛。

## 1. 分析目标

本分析将 Agent 架构映射到当前 Brilliant Guitar 仓库，区分：

- **复用**：职责与目标架构一致，可以直接作为基础。
- **调整**：已有机制有价值，但合同或生命周期不足。
- **新增**：当前没有对应权威边界，需要建立新模块。

Milestone A 的目标不是交付完整 AI 助手，而是建立不依赖真实模型的可靠运行骨架。

## 2. 当前可直接复用

### 2.1 Rust 文档、事务与历史权威

`ScoreSessionService` 和 Rust Kernel 已经持有唯一可变文档、事务与撤销历史。编辑请求包含文档 ID、预期版本和请求 ID，具备乐观并发与有限幂等保护。

对 Agent 的价值：

- Mutation 不需要创建第二套乐谱事实。
- Proposal 应用可以复用现有版本冲突与事务语义。
- 回读验证有明确的权威来源。
- `outcome-unknown` 的核对可以围绕稳定请求 ID 设计。

结论：保留 Rust Kernel 和应用服务作为所有乐谱写入的最终执行路径。

### 2.2 Tauri Host Bridge 与桌面 AppState

生产链已经是 React `WorkbenchClient` 经 `TauriWorkbenchHostBridge` 调用 Rust commands。`AppState` 持有会话、恢复、设置、工作区配置和诊断存储。

对 Agent 的价值：

- Agent 的持久化、Provider 代理和安全凭据可以通过同一桌面宿主边界接入。
- 前端无需直接访问文件系统、网络密钥或 Rust Kernel。
- 浏览器开发适配器可以继续作为测试与预览降级路径。

结论：扩展现有 Host Bridge，不新建第二条桌面通信体系。

### 2.3 UI 插件宿主

现有 `UiPluginHost` 已提供第一方编译期插件、Manifest 校验、贡献所有权、原子安装、Projection 权限和诊断隔离。

对 Agent 的价值：

- Agent 面板可以作为第一方 UI 插件贡献。
- 插件身份、版本、组件所有权和失败隔离模式可以复用。
- Agent UI 可以继续使用共享 Dock、焦点和布局机制。

结论：保留 UI 插件宿主，不让 Agent 另建悬浮式旁路 UI。

### 2.4 类型化 Projection 模式

`UiProjectionRegistry` 已证明“只有声明后才能读取收窄状态”的模式可行。

对 Agent 的价值：

- Context Provider 可以借鉴类型化键、注册表、快照和作用域读取。
- 插件不能直接获取所有应用状态。

结论：复用设计模式，不直接复用 UI Projection 数据合同。Agent Context 需要来源、版本、隐私和预算元数据。

### 2.5 设置、工作区配置与诊断模式

应用已有版本化设置、严格校验、损坏恢复、原子写入和插件诊断记录。

对 Agent 的价值：

- 非敏感 Agent 设置可采用相同版本化存储原则。
- Run 和 Provider 诊断可以复用结构化、限量、可恢复的设计模式。
- 插件启用状态可以进入工作区或应用配置，但需要先确定作用域。

结论：复用存储原则与宿主命令模式；API Key 不进入普通设置。

### 2.6 播放与只读投影

播放源已经与文档 ID、版本绑定，播放 UI 和命令作为第一方插件接入。

对 Agent 的价值：

- 只读助手可以引用当前播放位置。
- 后续试听 Proposal 可以复用播放领域，而不是在 Agent 中实现音频引擎。

结论：播放仍归 Playback 领域所有，Agent 只组合其 Capability。

## 3. 需要调整的现有机制

### 3.1 `WorkbenchCapabilityRegistry` 不是业务 Capability Registry

当前注册表只保存字符串，用于检查 UI 插件要求的宿主特性，例如 `score.document` 和 `playback.transport`。它没有输入、输出、副作用、执行和结果语义。

结论：保留现有名称和职责，新增独立的 `ApplicationCapabilityRegistry`。不要因为都叫 Capability 就合并。

### 3.2 `WorkbenchCommand` 只适合 UI 命令

现有命令支持标签、快捷键、启用状态和 `run()`，但无法表达结构化参数、业务结果、版本冲突、审批、重试或执行回执。

结论：UI Command 应成为 Application Capability 的界面适配器。Milestone A 不要求一次迁移全部现有命令，先用一个只读能力验证方向。

### 3.3 UI Projection 不适合作为 Agent Context

部分现有 Projection 包含 React 视图 Props 和回调，例如 Staff 与 Note Control。这些是界面装配数据，不是稳定的 Agent 事实合同。

结论：新增 Context Provider Registry。它可以读取同一应用事实，但输出独立、结构化、带来源和版本的 Context Envelope。

### 3.4 Workbench Operation 不是 Agent Run

`WorkbenchOperationController` 是 React 页面内的短生命周期忙碌和错误状态。它没有持久化、审批、Invocation、核对和重启恢复。

结论：保留它用于 UI 忙碌与反馈；Agent Run 使用独立权威状态。UI 可以把 Run 状态投影成 Workbench Operation，但不能反向把 Operation 当作 Run 事实。

### 3.5 UI 插件目前是启动期静态安装

当前第一方 UI 插件在模块加载时全部安装，没有产品级启用、停用和生命周期状态。

结论：Agent 插件需要明确的启用配置和生命周期。第一版仍可以是随应用编译的第一方模块，但其 UI、Provider 和 Runtime 只在启用后激活。无需提前实现第三方动态代码加载。

### 3.6 `ScoreSessionService` 职责已经较集中

当前服务承担会话、编辑、幂等、文件和投影。继续把 Agent Run、Provider、审计和 Proposal 全部加入该服务会形成新的集中点。

结论：Agent 宿主服务与 ScoreSessionService 分离，通过收窄端口调用应用能力。Preview Session 后续由应用服务提供，不由 Agent 直接管理 Kernel。

### 3.7 应用设置缺少 Agent 配置边界

当前设置只有 UI 与编辑选项，也没有插件启用、Provider、模型、隐私和预算字段。

结论：Agent 非敏感设置需要独立版本化配置或明确的新设置版本。敏感凭据使用系统凭据存储，不能与普通配置混写。

## 4. 当前缺失、需要新增

| 模块 | Milestone A 是否需要 | 主要职责 |
|---|---:|---|
| Application Capability Contract | 是 | 统一业务能力的身份、输入输出、可用性、效果与结果语义 |
| Application Capability Registry | 是 | 注册、所有权、查找和作用域执行 |
| Context Provider Contract / Registry | 是 | 按需提供带来源、版本和隐私元数据的上下文 |
| Agent Tool Adapter / Tool Host | 是 | 将允许的 Capability 转为模型工具，并执行校验和授权 |
| Agent Run Reducer | 是 | 纯状态转换和合法事件检查 |
| Agent Run Store | 是 | 检查点、未终止 Run 和重启恢复 |
| Provider Port | 是 | 统一模型请求与事件流 |
| Fake Provider | 是 | 无网络、确定性的 Runtime 和工具测试 |
| Agent Plugin Lifecycle | 是 | 启用、启动、就绪、降级和停止 |
| Agent Audit Store | 最小版 | 记录结构化 Run、调用、用量与错误摘要 |
| OS Credential Store | 接真实 Provider 前 | 保存 API Key |
| Proposal / Preview Session | 否，Milestone C | 候选预演、差异、审批和应用 |
| 音乐 Generation Capability | 否，后续 | 指法、编曲等候选生成 |

## 5. 推荐的职责落点

### 5.1 Workbench / TypeScript

适合承载：

- Agent 第一方 UI 插件和面板。
- 框架无关的 Capability、Context 和 Provider 前端合同。
- Run 状态的只读投影与用户交互。
- Fake Provider 和纯状态机测试。
- UI Command 到 Capability 的适配。

不应承载：

- API Key 明文。
- 唯一的长期 Run 事实。
- 绕过宿主的真实文档写入。

### 5.2 Desktop / Rust Host

适合承载：

- 持久化 Run 检查点与审计记录。
- Provider 网络代理和系统凭据访问。
- 文档版本、请求 ID 和 Capability 执行的权威校验。
- 启动时未终止 Run 的恢复与核对。

不应承载：

- Agent 面板布局与 React 状态。
- UI 命令或 Dock 逻辑。
- 与具体模型供应商耦合的业务规则。

### 5.3 Rust Kernel / Domain Plugins

继续承载文档、事务、历史和领域规则。它们不知道模型、聊天、Prompt、Provider 或 Agent UI。

## 6. 命令层重构策略

引入 Application Capability 不等于删除现有命令系统，而是把目前由命令、Hook、Client 和应用服务共同承担的业务职责重新分层。

### 6.1 当前调用链

当前典型写入路径是：

```text
按钮 / 快捷键
  → WorkbenchCommand 或组件回调
  → React Hook / WorkbenchClient
  → Tauri command
  → ScoreSessionService
  → Rust Kernel
```

这条链路已经可用，但业务动作的身份、输入输出、副作用和结果语义散落在 UI Hook、Bridge DTO 与 Rust 服务中，因此无法被 Agent 安全发现和统一调用。

### 6.2 目标调用链

```text
UI Command ─────────────┐
Agent Tool ─────────────┼→ Capability Gateway → Capability Handler
Future Automation ──────┘                         → Application Service
                                                   → Rust Kernel / Domain Service
```

- UI Command 保留标签、快捷键、焦点和弹窗等呈现职责。
- Agent Tool 保留模型描述和工具参数适配职责。
- Capability 统一表达业务动作、输入输出、可用性、副作用和结果。
- Application Service 与 Kernel 继续拥有实际业务逻辑和权威状态。

Capability Handler 主要做边界适配与用例编排，不重新实现音乐规则。

### 6.3 哪些命令需要迁移

| 当前行为 | 是否成为 Capability | 原因 |
|---|---:|---|
| 显示设置对话框 | 否 | 纯 UI 呈现行为 |
| 切换或重置 Dock | 否 | 纯工作台布局行为 |
| 显示插件诊断窗口 | 否 | 纯 UI 导航行为 |
| 读取作品概要或选区 | 是 | 稳定业务读取，UI 与 Agent 可共享 |
| 插入、修改、删除音符 | 是 | 修改权威文档，需要统一结果与版本语义 |
| 撤销、重做 | 是 | 业务历史能力，不应只存在于按钮回调 |
| 播放或试听范围 | 是 | 可由 UI 与 Agent 共同使用的播放领域动作 |
| 保存、导出、打开文件 | 是，但分离 UI 选择器 | 文件副作用需要统一治理；文件选择器仍属 UI/Host 交互 |
| 纸张缩放 | 通常否 | 视图状态，不是作品业务能力 |

不是所有用户能做的界面动作都需要暴露给 Agent。Agent 需要的是业务能力对等，不是模拟每一次鼠标操作。

### 6.4 Capability 的权威落点

桌面产品中的 Capability Catalog 和执行权威应位于 Rust 应用宿主侧：

```text
Tauri / Rust Host
  ├─ Capability Catalog
  ├─ Capability Gateway
  ├─ Capability Handlers
  ├─ ScoreSessionService / 其他领域服务
  └─ Rust Kernel
```

原因：

- Agent 的持久化 Runtime 与恢复位于宿主侧。
- 文档版本、请求 ID、权限和执行回执需要同一可信边界。
- UI 关闭、刷新或重启后，业务调用状态不能只存在于 React。
- Agent 不应通过模拟 UI 才能调用能力。

TypeScript 侧保留合同 DTO、严格解码器和类型化 Capability Client。UI 组件不直接使用通用字符串调用，而通过稳定的类型化适配器使用能力。

### 6.5 插件贡献方式

领域插件贡献 Capability 的声明和宿主侧 Handler；UI 插件贡献按钮、命令和视图适配器。AI Agent 插件只消费经过允许的 Capability。

```text
Score Plugin
  ├─ Capability: score.read-summary
  ├─ Capability: score.transpose-range
  └─ UI Command adapters

Guitar Plugin
  ├─ Capability: guitar.assess-difficulty
  ├─ Capability: guitar.generate-fingering
  └─ Guitar views

AI Agent Plugin
  └─ Tool adapters for approved capabilities
```

第一版仍是编译期第一方插件，不需要动态加载第三方代码。

### 6.6 解决现有命名冲突

当前 `WorkbenchCapabilityRegistry` 中的 `score.document`、`workbench.layout` 等字符串表示“宿主特性是否存在”，不是可执行业务能力。为避免两个 Capability 概念长期混淆，建议在 A1 前半段将其重命名为：

```text
WorkbenchFeatureRegistry
requires.hostFeatures
```

新的 `ApplicationCapabilityRegistry` 专门管理可执行能力。两者不能合并。当前 API 尚未作为第三方 SDK 发布，现阶段是完成这项术语收口的合适窗口。

### 6.7 渐进迁移顺序

采用旁路建立、逐条迁移的方式，不一次重写全部命令：

1. 明确重命名宿主 Feature，消除术语冲突。
2. 建立最小 Capability Contract、Catalog 和 Gateway。
3. 用 `score.read-summary` 建立第一条只读纵向链路。
4. 建立 TypeScript Capability Client，让 UI 或测试调用同一能力。
5. 加入 Agent Tool Adapter，但仍使用 Fake Provider。
6. 选择一个简单写入能力验证版本、事务、回执和撤销。
7. 按领域逐步迁移现有业务命令。
8. 删除已经没有调用者的旧旁路，避免长期双轨。

迁移期间旧命令仍可工作。每迁移一个动作，都要求 UI 行为、快捷键和现有测试保持兼容。

### 6.8 第一条纵向链路

`score.read-summary` 的目标链路：

```text
UI / Fake Agent
  → TypeScript ScoreCapabilityClient.readSummary()
  → WorkbenchHostBridge.invokeCapability()
  → Tauri workbench_invoke_capability_v1
  → Rust Capability Gateway
  → score.read-summary Handler
  → ScoreSessionService.read()
  → 收窄的 ScoreSummary Result
```

第一条链路刻意不加入审批、Proposal、Preview Session 和真实 Provider。它只验证最核心的架构判断：同一项稳定业务能力可以脱离具体 UI，并被不同调用方安全复用。

### 6.9 不建议的做法

- 不把每个 `WorkbenchCommand` 自动包装成 Agent Tool。
- 不让 Capability Handler 调用 React Hook 或组件回调。
- 不让 Agent Runtime 通过 `WorkbenchCommandRouter` 执行业务动作。
- 不把 Kernel 原子命令直接注册为模型工具。
- 不在 TypeScript 和 Rust 分别实现同一业务规则。
- 不在迁移完成前一次删除所有现有 Client 方法和 Tauri commands。

## 7. Milestone A 实施切片

### A1. Capability Foundation

目标：建立统一 Capability 的最小合同和注册表，用一个只读能力证明 UI 与 Agent 可共享业务实现。

建议试点：`score.read-summary`。

验收：

- 注册表拒绝无效和重复身份。
- 调用输入输出经过运行时校验。
- 能力返回文档 ID 和版本。
- UI 或测试调用方不接触 Kernel 内部对象。
- 不修改现有写入和历史语义。

### A2. Context Foundation

目标：用 Context Provider 暴露 `score.summary` 和 `score.selection`，验证来源、版本、作用域和预算。

验收：

- 不复用包含 React 回调的 UI Projection。
- 文档版本变化后旧 Context Snapshot 可识别为失效。
- 未声明 Provider 不能被读取。

### A3. Run Core + Fake Provider

目标：实现无真实模型的 Run reducer、事件、Invocation 和 Fake Provider。

实施状态：A3 已完成，详见
[A3 Run Core 设计与实施](agent-a3-run-core-design-v0.1.md)。

验收：

- 可以确定性演示“用户请求 → 读取概要 → 生成回答 → 验证 → 完成”。
- 非法状态转换被拒绝。
- 取消、Provider 失败和无效工具调用有不同结果。
- 测试不需要网络、API Key 或模型费用。

### A4. Durable Run Store

目标：在桌面宿主保存 Run 检查点并支持重启恢复。

验收：

- Run 在关键边界持久化。
- 重启后可恢复等待状态和只读执行。
- 执行中状态不会被直接重放。
- 损坏记录被隔离并产生诊断。

### A5. Agent Plugin Lifecycle + Minimal UI

目标：加入可启停的第一方 Agent 插件和最小状态面板。

验收：

- 默认关闭时不初始化 Provider 或读取 Agent Context。
- 启用后注册面板并启动 Runtime。
- 停用时停止新 Run，处理在途任务并释放订阅。
- 普通制谱、播放、文件和布局在 Agent 关闭时不受影响。

### A6. Provider Boundary

目标：在 Fake Provider 已稳定后接入第一个真实云端 Provider。

验收：

- API Key 通过系统凭据存储读取。
- Provider 不能直接调用 Capability。
- 流式工具参数完整后才进入 Tool Host。
- 有 Token、时间、轮次和错误预算。
- 真实 Provider 测试与确定性状态机测试分开。

## 8. 顺序与依赖

```text
A1 Capability Foundation
  → A2 Context Foundation
  → A3 Run Core + Fake Provider
  → A4 Durable Run Store
  → A5 Agent Plugin Lifecycle + Minimal UI
  → A6 Real Provider Boundary
```

UI 视觉打磨、Proposal、Preview Session 和写入 Capability 不应抢跑 A1 至 A4。没有稳定的能力、上下文和恢复边界时，漂亮的聊天面板只会掩盖架构缺口。

## 9. 主要风险与控制

| 风险 | 控制方式 |
|---|---|
| 为 Agent 创建第二套业务实现 | UI 和 Agent 共同调用 Application Capability |
| 把 UI 状态当作领域事实 | Context Provider 从权威应用状态构建收窄数据 |
| Run 只存在于 React 内存 | 桌面宿主持久化检查点，前端只显示投影 |
| 继续扩大 ScoreSessionService | 独立 Agent Host Service，通过端口组合 |
| 过早绑定一家模型 | 先 Fake Provider，再实现统一 Provider Port |
| 插件启停只是隐藏面板 | 生命周期同时控制 Runtime、Provider、Context 和订阅 |
| 普通设置泄露 API Key | 系统凭据存储与非敏感设置分离 |
| 一次改动范围过大 | 按 A1-A6 逐个评审、实现和验证 |

## 10. 当前建议

下一步只设计 A1，不同时设计整个 Agent 的代码接口。详细方案见 [Agent A1 Capability Foundation 设计](agent-a1-capability-foundation-design.md)。A1 先回答：

1. Capability 的最小合同需要表达哪些稳定语义。
2. `score.read-summary` 的权威实现从哪里读取。
3. UI Command 和未来 Agent Tool 如何适配同一能力。
4. 哪些内容暂时不进入合同，以避免过度设计。

A1 方案确认后再开始实现，并用它验证统一 Capability 这一核心架构决策。
