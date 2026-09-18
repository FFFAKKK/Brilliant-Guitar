# AI Agent 上下文与工具集设计 v0.1

日期：2026-09-18  
状态：A2 首个垂直切片已实施  
前置：[AI Agent 控制面设计](agent-control-plane-design-v0.1.md) · [AI Agent 架构优化方案](agent-architecture-optimization-plan-v0.2.md) · [A1 Capability Foundation](agent-a1-capability-foundation-design.md)

## 1. 这一层要解决什么

状态机和恢复机制解决了：

```text
Run 当前处于什么状态？
之前发生过什么？
重启后能否安全继续？
```

上下文与工具集解决的是：

```text
这一轮模型决策，应该知道什么？
这一轮模型决策，允许使用什么？
哪些信息和能力必须隐藏？
```

Agent 的质量不只取决于模型能力，也取决于控制面给模型的边界。

```text
上下文过多：
  成本高、重点不清、容易混淆版本

工具过多：
  选择困难、误调用增加、权限边界变模糊

上下文过少：
  模型无法判断下一步

工具过少：
  任务无法完成
```

因此 A2 的目标不是“把更多应用信息喂给模型”，而是：

> 对当前任务，在当前状态下，提供完成下一步所需的最小事实和最小能力集合。

## 2. 两个不同的最小权限

Agent 需要同时受到两类限制：

```text
Information Least Privilege
  模型只能看到完成当前任务所需的信息

Action Least Privilege
  模型只能调用完成当前任务所需的能力
```

例如用户问：

```text
这首曲子有多少小节？
```

模型通常只需要：

```text
上下文：
  当前文档身份和版本

工具：
  score.read-overview
```

它不需要：

```text
完整乐谱
播放源
全部编辑命令
文件绝对路径
其他工作区
```

## 3. Context Item：上下文的基本单位

Context 不应该只是拼接成一段无来源的字符串。每一项上下文都应是结构化的
`Context Item`：

```text
contextItemId
kind
content
sourceType
sourceId
documentId
documentVersion
scope
trustLevel
createdAt
expiresAt
```

### 3.1 `kind`

建议从少量稳定类别开始：

```text
user-goal
workspace-scope
selection
authoritative-fact
capability-result
derived-analysis
user-preference
system-constraint
```

### 3.2 `trustLevel`

不同来源不能混为一谈：

```text
authoritative
  来自 Kernel 或已验证的 Capability Result

user-provided
  用户直接提供的内容

derived
  模型或分析能力推导出的结论

untrusted
  未验证的外部或导入内容
```

`derived` 可以帮助模型继续工作，但不能替代 `authoritative` 事实。尤其是在写入
前，控制面必须重新读取权威状态。

### 3.3 来源和版本

涉及乐谱的 Context Item 必须尽可能携带：

```text
documentId
documentVersion
scope
```

这样模型看到的不是：

```text
标题是 xxx
```

而是：

```text
标题是 xxx
来源：score.read-overview
文档版本：42
作用域：document
```

模型不需要理解所有内部元数据，但控制面必须保留这些元数据，以便验证和审计。

## 4. Context Builder 的职责

`Context Builder` 是控制面中的纯装配组件：

```text
Run State
  + 当前用户输入
  + 当前工作区作用域
  + 已验证的能力结果
  + 当前阶段需要的历史
  + 策略和预算
  -> Model Context
```

它负责：

- 选择上下文项；
- 去重相同来源和版本的数据；
- 处理版本混合；
- 按优先级截断；
- 隐藏内部实现细节；
- 为 Provider 生成稳定的输入结构。

它不负责：

- 调用 Kernel；
- 调用模型；
- 修改 Run 状态；
- 解释音乐规则；
- 直接决定是否执行工具。

如果缺少事实，Context Builder 可以返回缺口：

```text
context-gap:
  required: score.read-range
  reason: "当前只有文档概要，无法分析第 12 到 20 小节"
```

