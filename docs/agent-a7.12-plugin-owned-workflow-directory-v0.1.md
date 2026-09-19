# A7.12 插件所有的工作流目录与 Agent 接入 v0.1

日期：2026-09-19。

> 2026-09-20 目标架构更新：本切片建立的 Workflow Directory 和所有权固定继续保留；
> `operationIds` 及当前 `ApplicationCapability` 调用链是迁移桥接，不是最终共享执行层。
> 最终工作流通过受限 `WorkflowRuntimeContext` 调用类型化领域端口，详细迁移见
> [插件平台、UI 贡献、工作流与固定会话重构方案](plugin-platform-ui-contribution-and-session-freeze-plan-v1.md)。

## 目标

把 Agent 的业务入口从“核心代码硬编码一组零散能力”推进为“领域插件注册聚合工作流，Agent 消费统一工作流目录”。本切片不重写已经验证过的审批、恢复、预算和完成校验状态机。

## 架构

```text
Domain Plugin
  ├─ typed domain service requirements
  └─ Workflow Contributions
          ↓
PluginPlatform / WorkflowDirectory
          ↓
AgentWorkflowRuntime
          ↓
Agent RunController / WorkflowRuntime
          ↓
workflow-scoped typed port -> Rust Application Service -> Kernel
```

这里不存在“工作流插件注入另一个工作流插件”。领域插件提交 `WorkflowContribution`，平台生成按所有者分类的只读目录，Agent Runtime 负责解释 `runtime` 类型并执行。

## 固定会话不变量

插件平台在 `start()` 后冻结当前会话。运行中不能安装、卸载、启停或升级插件，因此 Workflow Runtime 不实现热卸载、`draining` 或运行中定义替换。

跨应用重启的恢复仍然需要版本保护。每个新 Run 固定：

- `workflowId`
- `contractVersion`
- `ownerPluginId`
- `ownerPluginVersion`

恢复时任一字段不匹配都会拒绝继续，避免旧任务在新插件版本上被静默重放。

## 当前工作流粒度

乐谱插件只注册两个领域工作流，而不是为每个小操作创建工作流：

### `score.inspect`

聚合乐谱概要、元数据、结构和有界小节读取入口。

### `score.edit-metadata`

聚合标题、速度和组合元数据编辑入口。底层 prepare/commit、版本前置条件、批准和完成校验仍是控制面的实现细节。

`operationIds` 表示运行时可能使用的 Operation 集合；`entryOperationIds` 表示当前确定性意图路由可以从哪些 Operation 进入该工作流。两者分开后，多个工作流可以复用原子 Operation，而不会把所有复用都误判成路由冲突。

## 已实现

- `WorkflowContribution`、`RegisteredWorkflow` 和只读 `WorkflowDirectory`。
- `PluginPlatform` 按 `ownerPluginId` 和插件版本注册工作流。
- 禁用插件不会进入当前目录；启动后启停不会改变目录。
- 重复工作流 ID 只隔离冲突插件。
- `AgentWorkflowRuntime` 负责入口解析、歧义拒绝、Operation 可用性检查和固定身份恢复校验。
- Agent Assistant 生产接线从 `workbenchPluginPlatform.workflows()` 获取目录，并把工作流身份写入 Run。

## 本切片刻意不做

- 不实现运行时插件卸载。
- 不让模型直接选择任意插件或绕过 Operation Port。
- 不立即引入低代码图编辑器。
- 不把 UI Command 当作 Agent 工具。
- 不一次性迁移所有历史 `Capability` 命名。

## 下一步

下一阶段把 `score.edit-metadata` 的 prepare、批准、commit 和 verify 表达为版本化 Workflow IR，使目前 `FirstPartyPreparedMutationCoordinator` 中的领域分支迁回乐谱插件。Workflow IR 只允许有界 Operation、Condition、Request Approval、Request User Input、Verify 和受限组合节点，不执行任意脚本。
