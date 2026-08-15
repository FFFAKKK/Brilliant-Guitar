# Brilliant Guitar Architecture Reset V2 — PRD

## 1. 文档身份

| 字段 | 值 |
|---|---|
| 候选基线 | `5e1599598b1468784ae9b7410383ef63b33201b8` |
| 候选分支 | `codex/brilliant-guitar-architecture-reset-v2` |
| 生命周期 | `planning` |
| 当前权威状态 | `proposed_not_current` |
| 生产实现授权 | `false` |
| `task.py start` | 未执行，且本任务禁止执行 |
| 独立架构审计 | 待专门的只读审计会话执行 |

本任务只产出架构候选和审计交接材料。候选通过独立审计并获得用户明确接受前，现有产品、Core、Rust remediation 和 post-Core 文档仍是当前历史权威；本任务不直接替换它们。

## 2. 产品目标

Brilliant Guitar 的长期目标是：建设一个现代、高扩展、高稳定、高性能、商业级质量但保持开源的吉他打谱产品，使官方团队和第三方开发者能够在清晰、版本化且受控的边界上提供领域、功能和视觉扩展。

Architecture Reset V2 必须把这个目标落实为可实施架构，而不是把“内核”“插件”“产品”混成一个抽象层。它必须回答：

1. 当前 TypeScript Core 为什么在大谱面编辑下出现不可接受的复杂度；
2. 哪些已验收合同继续作为迁移 oracle，哪些内部实现需要替换；
3. Rust 内部如何分层、存储、索引、编辑、验证、撤销、快照和编码；
4. 官方领域 provider、产品服务、公共 TypeScript 功能插件和 React 视觉贡献如何分别接入；
5. 如何分阶段迁移、逐阶段回滚，并在 Rust 切换后尽快证明第一个 Guitar Core Loop。

## 3. 必须保持的迁移输入

本候选不重新设计以下已公开行为：

- 28 个 Core semantic command ID；
- 应用根 51 个 runtime exports；
- Module SDK `8 runtime / 34 type` exports；
- contribution 九字段 ABI；
- `brilliant-score-1`；
- command/result/failure discriminants；
- issue、fact、event 的确定顺序；
- unknown ExtensionBlock 的无损保真；
- rejection zero-delta；
- undo、redo、replay 的应用可观察语义。

它们是 RKP differential/oracle 的冻结输入，不代表旧 TypeScript 内部数据结构或热路径实现必须保留。

## 4. 功能需求

### ARV2-R001 — 自包含权威候选

`design.md` 必须能够独立说明现状、目标架构、所有者、依赖方向、数据流、迁移顺序、回滚边界和验收矩阵。未来操作者可以阅读一份主文档完成架构理解，不需要自行拼接历史阶段文档。

### ARV2-R002 — 现状和根因必须由仓库证据支持

文档必须记录当前仓库只存在 `src/core-kernel` 生产实现、当前代码规模、集中热点、尚未实现的产品层、531/531 基线、CVN-7 stress 证据失效状态，以及 RKP-0 已接受、RKP-1～RKP-9 尚未实施的事实。性能结论必须明确指向全文扫描、全量克隆、数组历史复制、重复全量验证和完整 callback view 等复杂度来源。

### ARV2-R003 — 统一采用 Brilliant Core Platform 术语

正式候选必须采用：

```text
Brilliant Core Platform
├── Score Foundation
├── Kernel Contracts
├── Kernel Runtime
├── Kernel Use Cases
├── Kernel Extension SDK
└── Native Bridge
```

只有 `Kernel Runtime` 使用狭义微内核机制。产品核心、谱面语义、事务引擎和插件生命周期不得继续共用一个模糊的 `Core Kernel` 所有者。

### ARV2-R004 — 五 crate Rust 边界

目标 Cargo workspace 必须精确包含：

1. `brilliant-score-foundation`；
2. `brilliant-kernel-contracts`；
3. `brilliant-kernel-extension-sdk`；
4. `brilliant-kernel-runtime`；
5. `brilliant-kernel-node`。

`Kernel Use Cases` 首版属于 runtime 内部模块，不建立第六个 crate。依赖图必须无环，Foundation 不反向依赖 Runtime，SDK 不暴露 mutable store，Node/Tauri adapter 不形成第二套业务状态或验证。

### ARV2-R005 — 单一语义真相、双表示

`ScoreDocument` 必须继续作为持久化、迁移、公开交换和 round-trip DTO；`LiveScoreStore` 必须作为活动 session 唯一可变表示。两者表达同一语义真相，普通局部编辑不得先重建完整 `ScoreDocument`。

### ARV2-R006 — 三种身份必须分离

