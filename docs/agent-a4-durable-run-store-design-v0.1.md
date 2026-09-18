# AI Agent A4 Durable Run Store 设计 v0.1

日期：2026-09-18  
状态：设计阶段  
前置：[A3 Run Core 设计与实施](agent-a3-run-core-design-v0.1.md) · [AI Agent 控制面设计](agent-control-plane-design-v0.1.md)

## 1. A4 要解决什么

A3 的 Run 状态目前只存在内存中。窗口关闭、进程崩溃或应用重启后，系统必须知道：

```text
最后一个已经记录的事实是什么？
有没有已经发出的 Invocation？
它的结果是否确定？
当前 Run 是否可以自动继续？
```

A4 的目标是让 Run 的关键状态和事件跨越宿主重启仍然可以被恢复、审计和安全地继续。
A4 不保存完整乐谱，也不把完整聊天记录当作恢复依据。

## 2. TypeScript 与 Rust 的分工

### TypeScript 保留

```text
Context Builder
Toolset Resolver
Decision Validator
Run Reducer / Invocation Reducer
Provider Port 和 Fake Provider
AgentRunController
Completion Verifier
Agent UI 投影
```

这些模块主要是小对象、短计算和异步编排，适合快速迭代和确定性测试。

### Rust 宿主承载

```text
Durable Run Store
Run 检查点和事件的原子写入
事件序号和幂等校验
损坏记录隔离
可恢复 Run 枚举
宿主生命周期相关的恢复工作
```

以后接入真实 Provider 时，API Key、Provider 代理和宿主级恢复也应位于受控宿主侧，
不放进普通 WebView 状态。Tauri 的基本模型就是 WebView 与 Rust Core 通过消息传递
协作，Core 适合管理全局状态、持久化连接和敏感数据。citeturn0search2turn0search10

### Kernel 继续承载

```text
乐谱事实、文档版本、领域命令、事务、历史和权威 Query Projection
```

Agent Store 不是第二个 Kernel，也不保存第二份 ScoreDocument。

## 3. A4 的核心原则

```text
Event 是事实来源
Snapshot 是恢复优化
一次提交只推进一个事件序号
副作用前先记录意图
结果不确定时不能生成新 Invocation ID 盲目重试
```

恢复关系是：

```text
Snapshot at sequence 20 + events 21..N -> 当前状态
```

如果 Snapshot 与事件尾部不一致，必须拒绝静默继续并生成诊断。

## 4. 持久化对象

### Run Envelope

```text
schemaVersion
runId
workspaceId
goal
createdAt
updatedAt
policySnapshot
taskIntent
budget
documentScope
state
lastSequence
status
```

### Event Record

```text
eventId
runId
sequence
occurredAt
eventType
payload
```

只保存控制面事实，例如：

```text
run.created
run.prepared
turn.tools-accepted
invocation.requested
invocation.dispatched
invocation.succeeded
run.recovery-required
run.completed
```

模型原始长文本、完整 Prompt 和完整 ScoreDocument 默认不进入永久日志。诊断优先保存
摘要、哈希、来源 ID、文档版本和经过限制的安全片段。

### Invocation Record

```text
invocationId
turnId
capabilityId
contractVersion
inputHash
baseDocumentVersion
status
resultIdentity
```

写入能力未来还需要 Proposal、审批范围和批准版本；A4 只保留兼容位置，不实现
Proposal/Preview。

## 5. 文件布局

第一版复用项目已有的版本化 JSON、原子写入和损坏隔离模式：

```text
app-data/
  agent/
    runs/
      <run-id>/
        snapshot.v1.json
        events.v1.jsonl
        invalid/
```

这样可以让单个 Run 独立恢复和隔离，事件适合追加，Snapshot 可以原子替换。第一版不
引入数据库，等 Run 数量和查询需求证明文件存储不足后再评估 SQLite。

## 6. Store Port

TypeScript 只依赖收窄端口：

```text
load(runId)
  -> Run Snapshot + event tail

commit(runId, expectedSequence, event, nextSnapshot)
  -> accepted | sequence-conflict | storage-failed

listRecoverable()
  -> Run Recovery Summary[]

quarantine(runId)
  -> diagnostic result
```

`commit` 是主要原子边界：检查 `runId`，检查 `expectedSequence`，检查新序号为
`expectedSequence + 1`，写入事件，更新 Snapshot，然后原子提交。序号冲突不能覆盖
另一个执行者的状态，必须重新读取并进入冲突处理。

## 7. 必须持久化的边界

不用保存每次 UI 重绘。以下边界必须保存：

