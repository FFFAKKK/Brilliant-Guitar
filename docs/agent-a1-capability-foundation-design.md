# Agent A1 Capability Foundation 设计

日期：2026-09-17  
状态：首个只读垂直切片已实施  
上游：[A0 Kernel Query Foundation](agent-a0-kernel-query-foundation-plan.md) · [AI Agent 插件架构基线](agent-architecture-v0.1.md) · [Milestone A 差距分析](agent-milestone-a-gap-analysis.md)

> **历史验证切片。** A1 证明了业务调用能够脱离 UI 并安全跨越进程边界，但其“UI 与 Agent 共用前端
> Application Capability Gateway”的具体落点已于 2026-09-20 被取代。保留输入校验、版本约束和权威
> Application Service；新实现采用类型化直接访问与插件工作流。参见
> [目标重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)。

## 1. A1 的目标

A1 只验证统一 Application Capability 的核心架构：

> 一个稳定业务能力可以脱离具体 UI，被 UI、未来 Agent 和测试通过同一执行路径安全调用。

试点能力为 `score.read-summary`。A1 不接真实模型，不实现 Agent 面板，不迁移现有编辑命令，也不引入 Proposal、审批或 Preview Session。

## 2. 最小概念模型

A1 只建立四个概念：

```text
Capability Descriptor
  描述这项能力是什么

Capability Invocation
  描述可信宿主正在发起哪次调用

Capability Result
  描述调用的确定结果

Capability Gateway
  负责查找、校验、分发和标准化结果
```

Registry 或 Catalog 保存 Capability 与所有者；Handler 调用现有应用服务完成业务工作。

## 3. Capability Descriptor

一项能力在 A1 至少声明：

| 字段 | 作用 | `score.read-summary` 示例 |
|---|---|---|
| ID | 稳定业务身份 | `score.read-summary` |
| contractVersion | 合同版本 | `1` |
| owner | 所属领域插件或宿主模块 | `brilliant.score` |
| kind | 执行政策分类 | `query` |
| effects | 副作用画像 | 只读文档；无文件、网络和设置写入 |
| inputContract | 输入运行时合同 | 无业务参数 |
| outputContract | 输出运行时合同 | `ScoreSummaryV1` |

Descriptor 不包含按钮标签、快捷键、聊天文案和模型 Prompt。这些属于 UI 或 Agent Tool Adapter。

### 3.1 稳定身份与版本

Capability ID 表达业务含义，不把版本写入 ID。合同版本独立演进：

```text
ID: score.read-summary
contractVersion: 1
```

兼容字段扩展可以保留同一版本；输入输出或语义发生不兼容变化时提升合同版本。第一版不实现自动版本协商，只接受明确支持的版本。

### 3.2 副作用画像

A1 保留简洁、可扩展的副作用声明，而不是只使用 `read/write` 单枚举：

```text
document: read
filesystem: none
network: none
settings: none
playback: none
```

`score.read-summary` 因此可以被 Agent 的只读阶段自动调用。副作用由受信任的 Capability 注册者声明，模型不能修改。

## 4. Invocation Envelope

业务输入与可信控制信息分离。A1 的 Invocation 概念上包含：

```text
invocationId       每次调用的唯一标识
capabilityId       目标能力
contractVersion    请求的合同版本
workspaceId        目标工作区
caller             ui / agent / test
input              业务输入
```

其中：

- UI 或 Agent Adapter 可以提交业务输入。
- `workspaceId`、可信调用者身份和未来的授权由宿主边界建立。
- 模型永远不能直接构造完整 Invocation Envelope。

A1 的 `score.read-summary` 输入为空对象。工作区不是业务参数，而是宿主调用作用域。

### 4.1 为什么需要 invocationId

即使只读能力没有重复副作用，调用标识仍用于：

- 关联日志和诊断。
- 关联未来 Agent Invocation。
- 区分 Provider 工具请求与应用能力调用。
- 为后续写入幂等设计保持统一形态。

A1 不建立复杂幂等存储；写入能力加入时再引入稳定 requestId 和核对语义。

## 5. Result Envelope

Capability 不以“函数返回了”代表业务成功。A1 使用结构化结果：

```text
completed     成功并返回经过验证的输出
unavailable   当前没有文档、插件未启用或前置条件不成立
rejected      调用身份、合同版本或输入不合法
failed        宿主确认能力没有成功完成
```

