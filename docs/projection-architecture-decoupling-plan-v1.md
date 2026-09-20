# Projection 架构解耦与职责分配方案 v1

日期：2026-09-20
状态：**目标架构与跨规划交接文档，尚未实施代码**
关联：

- [AI Agent 架构优化方案](agent-architecture-optimization-plan-v0.2.md)
- [插件平台、UI 贡献、工作流与固定会话重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)
- [音乐基础能力审计](music-foundation-capability-audit-2026-09-19.md)

## 1. 目的

当前代码和规划使用 `Projection` 指代多种不同对象：Kernel 查询结果、记谱和播放派生数据、
UI 渲染状态、Agent Context，以及包含操作函数的组件绑定。继续沿用一个模糊概念，会让插件平台、
Agent、Workbench 和微内核互相承担对方职责。

本文冻结 Projection 的目标边界，并把后续工作分配给独立规划。当前 Rust 微内核工作流不实施
跨层改造，只继续负责 Query Plane、事务、历史、资源和稳定性。未来 Projection 架构任务必须在
独立 Git worktree 和分支中实施，不在共享 `main` 工作目录直接开发。

## 2. 结论

Projection 的统一点是：

> 所有乐谱派生结果来自同一个带版本的 Kernel 权威状态。

Projection 不应统一成一个万能运行时、全局总线或第二份状态。系统保留四类明确对象：

| 类型 | 职责 | 所有者 |
| --- | --- | --- |
| Kernel Query Result | 从权威 Store 有界读取事实 | Rust 微内核 |
| Domain Projection | 组合记谱、播放、剪贴板等领域只读模型 | 对应领域宿主与插件 |
| UI View State | 提供 React 渲染所需的纯数据 | Workbench UI |
| Agent Context Item | 提供带来源、版本、范围和信任级别的最小上下文 | Agent 控制面 |

动作、命令、播放控制、审批和工作流不属于 Projection。它们通过 scoped typed port、Controller 或
`WorkflowRuntimeContext` 执行。

## 3. 当前问题

### 3.1 UI Projection 同时保存状态和动作

当前部分 UI Projection 同时包含渲染状态与 `input()`、`execute()`、`toggle()`、`start()` 等操作。
这实际上是 View State、Controller 和 Action Port 的组合，不适合成为插件、Agent 或跨进程合同。

目标是拆分为：

```text
Pure View State
  只读、可验证、可替换和可测试

Scoped Action Port
  由可信宿主按插件身份发放
```

### 3.2 Projection 注册表只有 ID，没有长期合同

现有 UI 注册表适合作为进程内 React 绑定键，但缺少合同版本、文档版本、作用范围、来源、输出上限、
完整性状态和运行时验证。不能直接把它升级成 Agent 或第三方插件的通用数据总线。

### 3.3 Notation 与 Playback 硬编码扩展白名单

当前基础投影只认识少量扩展。出现未知 extension 时，整份记谱或播放可能返回 `unsupported`。
新增 Tie、Dynamics、Tempo、Guitar 等模块后，这种模式会使模块越多、基础能力越脆弱。

### 3.4 宿主仍把完整读取作为常用入口

Kernel 已经具备 Overview、Metadata、Structure、Entity 和 Range Selector。旧 A0 计划中的 Query
Foundation 缺口已经关闭。当前缺口是应用宿主和消费者仍有大量完整 `read()`，并同时构造不一定被
使用的 Notation 和 Playback 投影。

### 3.5 旧 Application Capability 层仍是迁移桥接

Agent 的旧 `ApplicationCapabilityGateway`、`applicationCapabilities` 和通用 RPC 不再是目标架构。
新实现必须通过类型化领域端口、Direct Tool Adapter 和插件拥有的 Workflow 收敛，不能以
`operations`、`projection operations` 等名称重建同一层。

## 4. 目标架构

```text
Rust Kernel Query Plane
  Overview / Metadata / Structure / Range / Entity / Full Snapshot
                              |
                              v
                 Versioned Typed Read Ports
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
     Notation Source   Playback Source   Agent Context Source
             |                |                |
             v                v                v
     Domain Composer   Domain Composer   Context Provider
             |                |                |
             v                v                v
        UI View State    Playback Plan      Context Items

Actions / Commands / Workflows
  -> scoped typed ports
  -> Rust Application Service
  -> Kernel Command Plane
```

读取和写入最终在同一个 Kernel 状态、版本和事务边界汇合，但不共享一套前端通用调用包装。

## 5. Projection 基础合同

跨领域共享的最小只读信封应表达以下语义；具体语言和字段名可在实施时按现有合同风格调整：

```text
projectionId
contractVersion
documentId
documentVersion
scope
completeness: complete | partial | degraded
data
diagnostics
```

约束：

1. `data` 是纯数据，不包含函数、可变宿主句柄或 React 对象。
2. 相同文档版本、装配集合和输入范围必须产生确定性相同结果。
3. 每个结果声明来源、范围和版本；不同版本不能静默合并。
4. 有界结果声明记录数或字节上限；超限返回结构化失败或分页结果。
5. `degraded` 只能描述相关能力不完整，不能伪装成完整结果。
6. Full Snapshot 是明确的高成本读取，不是窄查询的默认实现。