实际是否调用该能力，仍由控制循环和 Toolset 决定。

## 5. 上下文分层

每一轮上下文建议按以下顺序组织：

```text
1. 固定系统约束
2. 用户当前目标
3. 当前 Run 状态和阶段
4. 工作区、文档和选区作用域
5. 权威事实摘要
6. 已验证的能力结果
7. 必要的用户偏好
8. 最近相关对话
9. 当前预算和完成条件
```

不是所有内容都需要以自然语言注入。对于能力结果和来源，优先使用结构化数据，
让模型看到稳定字段，而不是依赖 UI 文案。

### 5.1 对话历史不是唯一记忆

不能把全部聊天记录当成上下文。历史消息需要经过筛选：

```text
保留：
  当前目标仍然有效的约束
  用户明确确认的偏好
  尚未完成的澄清问题
  对当前范围有影响的决定

移除或压缩：
  已经被权威结果取代的旧事实
  重复工具输出
  与当前任务无关的闲聊
  过期的版本信息
```

用户说过的话是用户输入，不自动等于当前文档事实。文档事实以 Kernel 和
Capability Result 为准。

## 6. Context Budget：上下文预算

上下文预算不是只有 Token 数量，还应包含：

```text
tokenBudget
itemCountBudget
toolResultSizeBudget
rangeBudget
historyTurnBudget
```

推荐的裁剪优先级：

```text
必须保留：
  当前目标、作用域、版本锚点、完成条件、关键权威结果

优先压缩：
  重复结果、旧版本结果、过长的分析文本、无关历史

不能静默裁剪：
  审批范围、版本冲突、错误状态、取消状态、安全约束
```

如果裁剪后无法安全完成任务，控制面应请求更窄的查询或向用户说明缺少信息，
不能通过截断关键事实来假装上下文完整。

## 7. Toolset Resolver 的职责

`Toolset Resolver` 决定当前 Turn 暴露给模型的 Capability Descriptor：

```text
Capability Catalog
  -> Agent Allowlist
  -> Run Policy Snapshot
  -> 当前 Run 阶段
  -> 当前任务意图
  -> 当前文档和作用域
  -> 当前预算
  -> Run Toolset
```

它负责：

- 从全局 Catalog 选择能力；
- 检查 Agent 插件允许列表；
- 过滤当前阶段不可用的能力；
- 过滤作用域不匹配的能力；
- 隐藏需要更高权限或用户确认的能力；
- 限制单回合工具数量和成本；
- 生成本回合工具集快照。

它不负责：

- 执行能力；
- 解析模型参数；
- 判断能力结果是否真实；
- 代替审批；
- 因模型要求而临时扩大权限。

## 8. Run Toolset 与 Turn Toolset

需要区分两个范围：

```text
Run Allowlist / Policy
  Run 创建时确定的最大允许范围

Turn Toolset
  当前这一轮实际暴露给模型的更小范围
```

原则是：

```text
Turn Toolset 可以缩小 Run 范围，不能扩大 Run 范围。
```

例如：

```text
Run 允许：
  score.read-overview
  score.read-range
  guitar.analyze-difficulty
  score.set-title

当前只读分析 Turn 暴露：
  score.read-overview
  score.read-range
  guitar.analyze-difficulty
```

`score.set-title` 虽然在 Run 最大范围内，但在当前任务阶段被隐藏。后续即使模型
猜到这个 Capability ID，也会因为不在 Turn Toolset 中被拒绝。

每个 Turn 应记录：

```text
toolsetSnapshotId
toolsetHash
capabilityIds
policyVersion
```

这样可以解释模型当时究竟看到了哪些工具。

## 9. 工具集过滤顺序

过滤顺序建议固定为：