结果至少携带：

- `invocationId` 和 Capability 身份。
- 稳定的状态与机器可读错误码。
- 面向用户的安全消息。
- 成功时经过输出合同验证的数据。

`conflicted`、`cancelled` 和 `outcome-unknown` 已在总体架构中保留，但 A1 的只读同步试点不强行实现所有分支。合同设计需允许后续加入，而不是用一个含糊的异常字符串锁死。

## 6. `score.read-summary` 合同

### 6.1 输入

无业务参数。作用工作区来自可信 Invocation Context。

### 6.2 输出

```text
ScoreSummaryV1
  documentId
  documentVersion
  title
  measureCount
```

第一版不包含：

- 完整 notation。
- playbackSource。
- undoDepth / redoDepth。
- 当前选区。
- 文件绝对路径。
- 内部 Kernel 类型或完整文档 JSON。

这些字段不是“概要”所必需。需要时由独立 Capability 或 Context Provider 提供。

### 6.3 权威来源

Rust `ScoreSessionService` 新增收窄的 `read_summary(workspace_id)` 用例。它调用 A0 建立的 `core.selector.score-overview`，把外层 document version 与内核概要映射为 `ScoreSummaryV1`。它不通过 React Session 缓存反推，也不为读取概要构建整份 notation 和 playback 投影。

`read_summary()` 不得调用完整 `read()`、旧 `KernelSession::read_state()`、`read_stage4()` 或 `export_document()` 后再裁剪。收窄读取必须从 Application Capability 一直贯穿到 `LiveScoreStore`。

现有完整 `read()` 保持兼容。概要与完整会话读取可以使用不同的高效路径；通过合同测试验证相同版本下的 document ID、title 和 measure count 语义一致，不为了代码复用让概要查询重新依赖完整文档。

### 6.4 可用性

- 工作区 ID 无效：`rejected`。
- 工作区没有打开的文档：`unavailable`。
- 文档存在：`completed`。
- 无法读取 Kernel 状态：`failed`。

不存在“自动创建默认乐谱”的隐式行为。读取能力不能为了返回结果产生写入副作用。

## 7. Catalog、Gateway 与 Handler

```text
Capability Catalog
  保存静态、已审核的第一方 Descriptor 和 Handler 所有权

Capability Gateway
  校验 Invocation → 查找合同 → 检查版本 → 解析输入 → 调用 Handler → 校验输出 → 返回 Result

Capability Handler
  调用 ScoreSessionService.read_summary() 并映射领域结果
```

### 7.1 传输边界的类型擦除

为了让不同 Capability 通过统一 Gateway，Tauri 传输层会使用通用 Envelope。类型擦除只允许发生在传输和注册表边界：

```text
通用 JSON Envelope
  → Gateway 按 capabilityId 找到合同
  → 严格解析为该能力的具体输入类型
  → 类型化 Handler
  → 具体输出类型
  → 严格编码为 Result Envelope
```

业务 Handler 内部不使用到处传递的无类型 JSON。未知 Capability、未知字段和不支持的合同版本都在 Gateway 拒绝。

### 7.2 第一方静态 Catalog

A1 使用编译期第一方 Catalog，不实现运行时第三方 Handler 注册。这样可以先验证合同和执行路径，同时保持能力所有权清晰。

未来领域插件可以通过受审核的插件装配贡献 Capability，但仍需经过身份、版本和所有权冲突检查。

## 8. TypeScript Client 与调用方适配

Workbench Host Bridge 增加通用的 `invokeCapability` 传输端口，但 UI 和业务代码不直接拼接 Capability ID 与 JSON。TypeScript 提供类型化 Client：

```text
ScoreCapabilityClient.readSummary()
  → 构造受支持的 Invocation
  → 调用 Host Bridge
  → 严格解码 Result
  → 返回类型化结果
```

未来：

- UI Command 调用类型化 Client。
- Agent Tool Adapter 将模型业务参数转换后调用同一 Client 或宿主 Gateway。
- 测试可以直接验证 Gateway 和类型化 Client。

不允许 UI 组件或模型直接调用任意字符串 Capability。

## 9. A1 与现有命令系统的关系

A1 不迁移任何现有写命令。现有编辑、历史、播放和文件流程继续工作。

