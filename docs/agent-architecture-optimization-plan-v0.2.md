# AI Agent 架构优化方案 v0.2

日期：2026-09-17  
状态：架构方案，未实施业务代码  
前置：[AI Agent 插件架构基线](agent-architecture-v0.1.md) · [A0 Kernel Query Foundation](agent-a0-kernel-query-foundation-plan.md) · [A1 Capability Foundation](agent-a1-capability-foundation-design.md)

## 1. 结论先行

当前方案的方向是正确的，但需要做五个收敛：

1. **Kernel 继续负责事实、事务和历史；Application Capability 负责业务动作；Agent 只负责调度。**
2. **读取侧采用 CQRS 风格的 Query Plane**，不再把完整 `read_state()` 当作所有读取的默认入口。
3. **查询采用多层 Projection，而不是字段 getter 集合。**  
   `Overview -> Metadata / Structure / Range / Entity -> Full Snapshot` 是读取范围的渐进扩展。
4. **能力之间使用“有向能力图”描述发现、细化和组合关系；执行时仍是一条无环调用链。**
5. **第一版只做静态第一方能力目录和单 Agent Runtime。**  
   暂不引入动态插件代码、复杂多 Agent、重型 sandbox 或独立 Query Bus。

最终目标不是让模型看到更多工具，而是让模型在每一步看到**足够完成当前任务、但不会误用的最小能力集合**。

## 2. 需要纠正的三个概念

### 2.1 “层级”不是调用父子关系

下面是查询投影层级：

```text
L0 Identity       文档是否存在、ID、当前版本
L1 Overview       标题、小节数、基本摘要
L2 Domain View    元数据、结构、选区、播放相关视图
L3 Target View    某个 Part、Voice、Measure、Event 或范围
L4 Full Snapshot  完整文档和完整应用投影
```

它表示**数据范围和成本逐步增加**，不表示：

```text
read_overview() 必须调用 read_identity()
read_range()    必须调用 read_overview()
```

每个投影都应直接从同一个权威状态读取。已知稳定文档 ID 时，可以直接读取目标投影。

### 2.2 “细粒度”不是“每个字段一个工具”

不建议增加：

```text
read_title()
read_measure_count()
read_author()
read_tempo()
```

建议按用户任务和领域语义划分：

```text
score.read-overview
score.read-metadata
score.read-structure
score.read-range
score.read-entity
```

内部可以有字段级 helper，但它们不是 Application Capability，更不直接暴露给 Agent。

### 2.3 “能力图”不是新的运行时总线

能力图只负责：

- 发现某项能力可以进一步提供什么信息；
- 说明能力的输入、输出、成本和副作用；
- 帮助 Runtime 生成当前任务的工具集；
- 帮助 UI 展示能力范围和调用进度。

实际执行仍然经过：

```text
Agent Runtime
  -> Capability Gateway
  -> Application Capability Handler
  -> Application Service
  -> Kernel / Domain Plugin
```

不能让能力图节点互相任意调用，也不能让模型通过图边绕过 Gateway。

## 3. 推荐总体架构

```text
                           +----------------------+
                           |  Agent Plugin         |
                           |  Runtime / Policy     |
                           |  Run State / Context  |
                           +----------+-----------+
                                      |
                              Agent Tool Adapter
                                      |
                              Capability Gateway
                                      |
             +------------------------+------------------------+
             |                        |                        |
       Query Capability        Analysis Capability       Mutation Capability
             |                        |                        |
       Query Application       Analysis Application      Proposal / Command
             |                        |                        |
             +------------------------+------------------------+
                                      |
                           Application Service Layer
                                      |
                  +-------------------+-------------------+
                  |                                       |
             Kernel Query Plane                     Kernel Command Plane
                  |                                       |
       LiveScoreStore / Selector                  Transaction / History
```

### 3.1 控制面

控制面属于 Agent 插件，负责：

- 将用户目标拆成可执行步骤；
- 选择当前任务允许的能力；
- 维护 Run 和 Invocation 状态；
- 限制上下文和工具输出预算；
- 执行授权、确认、取消、超时和重试策略；
- 判断是否需要继续调用或向用户提问；
- 将最终结果回读并验证。

控制面不拥有乐谱事实，也不直接修改文档。

### 3.2 能力面

能力面属于应用和领域插件，负责：