```text
Run 创建后
进入 planning 前
模型决策通过校验后
Invocation requested / dispatched 前后
Invocation 产生确定结果后
进入 waiting / recovering 后
完成、失败或取消前
```

尤其是：

```text
记录 invocation.dispatched
  -> 才允许发出 Capability
```

这样崩溃恢复时不会把可能已经发出的调用误判成“从未发送”。

## 8. 重启恢复规则

```text
读取 Snapshot
  -> 校验 schema、runId、sequence
  -> 读取事件尾部
  -> 校验序号连续
  -> 用 Reducer 重放
  -> 比较重放状态与 Snapshot
  -> 生成 Recovery Summary
```

恢复分类：

```text
terminal
  不自动继续，只展示历史结果

waiting / user-input
  恢复为等待用户输入

waiting / approval
  恢复为等待审批，不自动批准

waiting / cancellation-pending
  查询或回读未完成 Invocation

active / planning
  标记为 host-interrupted，不能直接重复请求模型

active / executing
  如果存在 dispatched/running Invocation，标记 outcome-unknown

recovering
  保持 recovering，等待原 Invocation 核对

损坏或序号不连续
  隔离记录，生成诊断，不静默删除
```

恢复不是“从最后一条消息继续”，而是先识别最后一个确定事实，再决定是否允许继续。

## 9. Agent 与 Kernel 的性能边界

需要先区分两个问题：

```text
Kernel / Domain Capability 的性能
  乐谱解析、领域分析、批量变换、音频 DSP、完整文档处理

Agent Control Plane 的性能
  等待模型、选择工具、校验决策、推进状态、保存控制事件
```

截图中的以下内容属于 Kernel 或 Domain Capability 的实现问题，不是 Agent 自己应该
完成的工作：

```text
完整 ScoreDocument 深拷贝
大范围乐谱分析
音频 DSP
```

Agent 的正确行为是提出能力调用：

```text
模型：请求 guitar.analyze-difficulty
Agent：校验、授权、创建 Invocation
Rust Capability：调用 Kernel / Domain Service
Kernel：执行音乐领域计算
Agent：接收收窄结果并继续控制循环
```

因此，Agent 不需要把完整乐谱读进 TypeScript，也不需要在 TypeScript 中重写音乐
算法。事件循环适合短小工作和异步 I/O；长时间 CPU 任务才需要下沉到 Kernel、Rust
或专用 Worker。citeturn0search1

A4 的控制措施：

```text
Context 使用预算
事件只保存最小结构化事实
Snapshot 不包含完整乐谱
大分析由 Capability 转交 Kernel、Rust 或 Worker
Provider 与 Capability 使用异步接口
持久化通过窄 IPC 提交检查点
```

## 10. TypeScript 的其他风险

### 运行时数据仍需校验

TypeScript 类型不能替代来自 IPC、磁盘、Provider 和 Rust 的运行时解码。A2/A3 的
Decision Validator、Capability Result Decoder 和未来 Store Decoder 都是必要边界。

### WebView 不是权威安全边界

Agent UI 可以显示状态，但不能成为 API Key、持久化 Run 或最终业务授权的唯一保管者。
Capability Gateway 和宿主 Store 仍应位于 Rust 侧。

### 单线程不等于不能并发

第一版采用受控异步并发：

```text
不同 Run 可以并行
同一个 Run 只有一个执行所有者
同一个 Run 的事件序号严格递增
```

## 11. A4 不做什么

```text
不把整个 Agent Runtime 重写成 Rust
不把完整聊天记录永久化
不保存完整 ScoreDocument
不引入数据库
不接真实 Provider
不实现多 Agent 调度
不实现 Proposal / Preview
```

## 12. A4 实施顺序

```text
1. 定义 Rust 可序列化 Run/Event DTO
2. 实现内存 Store Port 测试替身
3. 实现 Rust Durable Run Store
4. 实现 Tauri load/commit/list-recoverable 命令
5. 给 AgentRunController 注入 Durable Store Port
6. 测试崩溃边界、序号冲突、损坏隔离和恢复分类
7. 再考虑最小 Agent UI 状态投影
```

## 13. 结论

```text
TypeScript
  控制面、模型适配、上下文、状态机、UI 投影

Rust
  持久化、宿主生命周期、敏感数据、统一 Capability Gateway

Kernel
  乐谱事实、事务、历史和音乐领域规则
```

下一步先实现 `AgentRunStorePort` 和 Rust Store 的最小 `load/commit/list` 合同，暂时
不接真实模型，也不修改现有 ScoreSessionService。