## 6. 可组合领域 Projection

不建立万能 Projection Bus。每个领域拥有自己的小型 Composer：

- `NotationProjectionComposer`
- `PlaybackProjectionComposer`
- 后续的 `ClipboardFragmentComposer`
- Agent 侧的 `ContextProvider`，但它不参与记谱或播放合并

### 6.1 基础骨架与插件 Fragment

```text
Core Notation Skeleton
  + Key Signature Fragment
  + Tie Fragment
  + Dynamics Fragment
  + Guitar Tablature Fragment
  -> Final Notation Projection
```

插件只返回自己拥有的 Fragment，不修改共享结果对象。Fragment 使用稳定实体 ID 定位，并声明：

- contribution ID 与 owner plugin ID；
- 合同版本；
- 所需输入投影或 extension namespace；
- 输出槽位；
- 记录数和字节上限；
- 是否是当前产品能力的必需贡献。

### 6.2 合并规则

每个 Composer 使用领域特定、类型化的合并规则，不使用通用深合并或 JSON Patch：

1. Core 骨架先生成。
2. Contribution 按固定会话中编译出的稳定顺序运行。
3. 宿主验证 owner、实体引用、输出槽位、合同版本和资源上限。
4. 不同插件不能写入同一独占槽位；冲突在会话装配阶段拒绝。
5. 列表结果使用明确排序键，不依赖注册时机或哈希迭代顺序。
6. Projection 失败不回写文档，也不产生历史和 dirty 状态。

### 6.3 故障隔离

- 未知 extension：无损保存，由无关投影忽略。
- 可选插件缺失或失败：省略对应 Fragment，保留基础投影并返回插件级诊断。
- 必需插件缺失：只将相关能力标为 `degraded` 或不可用，沿用内核已有的只读降级事实。
- 无效实体引用：拒绝该 Fragment，不污染其他贡献结果。
- 单个播放或显示能力不足：不能把整份文档标记为损坏。

## 7. UI 状态与动作分离

UI 规划负责把当前混合类型渐进拆分：

```text
HistoryViewState
  undoDepth
  redoDepth
  blocked

HistoryActions
  undo()
  redo()
```

View State 可以进入 Projection Registry；Actions 通过插件获得的 scoped host context 或 Controller 注入。
迁移期可以保留兼容适配器，但新增组件不得继续把写操作放进 Projection 值。

## 8. Agent 接入边界

Agent 不读取 React UI Projection，也不消费 Notation 组件内部状态。正确链路是：

```text
Kernel Query
  -> ScoreReadPort
  -> Direct Tool Adapter 或领域 Context Provider
  -> Agent Context Item
```

Context Item 在领域事实之外增加：

- source ID；
- document ID 与 version；
- scope；
- authoritative / derived / user-provided / untrusted 信任级别；
- 隐私等级；
- 失效条件和大小预算。

Agent 工作流只通过版本化、最小权限的 `WorkflowRuntimeContext` 获取类型化端口。Context Builder 负责
选择、去重和预算，不负责调用 Kernel 或执行业务动作。

## 9. 增量失效

增量 Projection 是后续资格项，不应阻挡第一版正确组合。完整重算必须保留为 oracle。

当组合合同稳定后，可以使用内核权威 `affected` 集合和 Contribution 的声明读取依赖：

```text
Committed affected addresses
  -> 与 Projection 依赖求交
  -> 只失效相关 Fragment
  -> 重组最终 Projection
```

必须通过等价测试证明增量结果与完整重算在内容、顺序、诊断和完整性状态上完全一致。调用者提示、
插件自报 affected 或 UI 猜测不能成为跳过重算的权威依据。

## 10. 规划职责分配

### 10.1 Rust 微内核规划

负责：

- 权威 Store、document version、Selector 和有界 Query Result；
- Query 不物化无关完整快照的结构指标；
- Command、事务、历史、`affected`、资源预算和原子失败；
- 跨插件读取授权与缺失依赖降级事实；
- selector、checkpoint、soak、fuzz、恢复和性能资格。

不负责：

- React View State；
- Notation、Playback 或 Agent Context 的业务组合；
- 插件 UI 注册和 Controller；
- Agent 工具选择、审批和工作流执行。

### 10.2 Score Ports / Application Service 规划

负责：

- `ScoreReadPort`、`ScoreEditPort`、`ScoreChangeSetPort` 等最小类型化端口；
- 将窄读取映射到现有 Kernel Selector；
- 仅在保存、导出或完整投影确实需要时读取 Full Snapshot；
- 版本、请求 ID、幂等和跨进程 DTO 验证。

不负责插件装配、Agent 工具目录或 React 组件状态。

### 10.3 Projection 架构规划

负责：

- Projection 信封、运行时验证和兼容演进；
- UI View State 与 Action Port 拆分；
- Notation / Playback Composer 与 Fragment 合同；
- 稳定合并、冲突、诊断和故障隔离；
- 完整重算与增量失效等价测试。

该规划不修改 Kernel 事务语义，不新建 Query Bus，也不重新建立 Application Capability Gateway。