- 查询真实文档状态；
- 分析音乐结构；
- 生成指法、编曲或练习建议；
- 生成提案；
- 预演提案；
- 通过事务修改文档；
- 播放、导出或访问外部资源。

能力面不负责决定“下一步调用什么”。它只保证每个能力本身可验证、可授权、可回滚或明确说明不可逆。

## 4. 读取架构优化

### 4.1 权威来源只有一个

所有 Projection 都必须从同一份当前 Kernel 状态产生：

```text
LiveScoreStore
  -> ScoreOverview
  -> ScoreMetadata
  -> ScoreStructure
  -> ScoreRange
  -> ScoreEntity
  -> Full Snapshot
```

不要为 Agent 单独维护一份“简化乐谱状态”。否则会产生同步、版本和撤销语义分裂。

Projection 可以复制返回值，但不能复制权威状态。

### 4.2 Projection 合同

每个 Query Projection 至少声明：

| 字段 | 含义 |
|---|---|
| `projectionId` | 稳定查询身份 |
| `contractVersion` | 输入输出合同版本 |
| `scope` | 文档、结构、范围或实体 |
| `maxOutput` | 单次最大返回规模 |
| `costClass` | 常数、按范围、按实体或完整快照 |
| `versionAnchor` | 结果对应的 `documentVersion` |
| `effects` | 查询副作用，通常为 none |

建议的成本分类：

```text
O(1) / O(metadata)
O(selected-range)
O(selected-entity)
O(document)
```

成本不是性能承诺，而是调用策略和预算决策的输入。

### 4.3 版本一致性

每个 Query 结果都携带：

```text
documentVersion
projection
```

当一次任务需要组合多个查询时，Runtime 应明确选择一种策略：

1. **Latest mode**：每次读取当前最新状态，适合探索性问答。
2. **Pinned version mode**：要求结果属于指定版本，适合分析后准备提案。
3. **Revalidate mode**：允许读取期间变化，但在写入前重新检查版本，适合交互式编辑。

不要把 `contextSnapshotId` 当成快照一致性的保证。只有 Kernel 真正提供版本检查或历史快照生命周期时，才能声称结果来自同一快照。

### 4.4 不引入 Query Coordinator

目前不新增 `Query Bus`、`Canonical Fact Reader` 或独立 `Query Coordinator`。这些名字看起来能统一查询，实际上容易形成第二个调度层。

第一版使用：

```text
Application Query Service
  -> existing KernelSession Select
  -> existing KernelRuntime selector
```

当多个 Projection 真正需要跨领域组合时，再在 Application Service 中增加一个有明确业务语义的用例，例如：

```text
guitar.prepare-practice-context
```

不要为了抽象而创建通用查询编排框架。

## 5. 能力图设计

### 5.1 节点：能力，不是 Kernel 字段

能力节点示例：

```text
score.read-overview
score.read-metadata
score.read-structure
score.read-range
guitar.analyze-difficulty
guitar.generate-fingering
playback.audition-range
score.preview-proposal
score.apply-proposal
```

### 5.2 边：导航关系

建议使用有限的关系类型：

| 关系 | 用途 |
|---|---|
| `refines` | 从粗投影进入更具体的投影 |
| `requires` | 当前能力需要另一个能力的结果 |
| `produces` | 当前能力产生某种可供后续使用的结果 |
| `validates-with` | 结果需要通过另一项能力验证 |
| `previews` | 能力生成或展示候选，但不写入真实文档 |
| `applies` | 能力将已确认提案应用到权威状态 |

示例：

```text
score.read-overview
  --refines--> score.read-structure
  --refines--> score.read-range

guitar.generate-fingering
  --requires--> score.read-range
  --produces--> guitar.fingering-proposal
  --previews--> playback.audition-range

score.apply-proposal
  --requires--> score.preview-proposal
  --validates-with--> score.read-range
```

这些边用于导航和策略，不构成任意递归执行权限。

### 5.3 图的三个约束

1. **发现图可以有交叉，但执行图必须无环。**  
   例如 Metadata 和 Structure 都可以引用 Overview 的事实，但不能互相递归调用。
2. **关系不等于授权。**  
   `score.preview-proposal -> score.apply-proposal` 不表示模型自动拥有写入权。
3. **关系不等于数据依赖。**  
   `refines` 只表示“可以进一步查询”，不能强制每个流程必须先查父节点。

## 6. Agent Tool 暴露策略

### 6.1 三层工具目录

