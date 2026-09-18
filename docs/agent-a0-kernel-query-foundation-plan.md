# Agent A0 Kernel Query Foundation 修改计划

日期：2026-09-17  
状态：实施交接稿，尚未实施  
下游：[Agent A1 Capability Foundation](agent-a1-capability-foundation-design.md)  
关联：[AI Agent 插件架构基线](agent-architecture-v0.1.md) · [Milestone A 差距分析](agent-milestone-a-gap-analysis.md)

## 1. 任务结论

本任务不重写 Kernel Command，也不让 Agent 直接组合底层命令。现有写入侧已经具有细粒度 Core Command、事务、原子 Batch、历史和撤销重做；当前缺口在读取侧：桌面应用仍把旧的完整 `read_state()` 当作通用读取入口。

A0 的目标是补齐与 Command Plane 对称的 Kernel Query Plane，并用一个最小纵向切片证明：

> 读取作品概要可以直接从权威 `LiveScoreStore` 返回版本一致的少量事实，不导出、不深拷贝、不序列化完整 `ScoreDocumentV1`。

首个查询为：

```text
core.selector.score-overview
```

A0 完成后，A1 的 `score.read-summary` Application Capability 必须调用该 Selector，而不能包装 `ScoreSessionService::read()` 或旧 `KernelSession::read_state()`。

## 2. 问题证据

### 2.1 旧读取路径

当前桌面完整读取大致为：

```text
ScoreSessionService.read()
  -> session_read()
  -> KernelSession.read_state()
  -> KernelRuntime.read_state()
  -> current_snapshot()
  -> snapshot.as_document().clone()
  -> 收集全部规则警告
  -> 构建 notation
  -> 构建 playbackSource
  -> Tauri serde/JSON 传输 ScoreSessionRead
```

关键位置：

- `apps/desktop/src-tauri/src/application/mod.rs`：`ScoreSessionService::read`、`session_read` 和本地 `read_state` helper。
- `crates/brilliant-kernel-session/src/session.rs`：`KernelSession::read_state`。
- `crates/brilliant-kernel-runtime/src/runtime.rs`：`KernelRuntime::read_state` 中的完整文档 clone。
- `apps/desktop/src-tauri/src/dto.rs`：完整 `ScoreSessionRead` 同时携带 notation 和 playback projection。

旧 API 若被明确定义为“独立的完整兼容快照”，其 O(document) 成本并非自身错误。缺陷是把它用于标题、版本、小节数等窄查询。

### 2.2 已有可复用基础

仓库已经具备 Query Plane 的主体，不应建立第二套查询总线：

- `KernelStage4OperationV1::Select`：统一查询操作入口。
- `SelectorRequestV1`：现有 metadata、entity、ownership、range、history 和 dirty selector。
- `KernelRuntime::select_stage4`：返回与当前 `document_version` 一致的结果。
- `select_from_store`：直接从 `LiveScoreStore` 投影目标实体和范围。
- `KernelStage4MetricsV1`：已有 `full_snapshot_materializations`、`selector_records_visited` 和 `selector_records_returned`，可以结构化证明没有完整快照物化。
- `read_stage4(known_snapshot_version)`：完整同步场景已经有共享快照和按版本省略 document 的机制。

因此本任务是补齐和收口现有 Stage 4 Selector，不是重新设计 Kernel。

## 3. 目标架构

```text
Application Query Capability
  -> Application Query Service
  -> KernelSession Select operation
  -> KernelRuntime.select_stage4()
  -> select_from_store()
  -> 有界、版本化 Query Result

Application Mutation Capability
  -> Application Command Service / Proposal Compiler
  -> 一条领域 Command 或一个 Atomic Batch
  -> Kernel transaction / history
```

边界原则：

1. Query 不产生文档、历史、dirty 或 checkpoint 副作用。
2. Command 继续负责写入、校验、版本、事务和撤销重做。
3. Capability 保留用户可理解的业务语义，不与 Kernel Command 一一绑定。
4. Agent Tool 只调用经过审核的 Capability，不直接看到 Selector 或 Core Command。
5. 完整快照、目标查询和应用投影是三类不同读取，不使用一个万能 `read()` 掩盖成本。

## 4. A0 范围

### 4.1 本次必须完成