### 10.4 Plugin Platform 规划

负责：

- 插件身份、版本、等级、权限和固定会话生命周期；
- Projection Contribution 的声明验证、所有权、冲突和装配顺序；
- 发放 scoped host service grants；
- 插件缺失和执行失败的诊断归属。

PluginPlatform 不执行领域 Projection，不成为业务命令总线或工作流运行时。

### 10.5 Agent 规划

负责：

- Direct Tool Adapter、Workflow Tool Adapter 和 `WorkflowRuntimeContext`；
- Context Item、Context Builder、Toolset Resolver、预算、审批和恢复；
- 把类型化 Query Result 转换为模型可见的最小结构化数据；
- 版本变化、隐私和不可信内容边界。

Agent 不读取 UI Projection，不直接访问 Kernel，也不拥有音乐领域 Projection 的合并逻辑。

### 10.6 第一方音乐模块规划

负责各自的音乐语义和 Fragment：Tie、Key Signature、Dynamics、Tempo、Clef、Guitar 等。模块不能绕过
Composer 修改其他模块输出，也不能把自己的缺失伪装成整个文档损坏。

## 11. 实施顺序

1. 收口并提交当前 Score Ports 迁移，冻结最小读取接口。
2. 在独立 worktree 建立 Projection 架构任务，不修改共享 `main` 工作目录。
3. 冻结术语和 Projection 信封，先提供运行时验证与兼容适配器。
4. 拆分 UI View State 和 Actions；保留旧组件的临时适配层。
5. 把 Notation 改为 Core Skeleton + 固定插件 Fragment；先关闭未知 extension 导致整体失败的问题。
6. 以同一合同迁移 Playback，但使用独立的领域合并规则。
7. Agent Direct Tool Adapter 和 Context Provider 改用 ScoreReadPort，不读取 UI Projection。
8. 消费方迁移完成后，删除旧 `applicationCapabilities` 和通用 Gateway 兼容层。
9. 正确性和完整重算稳定后，再增加基于 `affected` 的增量失效。

## 12. 验收标准

1. 新增 Tie 投影不修改 `score-session` 的核心分支，也不修改 Agent Runtime。
2. 新增 Guitar Projection 不需要建立独立注册表或读取完整 React 状态。
3. UI 视觉改版不会改变 Agent Context 合同。
4. 未知 extension 不导致基础 Notation 或 Playback 整体 `unsupported`。
5. Projection 数据中不存在执行函数或可变宿主句柄。
6. 相同版本和装配输入产生字节或结构等价的确定结果。
7. 单个可选贡献失败不会拖垮其他投影。
8. 窄查询不物化完整文档，且不触发历史、dirty、checkpoint 或事件副作用。
9. 缺失必需贡献进入明确的 scoped degradation，不丢失原始数据。
10. 完整重算与任何增量路径严格等价。
11. PluginPlatform 只管理贡献和授权，没有成为 Projection 执行总线。
12. Agent 只能通过类型化端口和 Context Provider 获取事实。

## 13. 禁止的设计

- 不创建万能 Projection Bus、Query Coordinator 或第二份权威文档。
- 不把每个字段变成独立 Projection 或 Agent Tool。
- 不把 Actions、Controller、React Node 或任意函数放入跨模块 Projection 数据。
- 不使用通用 JSON Patch 或无约束深合并组合音乐投影。
- 不让 PluginPlatform 执行业务投影或工作流。
- 不让 Agent 直接读取 UI Projection、裸 Kernel 或任意 Tauri IPC。
- 不让未知扩展使无关基础能力整体失效。
- 不在正确性等价证明前用缓存掩盖完整读取成本。

## 14. 给未来 Projection 任务的启动说明

```text
请实施 docs/projection-architecture-decoupling-plan-v1.md。

必须使用独立 Git worktree 和 codex/ 前缀分支，不得修改共享 main 工作目录，不使用 Trellis。
开始前确认 ScoreReadPort、ScoreEditPort、ScoreChangeSetPort 当前提交状态，并以最新已提交 main 为基线。

第一切片只完成一个可验证目标，优先选择“UI View State 与 Action Port 拆分”或
“Notation 基础投影不再因未知 extension 整体失败”。不得同时迁移 Agent、Playback 和剪贴板。

保持 Kernel Query/Command、事务、历史和冻结公开合同不变。不要建立通用 Projection Bus、
Application Capability Gateway 的换名替代物或第二份乐谱状态。完成后报告 worktree、分支、SHA、
修改范围、测试、兼容风险和对 main 的依赖，不自行合并或推送 main。
```

## 15. 当前 Rust 微内核工作的后续范围

本文完成后，当前内核 worktree 继续只处理：

- checkpoint 和 selector 的资源可预测性；
- 长序列 submit / undo / redo / branch / checkpoint soak；
- 随机 Effect、Batch、历史和原子失败属性测试；
- 故障注入与恢复不变量；
- 正式 p50 / p95 / p99 和峰值内存资格；
- 结构编辑增量依赖闭包的独立、安全切片。

它不实施本文的 Workbench、Agent、插件平台或领域 Composer 改造。
