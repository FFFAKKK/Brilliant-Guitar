# A7.5e 用户输入等待与同一 Run 恢复

日期：2026-09-19

## 目标

当用户要求读取当前选择的小节，但控制面发现当前没有选择区时，Agent 不应把任务判定为失败，也不应创建第二个任务。

正确流程是：

```text
执行 score.read-measures(current-selection)
  -> 控制面发现 selection-unavailable
  -> 原 Run 进入 waiting:user-input
  -> 用户在谱面中选择小节
  -> 控制面注入最新 workspace sidecar
  -> 原 Run 从 planning 继续
  -> 完成并关闭原 submission
```

## 为什么这是状态机问题

“缺少选择区”不是技术故障，而是任务暂时缺少继续执行所需的用户事实。

如果把它记为 `capability-failed`，系统会丢失三个重要事实：

- 任务仍然有效。
- 用户可以通过一个明确动作解除阻塞。
- 恢复后必须继续原 Run，而不是重新收费、重新建历史或重复已经完成的调用。

因此新增事件：

```ts
{ type: "user-input.required", reason: "selection" }
```

它把执行中的 Run 转为：

```ts
{ lifecycle: "waiting", phase: "planning", waitReason: "user-input" }
```

恢复时持久化 `run.resumed`，再回到 `active:planning`。状态机记录的是业务承诺，不是 UI 是否显示了按钮。

## 为什么回到 planning

缺少选择时，原 capability invocation 已经以结构化拒绝结束，不能假装它仍在运行，也不能直接复用它。

用户提供选择后，模型需要基于新的 `selectionAvailable` 上下文重新作出下一步决定。控制面会创建新的 invocation，但保留：

- 同一个 `runId`
- 同一个 `submissionId`
- 同一个对话 assistant 消息
- 已使用的回合、预算、策略和审计事件

这体现了一个重要原则：恢复的是任务身份，不是复活某次已经结束的工具调用。

## Continuation Lease

等待 Run 会出现在恢复列表中，并阻止普通 `beginRun()`，这是为了避免用户在未处理旧任务时并发启动新任务。

但同一个 Run 必须有一条受控的继续通道：

```ts
beginContinuation(runId)
```

它只在以下条件同时成立时发放租约：

- Agent 插件仍启用。
- Provider 可用。
- 当前没有其他活动 Run。
- 恢复列表中存在同一 `runId`。
- 该恢复项的动作是 `provide-input`。

Continuation Lease 不是绕过恢复保护，而是恢复保护为原任务开出的单用途通行证。

## 最新 Workspace Sidecar

模型参数仍然只有：

```ts
{ reference: { kind: "current-selection" } }
```

继续时由应用重新构建最新的 `AgentWorkspaceScope`，把当前文档版本和真实选择区通过 sidecar 交给能力层。模型不能声明或修改这些权威值。

控制器拒绝跨 workspace 或跨 document 继续，但允许同一文档在等待期间产生新版本。这样用户可以完成选择或正常编辑，同时不会把 Run 偷渡到另一份乐谱。

## 对话投影

Capability activity 新增 `waiting` 状态。它与 `failed` 的区别会直接影响产品体验：

- `failed`：当前动作已经失败，需要重试或结束任务。
- `waiting`：系统知道缺什么，并正在等待用户提供。

用户提供选择后，原等待 activity 被标记完成；后续规划和读取 activity 继续追加到同一个 submission。最终完成时，对话中不会出现两个看似无关的任务。

## 已落实的不变量

1. `selection-unavailable` 不进入 terminal failed。
2. 缺少选择时不读取小节索引，也不调用原子范围能力。
3. 继续操作必须匹配原 `runId`。
4. workspace 和 document 身份不得切换。
5. 文档版本和选择区使用继续时的最新 sidecar。
6. 已拒绝的 invocation 不会被重新派发。
7. 普通新 Run 仍会被 blocking recovery item 阻止。
8. 最终完成后，恢复项通过刷新被清理。

## 后续阶段

A7.5f 可以继续处理跨进程体验和更通用的用户输入合同：

- 应用重启后重建等待中的对话表面。
- 把 `selection` 扩展为结构化 `RequiredUserInput` 合同。
- 为批准、文本补充和候选选择复用同一等待框架。
- 增加等待时长、恢复成功率和用户放弃率等可观测指标。