```text
1. Capability 是否存在且合同有效
2. Agent 插件是否允许
3. Run 策略是否允许
4. 当前阶段是否允许
5. 当前用户和工作区是否满足前置条件
6. 当前文档作用域是否匹配
7. 当前预算是否允许
8. 是否需要审批
9. 生成模型可见 Descriptor
```

过滤失败不应暴露内部实现细节。对模型只需要结构化表达：

```text
capability-not-exposed
missing-precondition
scope-exceeded
approval-required
budget-exceeded
```

## 10. 工具描述如何保持简洁

模型看到的是业务合同，不是代码说明：

```text
id
name
description
inputSchema
outputSummary
preconditions
sideEffects
scopeLimit
requiresApproval
failureModes
```

描述应回答：

```text
它能做什么？
什么时候应该用？
需要哪些输入？
会返回什么？
会不会修改内容？
可能为什么失败？
```

描述不应包含：

```text
Rust 模块路径
Tauri Command 名称
React 状态字段
内部缓存名称
文件绝对路径
其他能力的私有实现
```

## 11. 一个完整例子

用户请求：

```text
这首曲子有多少小节？第 12 到 20 小节适合初学者练习吗？
```

### 11.1 第一轮

Run 状态：

```text
phase: planning
lifecycle: active
```

初始 Context：

```text
user-goal:
  用户想知道总小节数，并分析第 12 到 20 小节

workspace-scope:
  当前工作区和当前文档
```

第一轮 Toolset：

```text
score.read-overview
score.read-range
```

模型可能先请求：

```text
score.read-overview
```

### 11.2 第二轮

工具结果加入 Context：

```text
documentId: score-1
documentVersion: 42
title: ...
measureCount: 64
source: score.read-overview
```

控制面发现还缺少第 12 到 20 小节的具体内容，于是保留：

```text
score.read-range
guitar.analyze-difficulty
```

其中 `guitar.analyze-difficulty` 只有在对应分析能力已被 Agent Allowlist 和当前
策略允许时才暴露。

### 11.3 第三轮

分析结果必须带：

```text
analyzedScope: measures 12..20
sourceDocumentVersion: 42
assumptions: ...
```

控制面验证范围和版本后，才允许 Run 完成。模型的自然语言结论只能作为展示内容，
不能代替这些验证字段。

## 12. 版本变化时如何处理

如果第一次读取得到版本 42，之后文档变成版本 43：

```text
探索性问答：
  可以继续读取版本 43，但明确告诉模型和用户版本已变化

准备写入：
  必须重新读取并以版本 43 作为新的 base version

需要严格一致的分析：
  重新读取分析范围，不能混用 42 和 43 的事实
```

Context Builder 可以保留旧结果用于诊断，但不能把旧结果伪装成当前事实。

## 13. 能力图在 A2 的落点

A2 使用能力图做导航，不把它变成执行引擎：

```text
score.read-overview
  -> refines -> score.read-structure
  -> refines -> score.read-range

score.read-range
  -> produces -> score.range-facts

guitar.analyze-difficulty
  -> requires -> score.range-facts
```

Toolset Resolver 可以使用这些关系发现候选能力，但最终仍逐项检查：

```text
allowlist
policy
scope
phase
budget
approval
```

能力图不能授予权限，也不能让一个 Capability 直接绕过 Gateway 调用另一个
Capability。

## 14. A2 的接口边界

第一版已用 TypeScript 固化控制面内部合同，但这些合同仍是 Agent 插件内部接口，
不是跨进程传输协议：

```text
ContextBuilder.build(runId, turnInput)
  -> ContextBuildResult

ToolsetResolver.resolve(runState, taskIntent)
  -> ToolsetResolutionResult

DecisionValidator.validate(decision, toolsetResolution, runState)
  -> ValidatedActions
```

其中：

```text
ContextBuildResult
  contextItems
  omittedItems
  versionWarnings
  budget

ToolsetSnapshot
  snapshotId
  toolDescriptors
  policyVersion
  toolsetHash

ToolsetResolutionResult
  snapshot
  omitted
  inputValidators

ValidatedActions
  acceptedActions
  rejectedActions
  requiredUserInput
```

