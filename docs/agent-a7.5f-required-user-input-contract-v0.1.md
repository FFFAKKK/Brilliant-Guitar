# A7.5f RequiredUserInput 合同

日期：2026-09-19

## 目标

A7.5e 已经能够让同一个 Run 等待用户选择小节后继续，但等待原因仍被压缩成 UI 动作：

```ts
"select-measures"
```

这不足以成为商业级控制合同，因为它没有请求身份、来源调用、作用文档和约束。A7.5f 将等待点提升为持久化的领域对象，并让控制器、恢复服务、运行时租约、会话和 UI 共同校验同一个请求。

## 当前合同

第一版只实现真实需要的 `measure-selection`，不提前加入没有执行语义的空变体：

```ts
type AgentRequiredUserInput = {
  requestId: string;
  kind: "measure-selection";
  prompt: string;
  sourceInvocationId: string;
  constraints: {
    documentId: string;
    minMeasures: number;
    maxMeasures: number;
  };
};
```

用户提交值是另一份合同，不能直接把 UI 的 workspace 对象当作 Run 事件：

```ts
type AgentProvidedUserInput = {
  requestId: string;
  kind: "measure-selection";
  selection: AgentMeasureSelection;
};
```

请求描述“需要什么”，提交值描述“用户实际提供了什么”。两者通过 `requestId` 绑定，并在控制器中再次与当前 workspace sidecar、文档身份和请求约束交叉校验。

Run 事件直接保存完整请求：

```ts
{
  type: "user-input.required";
  input: AgentRequiredUserInput;
}
```

因此应用重启后不需要根据错误文案猜测用户应该做什么。

## 为什么需要 requestId

`runId` 只能确认“是哪一个任务”，不能确认“是哪一次等待”。同一 Run 未来可能依次请求两个输入，旧按钮、重复点击或延迟消息都可能错误地解除新的等待点。

继续租约现在匹配：

```text
runId + requestId
```

恢复后，旧请求在 `user-input.provided` 或 `run.resumed` 之后失效；如果同一个 Run 再次等待，必须生成新的 `requestId`。这相当于为等待点提供一次性关联令牌，而不是把 UI 点击当成可信事实。

## 为什么需要 sourceInvocationId

用户输入请求不是凭空产生的。当前请求来自一次被明确拒绝的 capability invocation：

```text
invocation rejected: selection-unavailable
  -> user-input.required
```

`sourceInvocationId` 让日志、恢复投影和问题诊断能够回答：

- 哪次能力调用发现缺少输入。
- 用户输入解除的是哪个阻塞点。
- 恢复后创建的新 invocation 是否错误地复用了旧调用身份。

恢复的是 Run，不是已经结束的 invocation。

## 权威输入仍由控制面提供

合同只描述需要什么输入，不把真实选择端点交给模型填写。模型仍然只能表达：

```ts
{ reference: { kind: "current-selection" } }
```

用户完成选择后，应用从最新 workspace sidecar 读取：

- 当前 documentId 和 documentVersion。
- 当前 startMeasureId 和 endMeasureId。
- 当前 selection 是否仍属于同一文档版本。

`constraints` 用于控制面和 UI 校验；最终范围长度仍由能力层根据权威小节索引和 range budget 验证。

## 持久化与恢复边界

恢复投影现在携带完整 `requiredInput`。UI 不再比较字符串动作，而是按判别字段渲染：

```text
requiredInput.kind === "measure-selection"
```

桌面 IPC 解码器还会对持久化请求执行运行时校验，包括非空 ID、合法约束和 `minMeasures <= maxMeasures`。TypeScript 类型只约束编译期，不能代替不可信持久化数据的边界验证。

## 当前恢复链

```text
Capability 返回 selection-unavailable
  -> Controller 创建 RequiredUserInput
  -> Run 持久化 user-input.required
  -> RecoveryProjection 重建 requiredInput
  -> UI 展示 prompt
  -> 用户选择小节
  -> Session 构建 AgentProvidedUserInput
  -> Controller 校验 runId + requestId + documentId + selection
  -> Run 持久化 user-input.provided
  -> Runtime 发放 continuation lease
  -> Run 进入 active:planning
  -> 最新 workspace sidecar 注入下一轮 planning
```

## 与成熟 Agent 模式的关系

这一设计采用了成熟 Agent 和工作流系统中常见的四个原则：

1. 中断是可持久化的控制状态，不是临时 UI 状态。
2. 恢复必须携带可校验的关联身份，不能只依赖自然语言。
3. 用户提供的数据和系统权威上下文必须在控制面合并。
4. 恢复从已保存状态继续，不能重复执行已经结束或结果未知的工具调用。

OpenAI Agents SDK 的 interruption/resume、Microsoft Agent Framework 的 checkpointed workflow、Google ADK 的 long-running tool 恢复，都体现了相同的大方向。我们的实现不直接依赖这些框架，而是把原则落实到本项目的统一 Capability、Run 事件和插件运行时中。

## 已落实的不变量

1. 每次结构化等待都有非空 `requestId`。
2. 输入请求和来源 invocation 可审计关联。
3. 过期或错误的 `requestId` 无法获取 continuation lease。
4. 会话快照、恢复投影和持久化 Run 必须指向同一请求。
5. 继续操作不能切换 workspace 或 document。
6. 真实选择端点不会进入模型生成的 capability 参数。
7. IPC 返回的残缺输入请求会在边界被拒绝。
8. `user-input.provided` 或 `run.resumed` 之后旧输入请求不再有效。
9. 用户提交值必须与请求 ID、文档身份和当前选择区同时匹配。
10. 应用重启后，Session 可以仅凭持久化 Run 重建最小对话消息和等待 activity。

## 下一阶段

A7.5h 应继续完善用户输入的可靠性：

- 为提交增加独立的消费记录，支持跨进程防重复和审计查询。
- 把重建出的等待输入从当前选择区按钮扩展为统一输入渲染器。
- 再按真实产品需求增加 `choice`、`text` 或 `approval` 判别变体。
- 增加等待耗时、过期提交和恢复成功率指标。