- `EntityId`：持久化且跨保存、重开、迁移稳定；
- `RuntimeHandle`：typed generational slot+generation，仅当前 session 私有；
- `MusicalLocation`：由序列和 duration 使用精确 Fraction 派生。

RuntimeHandle 不得进入文件、事件、FFI、snapshot 或公开 SDK；MusicalLocation 不得与 EntityId 合并，也不得向 Note/Event 添加冗余持久化 tick。

### ARV2-R007 — 可证明复杂度的索引

LiveScoreStore 至少维护实体、所有权、有序子项、Measure 顺序、Part/MeasureContent、Voice 时间线、Extension namespace/owner 和引用依赖索引。合同必须达到：

- exact entity lookup：平均 `O(1)`；
- owner lookup：平均 `O(1)`；
- ordered/range lookup：`O(log n + k)`；
- 局部插入、删除、pitch/duration 修改只更新受影响 Voice、引用和祖先聚合；
- 普通局部编辑不扫描其它 Part/Voice。

具体容器库由 RKP-2 冻结，但不得降低这些复杂度或确定顺序要求。

### ARV2-R008 — Overlay 和 ChangeSet 原子事务

命令必须通过索引解析 stable target，handler 只产生 typed forward ChangeSet，TransactionOverlay 在 commit 前隔离变更。rejection 丢弃 overlay，store、indices、history、dirty、checkpoint identity 和 event sequence 保持原值。一个 command 或 batch 只形成一个 revision/history/event unit。

### ARV2-R009 — 游标历史而非文档副本

history 必须采用 `Vec<HistoryEntry> + cursor`，保存 semantic identity、forward/inverse ChangeSet、稳定 affected address、provider identity 和 batch boundaries。它不得保存整文档、RuntimeHandle、函数、UI/file 对象或随机/墙钟值。undo/redo 使用存储的 inverse/forward；replay 重路由 semantic envelope。

### ARV2-R010 — 增量验证和全量等价门

validator 必须声明直接实体、parent/reference closure、document-wide invariant、canonical issue key、incremental support 和 full fallback 类别。任何增量实现只有在 diagnostics、顺序、facts、severity 和 availability 与 full validator 等价后才能被接受。

### ARV2-R011 — 选择、快照、事件和线程所有权

selector 优先直接读取 LiveScoreStore/indices；完整 snapshot 只在显式请求时按 revision 物化并可缓存。一个 KernelSession 只有一个顺序写 owner；provider 在事务中同步、不可重入写；事件只携带稳定身份和 facts，不携带 ChangeSet、RuntimeHandle、整文档或宿主对象。

### ARV2-R012 — 三类扩展面不得混用

架构必须分别定义：

1. Rust official provider：使用版本化 Rust SDK，进入冻结 KernelProviderAssembly；
2. Public TypeScript functional plugin：由 Product Extension Host 通过版本化 facade 映射；
3. React visual contribution：仅进入 Workbench 容器，不持有 Core 真相。

React 是视觉技术选择，不是所有插件的通用语言；公共插件不直接进入 raw Registry、KernelProviderAssembly 或 mutable store。

### ARV2-R013 — 两个 Assembly 的唯一所有者

- `KernelProviderAssembly`：由 Kernel Runtime composition root 构造，包含 Core handlers、official Rust providers、compatibility、namespace ownership、frozen order 和 private identity；
- `Product ApplicationAssembly`：由未来 Product Host 唯一拥有，组合 accepted runtime、官方领域/服务、Workbench、i18n 和公共贡献映射。

两者均为 `ready | failed` 原子结果，失败不得发布部分 session/provider directory；两个 identity 不得互换或被第二 owner 重建。

### ARV2-R014 — Score/Guitar/Persistence 所有权保持

Event 继续拥有 duration，Voice sequence 派生 start，Chord Notes 共享 Event 时间，Note 只保存 stable ID 与 WrittenPitch。Guitar Domain 首版使用 Part-owned ExtensionBlock 保存 fingering/technique/tuning/domain references。`.bgp` package、manifest、atomic replace、autosave、recovery 和资源字节属于 Persistence，不进入 Core Platform。

### ARV2-R015 — 小 DTO Native Bridge

Node-API 必须暴露 opaque KernelSessionHandle。load、encode 和显式完整 snapshot 可以跨 FFI 传整文档；submit、undo、redo、select 使用小 DTO。TypeScript facade 继续执行 hostile JavaScript descriptor-first 捕获，Rust 再做 exact-shape decode；Rust transaction 不回调任意 JavaScript provider。

### ARV2-R016 — 分阶段迁移和可逆切换