这里有一个重要边界：`ToolsetSnapshot` 必须是纯数据，因为它将被记录、哈希、审计，
也可能发送给 Provider；`inputValidators` 是受信任控制面的可执行逻辑，不能进入模型
可见快照，因此只保存在 `ToolsetResolutionResult` 中。

## 15. 已实施的 A2 垂直切片

当前实现位于：

```text
apps/workbench/src/agent/agent-contracts.ts
apps/workbench/src/agent/context-builder.ts
apps/workbench/src/agent/toolset-resolver.ts
apps/workbench/src/agent/decision-validator.ts
apps/workbench/src/agent/first-party-capabilities.ts
```

已接入 A1 的第一个真实能力：

```text
score.read-summary@1
  kind: query
  scope: document
  cost: constant
  approval: false
  phases: planning / executing / verifying
```

当前链路是：

```text
第一方 Capability Catalog
  -> Run Policy + Task Intent + Run State
  -> Toolset Resolver
  -> 纯数据 Toolset Snapshot + 内部 Input Validators
  -> Decision Validator
  -> Validated Actions
```

首个切片已经验证：

1. 同源同版本的 Context Item 优先保留高优先级项，同优先级保留更新项。
2. 不同文档版本同时进入上下文时会产生显式警告。
3. 必需上下文不会因为普通预算裁剪而被静默丢弃，超预算会写入报告。
4. Run Policy 或任务意图之外的能力不会进入 Turn Toolset。
5. 模型猜测未暴露的 Capability ID 会被拒绝。
6. 合同版本错误、输入错误、重复调用标识和过量调用均由控制面拒绝。
7. `waiting` 等非活动状态不会暴露工具，也不会接受模型继续执行。
8. `finish` 只是完成请求，仍需后续完成条件校验。

对应测试：

```text
apps/workbench/test/agent-context-toolset.test.ts
```

## 16. A2 暂不做

```text
长期记忆
向量数据库
自动总结全部历史
动态第三方能力发现
自动扩展权限
把完整 ScoreDocument 放进 Context
让模型直接读取内部状态
```

这些能力会增加复杂度，但不能替代最基本的上下文来源、版本和工具权限设计。

## 17. A2 验收标准

1. 同一任务在不同 Run 中可以生成稳定、可解释的 Context。
2. Context Item 能追溯到来源、文档版本和作用域。
3. 当前 Turn 的 Toolset 不会超过 Run 的最大允许范围。
4. 未暴露的 Capability 即使被模型猜中也会被拒绝。
5. 只读任务不会看到写入能力。
6. 上下文和工具结果不依赖 UI 文案解析。
7. 版本变化会被显式标记，不会静默混合。
8. 超出预算时优先压缩重复内容，不丢弃安全约束。
9. Context Builder、Toolset Resolver 和 Decision Validator 可以独立测试。
10. 模型 Provider 可以替换，而不改变上下文来源和能力授权规则。

## 18. 本讲结论

```text
Context Builder 决定模型知道什么。
Toolset Resolver 决定模型能请求什么。
Decision Validator 决定模型请求是否真的允许执行。
Capability Gateway 决定能力是否真的被调用。
Kernel 决定事实是否真的成立。
```

Agent 的安全和可用性不是依赖某一个 Prompt，而是依赖这一条完整边界链：

```text
最小上下文
  -> 最小工具集
  -> 严格决策校验
  -> 统一 Capability Gateway
  -> 权威 Kernel 状态
```

A3 首个垂直切片已经使用 Fake Provider 验证这条控制链，详见
[A3 Run Core 设计与实施](agent-a3-run-core-design-v0.1.md)。下一阶段是在不改变
这些状态和事件语义的前提下，将 Run 检查点落入桌面宿主。