```text
Application Capability Catalog
  所有已审核的一方能力

Agent Allowlist
  Agent 插件被允许使用的能力

Run Toolset
  当前任务实际暴露给模型的能力
```

例如：

```text
用户：帮我判断这段指法难不难

Run Toolset:
  score.read-overview
  score.read-range
  guitar.analyze-difficulty
```

不应把整个应用的几十个能力一次性塞给模型。

### 6.2 Tool Descriptor 只暴露决策所需信息

模型可见描述建议包含：

- 能力名称和业务语义；
- 输入参数；
- 返回结果摘要；
- 前置条件；
- 可能的副作用；
- 成本和最大范围；
- 失败类型；
- 是否需要用户确认。

不应暴露：

- Kernel Command ID；
- 内部 Selector 名称；
- React 状态结构；
- 文件绝对路径；
- 完整文档对象；
- “拥有全部权限”这种不受约束的描述。

### 6.3 结果不是聊天文本

Tool Result 分为：

```text
data       供 Runtime 继续推理的结构化数据
display    UI 可以呈现的简短摘要
evidence   来源、版本、范围和验证信息
next       可选的推荐后续能力
```

模型不应该依赖 UI 文案解析执行结果。

## 7. 写入能力的优化路径

写入不能照搬读取的直接调用模式。统一使用：

```text
用户目标
  -> Query 当前状态
  -> Analysis / Generation
  -> Proposal
  -> Preview
  -> User Approval
  -> Mutation
  -> Re-read + Validate
```

### 7.1 Proposal 不是第二份文档

Proposal 是对变更意图的类型化描述，例如：

```text
proposalId
baseDocumentVersion
affectedScope
operations
expectedEffects
warnings
```

它可以在内存或临时会话中预演，但不能直接替代 Kernel 的事务和历史。

### 7.2 Mutation 的最小规则

每个写入能力必须明确：

- 目标文档版本；
- 受影响范围；
- 是否可撤销；
- 幂等请求 ID；
- 失败后状态是否确定；
- 提交后如何回读验证；
- 版本冲突如何返回；
- 是否需要用户确认。

原子 Command 仍然是 Kernel 的实现单位；Application Capability 才是 Agent 的业务调用单位。

## 8. 状态机优化

### 8.1 Run 状态机

```text
created
  -> preparing
  -> awaiting-input
  -> planning
  -> executing
  -> verifying
  -> completed

planning / executing / verifying
  -> awaiting-approval
  -> cancelled
  -> failed
  -> interrupted
```

`interrupted` 表示宿主重启或进程消失，不能直接等价于 `failed`。

### 8.2 Invocation 状态机

```text
requested
  -> validated
  -> awaiting-approval
  -> dispatched
  -> running
  -> succeeded

validated / dispatched / running
  -> rejected
  -> cancelled
  -> timed-out
  -> failed
  -> outcome-unknown
```

只有 `succeeded` 代表能力已经确认完成。`outcome-unknown` 不允许自动使用新的 request ID 重试，必须先查询原请求状态或回读权威状态。

### 8.3 为什么分开 Run 和 Invocation

一次用户任务可能包含多个能力调用：

```text
Run
  -> read-range Invocation
  -> analyze-difficulty Invocation
  -> generate-fingering Invocation
  -> preview Invocation
```

Run 负责任务级目标和完成判断；Invocation 负责单次调用的生命周期、审计和重试语义。合并成一个状态机会导致取消、重试和恢复边界混乱。

## 9. 成熟模式如何映射到本项目

| 模式 | 在本项目中的落点 | 不能照搬的部分 |
|---|---|---|
| CQRS | Kernel Query Plane 与 Command Plane 分离 | 不建立两份权威文档 |
| Hexagonal / Ports and Adapters | Provider、Tauri、UI 通过端口接入 Capability | 不让每层都定义一套重复业务合同 |
| Transaction Script / Application Service | 一个业务能力对应一个可验证用例 | 不把 UI 点击步骤当作业务能力 |
| Projection / Read Model | Overview、Range、Entity 等窄读取 | 不为每个字段建独立缓存 |
| Saga 思想 | 多步 Agent Run 的恢复、补偿和确认 | 不把不可逆外部副作用假装成事务 |
| State Machine | Run 与 Invocation 生命周期 | 不用字符串状态和异常文本代替状态合同 |
| Policy / Guardrail | allowlist、预算、版本、确认和副作用检查 | 不让模型自报权限 |
| Ports and Provider Adapter | 统一 Provider 接口和 Fake Provider | 不让 Provider 持有 Capability 执行权 |