`score.read-summary` 可以先由测试和未来 Context Provider 使用；无需为了证明 Capability 而添加一个没有产品价值的新按钮。

现有 `WorkbenchCapabilityRegistry` 的术语重命名可以与 A1 同步完成，但应是纯机械兼容重构，并由现有 UI 插件测试保护。它不应与 `score.read-summary` 业务行为混在一个不可审查的大改动中。

## 10. A1 明确不做

- 不接真实或 Fake 模型；Fake Provider 属于 A3。
- 不建立 Agent Run。
- 不实现审批、权限策略和 Proposal。
- 不实现写入 Capability。
- 不把现有所有 Tauri commands 改成 Capability。
- 不开放第三方动态能力注册。
- 不生成完整 JSON Schema 工具描述。
- 不在 Capability 合同中加入 UI 文案、快捷键或布局信息。
- 不为了“一步到位”实现所有未来结果状态。

## 11. 实施边界

预计触及的职责区域：

```text
apps/desktop/src-tauri/src/
  capability/          Catalog、Gateway、score.read-summary Handler
  application/         收窄 read_summary 用例
  dto.rs               Transport Envelope 与 ScoreSummaryV1
  commands.rs / lib.rs 单一 Capability invoke command

apps/workbench/src/
  capabilities/        合同、Result 解码和 ScoreCapabilityClient
  services/            Host Bridge 传输适配

apps/workbench/test/
  Capability Client、Gateway 边界和无回归测试
```

最终文件布局在实施前结合 Rust 模块习惯确认，不为追求目录对称提前拆分过多文件。

## 12. 验收标准

- `score.read-summary` 从 Rust 权威 Session 返回最小概要。
- 输出始终包含一致的 document ID、version、title 和 measure count。
- 读取概要不构建或传输 notation、playback 和完整文档。
- 未知 Capability、版本和输入字段被明确拒绝。
- 没有文档时返回 `unavailable`，不隐式创建文档。
- TypeScript 对 Result Envelope 和成功输出进行严格解码。
- Browser 与 Tauri Host Bridge 的合同有明确行为；浏览器开发路径不得伪造成功。
- 现有 create、edit、read、playback、save 和 UI 插件测试继续通过。
- A1 不改变文档、历史、文件保存或恢复状态。

## 13. 待确认决策

建议接受以下 A1 方案：

1. Capability 执行权威放在 Rust 桌面宿主。
2. 使用一个通用 Tauri Gateway，但在 Gateway 后立即恢复严格具体类型。
3. `score.read-summary` 新增收窄 Rust 用例，依赖 A0 `score-overview` Selector，不包装完整 `read()`。
4. TypeScript 调用方使用类型化 Client，不直接拼 Capability ID。
5. A1 只实现四种结果状态，并为未来状态保留扩展方向。
6. 现有命令系统保持工作，后续逐条迁移业务动作。

## 14. 首个垂直切片实施记录

已完成：

```text
core.selector.score-overview
  -> KernelSession.select_stage4()
  -> ScoreSessionService.read_summary()
  -> Rust Capability Catalog / Gateway
  -> workbench_invoke_capability_v1
  -> WorkbenchHostBridge.invokeCapability()
  -> ScoreCapabilityClient.readSummary()
```

当前能力合同：

```text
capabilityId: score.read-summary
contractVersion: 1
input: {}
output:
  documentId
  documentVersion
  title
  measureCount
```

实现边界：

- Rust 桌面宿主使用真实窄查询，不调用完整 `read_state()` 后裁剪。
- Tauri 传输请求不能声明调用者身份；宿主注入可信 `Ui` 身份。
- 未来 Agent Runtime 可以在 Rust 内部使用同一 Gateway 并注入 `Agent` 身份。
- 浏览器开发宿主尚未同步窄 Selector，因此明确返回 `capability.host-unsupported`，不通过完整读取伪造成功。
- TypeScript 通用 Envelope 进入 `ScoreCapabilityClient` 后立即恢复为 `ScoreSummaryV1`。

验证结果：

```text
Desktop host tests: 32 passed
Kernel session tests: 56 passed
Workbench tests: 174 passed
```

下一步不扩展写入能力。先基于此入口实现 A2 的 `ContextBuilder`、
`ToolsetResolver` 和 `DecisionValidator` 最小合同，再用 Fake Provider 验证只读控制循环。