- 新增 `core.selector.score-overview` Selector 合同。
- 从 `LiveScoreStore` 直接返回最小概要事实。
- 接通 lossless 输入解码、Rust 类型化结果和 lossless 输出编码。
- 接通现有 `KernelSession` Stage 4 Select 操作，不增加新 Bus 或新顶层操作。
- 用结构化指标证明查询没有物化完整快照。
- 覆盖首次读取、修改后读取、Undo/Redo 后读取和大型文档读取。
- 将 `read_state()` 定位记录为 Legacy Full Snapshot API；新代码不得依赖它完成窄查询。
- 产出桌面层旧 `read_state()` 调用点的迁移分类，但 A0 不批量迁移桌面业务。

### 4.2 本次明确不做

- 不实现 Application Capability Gateway。
- 不实现 `score.read-summary` 的 Tauri 或 TypeScript 链路；它属于 A1。
- 不修改现有 Agent UI、Provider、Run 状态机或插件生命周期。
- 不重新拆分现有 Core Command，不改变命令 ID、事务、历史或 Batch 语义。
- 不删除 `read_state()`，不改变现有完整读取返回合同。
- 不重写 notation 或 playback projection。
- 不一次性迁移桌面应用中的全部完整读取。
- 不新增 `read_title()`、`read_measure_count()` 等字段级 API。
- 不引入缓存作为掩盖无界读取的补救措施。

## 5. 查询合同

### 5.1 请求

在现有 `SelectorRequestV1` 中增加无业务参数的 Selector：

```json
{
  "selectorId": "core.selector.score-overview"
}
```

它通过现有 Stage 4 operation 调用：

```json
{
  "apiVersion": 1,
  "operation": {
    "kind": "select",
    "selector": {
      "selectorId": "core.selector.score-overview"
    }
  }
}
```

不得增加 `workspaceId`。Kernel 只知道一个已建立的 Session；workspace 作用域属于桌面宿主。

### 5.2 内核结果

新增稳定结果类型，建议命名为 `ScoreOverviewV1`：

```text
ScoreOverviewV1
  documentId
  title
  measureCount
```

`documentVersion` 不在 `ScoreOverviewV1` 中重复；它已经由外层 `KernelStage4SelectValueV1.documentVersion` 提供。一次 `select_stage4(&self, ...)` 返回的版本和概要必须属于同一个当前 Session 状态。

字段规则：

- `documentId` 来自 `store.header.id`。
- `title` 来自 `store.header.metadata.title`。
- `measureCount` 来自 `store.topology.measure_order.len()`，不得通过导出 `measure_definitions` 计算。
- 计数的稳定线缆类型沿用 Kernel 的安全整数约束；不得直接把平台相关的 `usize` 暴露为长期合同。转换失败按内部不变量错误处理。
- A0 不加入 authors、tempo、part count、notation、playback、warnings、history 或 dirty。未来用例确有需要时，通过兼容演进或独立 Selector 增加。

### 5.3 Selector Result

在现有 `KernelSelectorValueV1` 增加 `Overview(ScoreOverviewV1)`，继续使用现有外层：

```text
KernelStage4SelectValueV1
  documentVersion
  selection
    ok: true
    value: ScoreOverviewV1
  stage4Metrics
```

不得为概要查询建立新的顶层 result envelope。

### 5.4 复杂度合同

`score-overview` 的成本必须与音符、事件、声部内容和扩展块数量无关：

```text
时间：O(title length)，其余字段 O(1)
额外空间：O(title length)
完整快照物化：0
Store 实体遍历：常数
返回记录数：1
```

标题复制是返回独立值所需的小型有界复制，不等同于完整乐谱深拷贝。

## 6. 实施步骤

### A0.1 合同层

预计修改：

- `crates/brilliant-kernel-contracts/src/session.rs`
- `crates/brilliant-kernel-contracts/src/codec/input.rs`
- `crates/brilliant-kernel-contracts/src/codec/output.rs`
- 相邻 codec 测试文件

工作项：

1. 定义 `ScoreOverviewV1`。
2. 给 `SelectorRequestV1` 增加 `ScoreOverview`。
3. 给 `KernelSelectorValueV1` 增加 `Overview`。
4. 在 lossless input codec 注册 `core.selector.score-overview`。
5. 在 lossless output codec 编码 `ScoreOverviewV1` 和新 value 分支。
6. 更新所有 exhaustive match；不使用兜底分支吞掉新增类型。
7. 验证未知字段、未知 selector 和不支持版本仍由现有严格合同拒绝。

兼容要求：

- 不改变六个现有 Selector 的 ID、输入或输出。
- 线缆层是新增可选操作；现有调用方行为不变。
- 如果仓库对公开 Rust enum 的新增 variant 有单独版本政策，实施会话需在编码前核对；不得为了省事复制一套 V2 总线。