RKP-0～RKP-9 必须保持严格依赖序列，每阶段独立任务、分支、allowlist、审计、接受和归档；任一失败回滚到上一 accepted stage。RKP-8 是唯一默认引擎切换点，产品不长期暴露 TS/Rust 双引擎选择器。

### ARV2-R017 — Rust 完成后优先 Guitar Core Loop

RKP-9 接受归档后，必须先完成“单吉他谱 → 普通音符/休止符 → 弦品 → Layout → SVG → 基础 Playback → `.bgp` Save/Open → Undo/Redo”的首个纵向闭环，再继续新增通用 Registry、公共插件 API 或高级 capability。

### ARV2-R018 — 性能与资源资格可观测

V2 必须固定交互、stress、RSS 目标，并增加 full scan、full clone、full validation、snapshot materialization、visited entities、updated indices、overlay records、ChangeSet bytes、FFI bytes 计数。普通局部编辑的前四项必须为零。

### ARV2-R019 — 旧架构冲突必须有 disposition

每个会造成实现分叉的旧想法必须被标记为 `保留`、`修订`、`废弃` 或 `历史记录`，并明确新 owner。候选阶段不直接编辑旧文档；接受后由独立 docs-only authority-sync 提交添加 current/superseded 标记和引用。

### ARV2-R020 — 商业级质量门

未来实现必须覆盖数据正确性、确定性、性能、资源上限、故障隔离、兼容、可回滚、可观测和端到端产品旅程。绿色 typecheck/build/full suite 只是必要条件，不能替代复杂度计数、differential oracle、hostile boundary 和真实 Guitar Core Loop 证据。

## 5. 范围外

本 planning candidate 明确排除：

- `src/**`、`test/**`、`package*.json`、`tsconfig*.json`、Cargo、Tauri、React 或构建配置修改；
- RKP-1 创建、启动或生产实现；
- Score schema V2、entity-owned/Note-owned ExtensionBlock；
- Guitar Domain、Layout、Renderer、Playback、Persistence、Workbench、Extension Host 的生产实现；
- ready session 内 hot reload、unload、replace；
- 旧公开 export 或 command ID 删除；
- CVN-7 stress method 的再次正式测量；
- 当前 architecture authority 的立即替换；
- 归档、远端 push 或发布。

## 6. 接受标准

### 6.1 架构内容

- [ ] 主文档自包含并覆盖现状、目标、迁移、产品闭环和旧设计 disposition。
- [ ] Brilliant Core Platform 六层及 Product Application 边界唯一。
- [ ] 五 crate 依赖图无环，Kernel Use Cases 未形成第六 crate。
- [ ] ScoreDocument/LiveScoreStore、EntityId/RuntimeHandle/MusicalLocation 无混用。
- [ ] transaction、history、validation、snapshot、event、thread owner 唯一。
- [ ] KernelProviderAssembly 和 ApplicationAssembly 各有且只有一个 owner。
- [ ] 三类扩展面和插件生命周期边界完整。
- [ ] Note/Event/time 与 ExtensionBlock owner 没有隐式 schema 漂移。
- [ ] RKP-0～RKP-9 顺序、rollback 和 post-RKP Guitar Core Loop 一致。
- [ ] 28/51/8/34/9/`brilliant-score-1` 兼容清单完整。

### 6.2 规划工件

- [ ] `prd.md`、`design.md`、`implement.md`、两份 research、handoff、review、JSON/JSONL 全部存在。
- [ ] 新任务在产品父任务 `children` 中精确出现一次。
- [ ] task 仍为 `planning`，start/auth/accept/archive/push 均为 false 或 pending。
- [ ] 旧架构和 Rust/post-Core 权威文档在候选阶段零差异。

### 6.3 本地门禁

- [ ] 新任务、产品父任务、Rust remediation parent、post-Core parent Trellis validation 全绿。
- [ ] JSON/JSONL 均可解析；JSONL 路径存在且单文件内无重复。
- [ ] Markdown/Mermaid fence 平衡；`git diff --check` 通过。
- [ ] 相对基线的 `src/**`、`test/**`、package/tsconfig/Cargo 差异为空。
- [ ] typecheck、build、全量测试 `531/531` 通过。
- [ ] 本地提交只包含候选任务和产品父任务唯一 child 引用。
- [ ] docs-only 提交后工作树 clean。
- [ ] 规划自审为 `P0/P1/P2=0/0/0`。
- [ ] 独立架构审计在另一个只读会话中得到 `0/0/0` 后，才允许用户决定接受和 authority-sync。

## 7. 最终门禁声明

本任务完成的含义仅是：**Architecture Reset V2 已形成可供独立架构审计的 docs-only 候选**。它不表示架构已接受、不表示 Rust 实现已授权，也不表示 RKP-1 可以自动开始。
