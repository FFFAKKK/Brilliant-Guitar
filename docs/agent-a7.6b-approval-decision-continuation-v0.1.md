# A7.6b 批准决策与续跑

日期：2026-09-19

## 目标

A7.6a 回答了“用户在批准什么”。A7.6b 完成下一段闭环：

```text
AgentRequiredApproval
  -> AgentApprovalDecision
  -> approved / denied
  -> 原 Run 继续
```

第一版只支持一次性批准。批准只对合同里冻结的 Invocation 有效，不产生会话级或永久授权。

## 为什么不能批准后重新问模型

批准对象必须是用户刚刚看到的操作。如果批准后再次让模型生成参数，会出现：

```text
用户看到参数 A
  -> 用户批准 A
  -> 模型重新生成参数 B
  -> 系统执行 B
```

这会使批准失去意义。因此续跑直接执行持久化 Invocation 中的：

- `invocationId`
- `capabilityId`
- `contractVersion`
- `input`
- `baseDocumentVersion`

模型只在能力执行完成或用户拒绝以后，才进入下一轮规划。

## 决策合同

```ts
type AgentApprovalDecision = {
  approvalId: string;
  kind: "capability-execution";
  outcome: "approved" | "denied";
  decidedBy: "local-user";
};
```

它故意不包含工具参数、风险等级或作用域。用户的决定只能接受或拒绝已经冻结的合同，不能借批准接口改写调用。

## 批准状态转换

Run：

```text
waiting:executing:approval
  -> approval.approved
active:executing
  -> invocations.completed
active:verifying
  -> verification.continue
active:planning
```

Invocation：

```text
awaiting-approval
  -> approval.granted
validated
  -> invocation.dispatched
dispatched
  -> invocation.started
running
```

最重要的顺序是：

```text
1. 校验 approvalId、Invocation、合同版本和文档版本
2. sequence CAS 提交 approval.approved
3. 同一快照中把 Invocation 记录为 dispatched / running
4. 调用 Capability Port
```

步骤 2 和 3 使用同一次 Run Store 提交。应用若随后崩溃，恢复器会把 Invocation 当成已分发操作，通过 receipt 查询结果，而不会盲目再次调用。

## 三层防重复

### UI 身份

按钮携带 `runId + approvalId`。旧按钮不能决定新的批准请求。

### 进程内租约

`beginApprovalContinuation(runId, approvalId)` 确保当前运行时同一时间只有一个继续操作。

### 跨进程 CAS

两个窗口都读取 sequence N 时：

```text
窗口 A：approval.approved，N -> N + 1
窗口 B：approval.denied，仍以 N 提交
Run Store：sequence conflict
```

失败的旧写入在调用 Capability 前停止。因此 lease 解决单进程并发，CAS 解决跨窗口和跨进程竞争。

## 文档版本绑定

批准操作前会重新检查：

```text
workspaceId
documentId
documentVersion
```

乐谱版本变化后，原批准不能执行。用户需要基于新版本重新发起任务，避免把旧分析产生的写操作应用到新文档。

拒绝不执行 Capability，因此允许在文档版本变化后仍然提交拒绝。

## 拒绝语义

拒绝不是系统错误，也不伪装成用户取消整个 Agent：

```text
awaiting-approval
  -> approval.denied
rejected
```

控制面把拒绝作为 `user-preference` 上下文加入原 Run，然后回到 planning。模型可以说明任务无法继续，也可以寻找不需要该权限的替代路径。

模型不能把这次拒绝改写成批准；如果它提出新的风险调用，会生成新的 `approvalId` 并再次等待用户。

## 多调用批准屏障

一个模型回合可能同时提出普通调用和需批准调用。只要其中一项需要批准，整批 Invocation 会先暂停：

```text
validated normal invocation
awaiting-approval risky invocation
```

批准后整批按原顺序执行；拒绝后整批终止并回到规划。这样不会出现同一个模型决策执行一半后才询问用户，也不会让普通 Invocation 永久停在 `validated`。

批准 UI 只展示真正需要授权的风险项，不把普通调用伪装成需要授权的操作。

## 已落实的不变量

1. 决策只能引用当前持久化 `approvalId`。
2. 批准不能修改 Capability 输入。
3. 批准前重新校验 Workspace 和文档版本。
4. `approval.approved` 与 Invocation 分发状态原子持久化。
5. Capability 只在持久化提交成功后调用。
6. 拒绝路径不会调用 Capability。
7. 拒绝会作为用户提供的必要上下文进入下一轮规划。
8. 混合调用批次不会遗留 `validated` Invocation。
9. 进程内使用 approval continuation lease。
10. 跨进程旧决策由 sequence CAS 拒绝。
11. IPC 会拒绝事件类型与 decision outcome 不一致的数据。
12. 应用重启后仍从同一 Run 和同一 Submission 继续。

## 下一阶段

A7.6c 应补齐批准后的恢复闭环和审计投影：

- 从事件日志投影批准消费记录。
- 将 `retry-available` 接入经过确认的 Invocation 重试执行器。
- 验证“已批准并记录分发，但宿主证明未开始”的崩溃窗口。
- 展示批准人、决策时间和最终执行结果。
- 保持重试使用原 `invocationId` 或明确的新 attempt identity，不能模糊处理。