## 10. 分阶段实施计划

### Phase A0：Kernel Query Foundation

保留现有范围，先完成 `core.selector.score-overview`：

- 直接读取 `LiveScoreStore`；
- 返回 `documentId`、`title`、`measureCount`；
- 外层携带 `documentVersion`；
- 证明不发生完整快照物化；
- 不重构 Command，不迁移整个桌面层。

对应文档：[A0 计划](agent-a0-kernel-query-foundation-plan.md)。

### Phase A1：Capability Foundation

实现：

- 静态 Capability Catalog；
- Capability Descriptor；
- Gateway；
- Invocation / Result Envelope；
- `score.read-summary`；
- UI 与未来 Agent 共用的类型化调用端口。

不接模型，不实现写入。

对应文档：[A1 设计](agent-a1-capability-foundation-design.md)。

### Phase A2：Context 与 Toolset

实现：

- Context Builder；
- Projection 来源和版本锚点；
- 能力图元数据；
- Agent Allowlist；
- Run Toolset；
- 输出预算、范围上限和脱敏策略。

A2 的验收重点不是“模型能看到多少”，而是“同一任务是否只获得必要工具和必要数据”。

### Phase A3：Fake Provider 与 Run Runtime

实现：

- Provider Port；
- Fake Provider；
- Run 状态机；
- Invocation 状态机；
- 取消、超时和重启恢复；
- 工具调用事件日志；
- 确定性回放测试。

先用 Fake Provider 验证控制面，不把模型不稳定性混入基础设施验证。

### Phase A4：只读 Agent

接入真实 Provider，仅开放：

- Overview；
- Metadata；
- Structure；
- Range；
- 音乐分析；
- 播放试听。

不开放真实 Mutation。先完成任务成功率、错误率、工具误用率、平均上下文大小和用户中断率的观测。

### Phase A5：Proposal / Preview

实现：

- 结构化 Proposal；
- 临时预演；
- 差异展示；
- 音乐规则验证；
- 用户确认；
- 版本冲突处理。

### Phase A6：受控 Mutation

逐项开放：

```text
score.set-title
score.transpose-range
guitar.apply-fingering
```

每项能力独立定义授权、幂等、回读和撤销语义，不做“一次性开放所有写入”。

## 11. 当前方案中明确删除或推迟的内容

为了保持商业级架构的可控性，以下内容暂时不做：

- 通用 Query Bus；
- Query Coordinator；
- 动态第三方能力注册；
- 多 Agent 协作；
- 把所有 Kernel Selector 自动转换成 Agent Tool；
- 每个字段一个读取工具；
- 重型通用 sandbox；
- 让模型直接操作 Application Command；
- 用缓存掩盖完整读取的成本；
- 在没有真实恢复语义前宣称支持断点续跑。

## 12. 最终验收标准

架构达到第一版商业级基线，需要同时满足：

1. Agent 插件关闭时，普通应用完全不依赖 Agent Runtime。
2. UI、Agent 和测试调用同一 Application Capability。
3. Agent 不能直接访问 Kernel、React 状态或任意 Tauri Command。
4. 每个 Query 结果带有明确版本和来源。
5. 查询范围和输出大小有上限。
6. 完整读取不再被用于标题、版本、数量等窄查询。
7. 写入必须经过 Proposal、确认、事务和回读验证。
8. Run 与 Invocation 的状态、取消、超时和恢复语义彼此独立。
9. Provider 可以替换，Fake Provider 可以确定性回放。
10. 能力图用于发现和策略，不绕过 Gateway。
11. 每项重要能力都有成功、拒绝、失败、取消和不确定结果的测试。
12. 关键用户任务拥有可重复的评测数据和回归基线。

## 13. 本次决策

本项目接下来采用以下默认决策：

```text
分层：用于 Query Projection 和用户可理解的渐进读取
图状：用于 Capability Discovery、依赖声明和策略导航
执行：仍使用明确、无环的 Application Capability 调用链
权威状态：只有 Kernel
统一入口：Application Capability Gateway
第一版：单 Agent、静态 Catalog、只读优先
```

这套方案既保留当前已经完成的 A0/A1 工作，也为后续音乐分析、指法生成、试听、提案和受控编辑预留了稳定扩展点。