### A0.2 Runtime 查询实现

预计修改：

- `crates/brilliant-kernel-runtime/src/selectors.rs`
- 必要时仅做最小可见性调整的 `store.rs` / `topology.rs`
- Runtime selector 测试

工作项：

1. 在 `select_from_store` 中实现 `ScoreOverview` 分支。
2. 直接读取 header 和 topology 长度。
3. 返回 `KernelSelectorValueV1::Overview`。
4. 更新 `selector_records_visited` / `returned`，保持常数且语义与现有 selector 一致。
5. 不调用以下任何路径：

```text
KernelRuntime::read_state
KernelRuntime::read_stage4
KernelRuntime::current_snapshot
LiveScoreStore::export_document
ScoreDocumentV1::clone
```

6. 不读取 history、dirty，不触发 checkpoint maintenance。

推荐实现位置仍是现有 `selectors.rs`。不要给 `KernelRuntime` 增加 `read_title()` 一类字段 getter，也不要让 Application 层访问 `LiveScoreStore`。

### A0.3 Session 与线缆闭环

预计修改：

- `crates/brilliant-kernel-session/src/session.rs` 的相邻 Stage 4 测试
- 若通用边界测试要求，更新 contracts/node 的既有 operation 语料

现有 `KernelStage4OperationV1::Select` 和 `KernelSession::operate_stage4_inner` 应当可以原样分发新 Selector。若实施需要修改这些通用分发函数，应先证明原因；不能为一个 Selector增加旁路 API。

必须验证经过 lossless JSON 输入和输出后的真实形状，而不只测试 Rust 内部函数。

### A0.4 Legacy 读取分类记录

在实施说明或本计划的完成记录中，把桌面 `application/mod.rs` 的旧调用分为：

| 当前用途 | 目标读取类别 | A0 动作 |
|---|---|---|
| `session_read()` 构建 notation/playback | Full Snapshot + Application Projection | 保留，后续评估按版本缓存/拆投影 |
| `export_document()` | Full Snapshot | 合理保留，后续改用 `read_stage4` 可选 |
| `document_id()` | Runtime identity / Overview | 后续移除完整读取 |
| SetTitle 保留其他 metadata | Metadata Selector | 后续迁移 |
| Delete/Set Event 前定位事件 | Entity + Ownership/Range Selector | 后续迁移 |
| Append Event 定位小节与 voice | Entity/Ownership/结构 Query | 后续迁移 |
| 测试或恢复需要完整文档 | Full Snapshot | 按真实用途保留 |

A0 只记录分类，不在已有播放等未提交改动上进行大范围编辑。

### A0.5 A1 接入前置条件

A0 合并并验证后，A1 实施会话再完成：

```text
score.read-summary Capability
  -> ScoreSessionService.read_summary(workspaceId)
  -> KernelSession Select(score-overview)
  -> map outer documentVersion + overview
  -> ScoreSummaryV1
```

`ScoreSessionService.read_summary()` 是应用用例适配器；它不能调用完整 `read()` 后裁剪。A1 的输出继续只有：

```text
documentId
documentVersion
title
measureCount
```

## 7. 测试计划

### 7.1 合同与 codec

- 新 Selector 的合法无参输入可以 lossless 解码。
- 多余字段、错误大小写、未知 selector ID 明确拒绝。
- `ScoreOverviewV1` 对普通 Unicode/UTF-16 边界标题沿用现有 `JsString` 行为。
- 输出数字遵守安全整数和 canonical/lossless 编码规则。
- 既有六类 Selector 的编码快照不变化。

### 7.2 Runtime

- 初始文档返回正确 ID、标题和小节数。
- 查询返回当前 `document_version`。
- `full_snapshot_materializations == 0`。
- `selector_records_visited` 为约定的常数，`selector_records_returned == 1`。
- 查询前后 history、dirty 和文档版本不变化。
- 先调用 overview，再调用 `read_stage4(None)`；后者仍应报告首次完整快照物化，证明 overview 没有偷偷填充 snapshot cache。

### 7.3 状态变化

- 修改标题后，overview 返回新标题和新版本。
- 插入/删除小节后，measure count 与版本同步变化。
- Undo 后恢复旧概要；Redo 后恢复新概要。
- NoOp 命令之后遵守现有版本语义，不自行制造版本变化。

### 7.4 规模与回归

