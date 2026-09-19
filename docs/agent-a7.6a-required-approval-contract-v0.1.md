# A7.6a 批准请求合同与风险快照

日期：2026-09-19

## 本阶段目标

A7.6a 先解决“用户究竟在批准什么”，暂不执行批准后的 Capability。

本阶段建立：

```text
Validated Tool Call
  -> Pending Capability Invocation
  -> AgentRequiredApproval
  -> approval.required Run Event
  -> Recovery Projection
  -> Read-only Approval Summary UI
```

下一阶段 A7.6b 才加入 `approved` / `denied` 决策及续跑执行。

## 批准不是普通用户输入

选择小节是在补充完成任务所需的数据：

```text
AgentRequiredUserInput -> AgentProvidedUserInput
```

批准是在授予一个已经验证过的 Invocation 执行权限：

```text
AgentRequiredApproval -> future AgentApprovalDecision
```

两者的差别不只是 UI：

- 用户输入改变任务参数或上下文。
- 批准不允许修改模型参数，只允许对固定 Invocation 做同意或拒绝。
- 输入错误通常可以重新填写；批准必须绑定具体能力、版本、作用域和副作用。
- 批准前 Capability 不能进入 dispatched 状态。

因此旧的 `RequiredUserInput` 批准占位类型已重命名为 `AgentApprovalRequirement`，避免和真实输入合同混淆。

## 批准合同

持久化事件现在包含完整合同：

```ts
type AgentRequiredApproval = {
  approvalId: string;
  kind: "capability-execution";
  prompt: string;
  items: readonly AgentRequiredApprovalItem[];
};
```

每个 item 绑定：

- `invocationId`：批准的最小身份边界。
- `capabilityId` 与 `contractVersion`：防止能力或合同被替换。
- `capabilityName` 与 `summary`：用户可读说明。
- `scope`：工作区、乐谱、文档版本和能力作用范围。
- `sideEffects`：结构化副作用，而不是模型自由文本。
- `riskLevel` 与 `riskReasons`：由控制面从 Capability 描述符推导。

## 为什么风险摘要必须由控制面生成

模型只提出调用意图。它不应该自行决定：

- 这次调用是不是写操作。
- 操作影响当前乐谱还是外部文件。
- 是否需要批准。
- UI 应该把它描述成低风险还是高风险。

这些信息来自受信任的 Capability Descriptor 和当前 Workspace Snapshot。否则模型可以通过改变措辞弱化风险，形成“自己申请、自己解释、自己放行”的错误边界。

当前风险规则是保守的第一版：

```text
任意 write 副作用 -> high
播放或网络访问 -> medium
其他策略要求确认的操作 -> low
```

以后可以把规则替换为独立 Policy Engine，但 `AgentRequiredApproval` 合同不需要改变。

## 为什么批准请求要进入 Run 事件

批准 UI 不能临时重新读取最新 Descriptor 再生成说明。因为等待期间可能发生：

- 应用重启。
- 插件或 Capability 升级。
- 乐谱版本变化。
- 第二个窗口读取同一个 Run。

因此批准请求和 Invocation 一起持久化：

```text
approval.required(approval snapshot)
```

恢复时 UI 展示的是当时真正被冻结的批准快照，而不是现在重新推测出的内容。

## 状态机边界

当前已落实：

```text
active:planning
  -> turn.tools-accepted
active:executing
  -> approval.required
waiting:executing:approval
```

批准前 Invocation 保持：

```text
requested -> validated -> awaiting-approval
```

它不能进入：

```text
dispatched -> running
```

这种“先暂停并保存状态，之后从同一 Run 恢复”的模式也符合成熟 Agent SDK 的 Human-in-the-loop 设计。关键不是弹出一个确认框，而是把中断点、待批准调用和恢复状态作为运行时的一等对象。

## 已落实的不变量

1. 批准和普通用户输入使用不同合同。
2. 批准请求由控制面生成，模型不能提供风险等级和副作用。
3. 每个批准 item 绑定唯一 `invocationId`。
4. 批准请求记录 Capability 合同版本和文档版本作用域。
5. 批准前不会调用 Capability Port。
6. 批准请求持久化在 Run 事件中，可跨重启恢复。
7. IPC 边界拒绝缺失风险原因、非法作用域或重复 Invocation 的批准合同。
8. Recovery Projection 只展示持久化批准快照。
9. UI 已能展示能力、风险等级、作用范围和风险原因。

## A7.6b

下一阶段加入：

```text
AgentApprovalDecision
approval.approved / approval.denied
Invocation approval.granted / approval.denied
approval continuation lease
sequence CAS
```

第一版只支持对本次具体 Invocation 的一次性批准，不支持“本会话始终批准”或永久策略。长期授权会扩大权限边界，必须等 Policy Engine、撤销机制和审计界面一起设计。
