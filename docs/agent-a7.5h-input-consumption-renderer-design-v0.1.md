# A7.5h 输入消费投影与统一渲染

日期：2026-09-19

## 目标

A7.5f 和 A7.5g 已经建立：

```text
AgentRequiredUserInput
  -> AgentProvidedUserInput
  -> user-input.provided
```

A7.5h 继续解决两个产品化问题：

1. 如何查询一次输入请求是否已经被消费，以及消费了什么。
2. 如何避免每增加一种输入类型，就把恢复面板改成一组分散的条件判断。

## 消费记录不是第二份状态

Run 事件日志已经保存：

```text
user-input.required(requestId)
user-input.provided(requestId)
```

因此没有必要再维护一张可变的“输入消费表”。如果事件日志和消费表分别写入，就会出现：

- Run 已继续，但消费表写入失败。
- 消费表显示已提交，但 Run 仍处于等待状态。
- 崩溃恢复时无法判断哪一份数据才是权威状态。

本阶段采用事件投影：

```ts
projectAgentUserInputConsumptions(run)
```

它按照 `requestId` 配对 required 和 provided 事件，生成只读记录：

```ts
type AgentUserInputConsumptionRecord = {
  requestId: string;
  requestEventId: string;
  requestedAt: number;
  providedEventId: string;
  providedAt: number;
  requiredInput: AgentRequiredUserInput;
  providedInput: AgentProvidedUserInput;
};
```

这是一种典型的“事件日志作为事实源，读模型按需投影”设计。消费记录可以被审计、指标和支持工具使用，却不会产生双写一致性问题。

## 跨进程防重复

单进程中的 continuation lease 可以阻止同时执行两个继续操作，但商业级系统还必须考虑两个窗口或进程持有同一个旧快照。

真正的防重复边界是 Run Store 的 sequence compare-and-swap：

```text
两个执行器都读取 sequence N
  -> 执行器 A 提交 user-input.provided，N -> N + 1
  -> 执行器 B 仍以 expectedSequence N 提交
  -> sequence conflict，B 不得进入 Provider 或 Capability
```

因此 continuation lease 解决进程内互斥，持久化 sequence 解决跨进程竞争，两者职责不同。

## 统一输入渲染器

恢复面板不再直接理解 `measure-selection` 的按钮行为，而是把合同交给：

```tsx
<AgentRequiredInputControl input={requiredInput} />
```

渲染器使用判别联合类型进行穷尽匹配。当前只有：

```text
measure-selection -> 选择小节后继续
```

未来增加 `choice`、`text` 或 `approval` 时，合同和渲染器必须同时扩展；如果遗漏渲染分支，TypeScript 会在穷尽检查处报错。

这比注册一个复杂的动态表更适合当前阶段：输入类型仍少，静态穷尽检查更简单、更容易审计。等第三方插件需要贡献输入类型时，再把它升级为受权限控制的 renderer registry。

## 重启后的体验

输入控件现在只依赖恢复投影中的 `requiredInput`，不依赖内存 Session 已经保存该请求。应用重启后：

```text
Run Store
  -> RecoveryProjection.requiredInput
  -> AgentRequiredInputControl
  -> 用户提交
  -> Session 从 Run 重建最小对话
```

因此持久化 Run 是恢复依据，React 内存状态只是当前视图投影。

## 已落实的不变量

1. 消费记录只由持久化 Run 事件投影，不进行第二次写入。
2. required 和 provided 必须通过同一 `requestId` 配对。
3. 没有对应 required 的 provided 不会形成消费记录。
4. 一个请求最多形成一条有效消费记录。
5. 重复提交旧快照会被 Run Store sequence conflict 阻止。
6. 重复提交在冲突发生前不会调用 Provider 或 Capability。
7. UI 输入渲染集中在一个穷尽匹配组件中。
8. 重启后的输入控件不依赖旧 Session 内存。
9. IPC 会拒绝非法的 required 和 provided 输入合同。

## 下一阶段

A7.6 可以开始处理批准机制。批准不能简单复用普通文本输入，因为它涉及：

- 被批准的具体 capability invocation。
- 风险摘要和预期副作用。
- 一次批准、会话批准和策略批准的不同有效期。
- 拒绝后 Run 是重新规划、取消还是失败。
- UI 必须展示控制面生成的风险信息，而不是模型自行描述的风险。

因此下一步应先设计 `RequiredApproval` 合同和批准状态转换，再决定是否把它并入通用 `RequiredUserInput` 联合类型。