- 对较大测试乐谱执行 overview，仍满足 `full_snapshot_materializations == 0` 和常数访问指标。
- 不使用容易抖动的毫秒阈值作为 CI 正确性判断；性能基线可以记录，但结构指标才是硬门槛。
- 完整 Kernel workspace、fmt、严格 Clippy 和项目固定 MSRV 检查通过。
- 如果 contracts 变化影响 Native/Node 边界，运行对应 Stage 4 operation 定向回归；不要无依据跳过。

建议验证命令由实施会话按仓库锁定工具链核对后执行，至少包括：

```powershell
cargo +1.97.1 test -p brilliant-kernel-contracts --all-features --locked --offline
cargo +1.97.1 test -p brilliant-kernel-runtime --all-features --locked --offline
cargo +1.97.1 test -p brilliant-kernel-session --all-features --locked --offline
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 clippy --workspace --all-targets --all-features --locked --offline -- -D warnings
```

若本机或仓库实际锁定版本不同，以仓库当前明确工具链为准，并在完成记录中写明；不得静默省略失败项。

## 8. 验收标准

A0 只有同时满足以下条件才算完成：

1. `core.selector.score-overview` 通过现有 Stage 4 Select 通道可调用。
2. 结果包含同一状态下的 document ID、title、measure count 和外层 document version。
3. 实现直接读取 `LiveScoreStore`，没有调用完整 snapshot/export 路径。
4. 测试明确证明 `full_snapshot_materializations == 0`。
5. 大文档中的音符/事件数量不改变查询的遍历复杂度。
6. 查询不改变文档、版本、history、dirty、checkpoint 或事件流。
7. 修改、Undo 和 Redo 后结果与当前权威状态一致。
8. 所有现有 Selector、Command、Batch 和完整读取合同保持兼容。
9. 没有引入字段级 getter 集合、第二套 Query Bus 或 Agent 到 Kernel 的直连。
10. 测试、fmt 和严格 Clippy 通过；未运行项目必须明确说明原因。

## 9. 停止条件

实施会话遇到以下情况应停止扩大改动并记录证据：

- 必须改变现有 Command、历史或事务语义才能实现 overview。
- 必须调用 `export_document()` 才能得到标题或小节数。
- 现有 Selector 合同存在无法兼容扩展的已发布 ABI 约束。
- 当前工作树中的并行修改与必要代码发生无法安全合并的冲突。
- 指标无法区分 overview 与完整快照物化，需要新增观测合同。

停止不等于回退用户已有修改。实施会话应保留工作树，只汇报阻塞点和最小替代方案。

## 10. 工作树注意事项

当前仓库存在大量未提交的用户/并行开发改动，且以下区域与 A0 相邻：

- `crates/brilliant-kernel-session/src/session.rs`
- `crates/brilliant-kernel-runtime/src/store.rs`
- `apps/desktop/src-tauri/src/application/mod.rs`
- `apps/desktop/src-tauri/src/dto.rs`

实施会话必须：

- 开始前运行 `git status --short` 和目标文件的 `git diff`。
- 将现有变化视为用户工作，增量修改并保留。
- 不使用 `git checkout --`、`git reset --hard` 或整文件覆盖。
- A0 优先避免桌面文件，以减少与播放功能并行改动的冲突。
- 格式化后检查 diff，避免无关换行符或全文件格式 churn。

## 11. 交付物

实施会话应交付：

1. Selector 合同、codec、runtime 实现和定向测试。
2. 关键结构指标与测试结果摘要。
3. 实际修改文件清单。
4. 桌面旧读取调用点分类记录。
5. 未解决问题和 A1 接入提示。
6. 一段明确结论：是否已经证明 overview 不物化完整快照。

不要在同一交付中顺带实现 Agent Gateway 或大范围桌面迁移。

## 12. 给实施会话的任务说明

可以把以下内容连同本文件路径直接交给专门会话：

```text
请实施 docs/agent-a0-kernel-query-foundation-plan.md。

目标是在现有 Stage 4 Selector 体系中新增 core.selector.score-overview，直接从
LiveScoreStore 返回 documentId、title、measureCount，并由现有外层返回
documentVersion。必须用指标和测试证明 fullSnapshotMaterializations 为 0，且查询
不触发 export_document、current_snapshot、read_state 或完整 ScoreDocument clone。

本任务只做 A0 Kernel Query Foundation，不实现 A1 Capability Gateway，不重构现有
Command/Batch/历史，不批量迁移桌面 read_state。当前工作树有其他未提交修改，开始前
检查 status 和目标 diff，保留并行工作，禁止回退或整文件覆盖。完成后运行计划中的定向
测试、fmt 和严格 clippy，并汇报未运行项、关键指标、修改清单和 A1 后续接入点。
```
