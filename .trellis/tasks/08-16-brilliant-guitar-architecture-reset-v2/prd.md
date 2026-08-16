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
4. 官方与第三方 Instrument Plugin、产品服务、公共 TypeScript 功能插件和 React 视觉贡献如何通过同一扩展体系接入；
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
├── Core Types
├── Score Foundation
├── Extension Protocol
├── Kernel Contracts
├── Kernel Runtime
├── Kernel Session / Use Cases
└── Native Bridge
```

只有 `Kernel Runtime` 使用狭义微内核机制。产品核心、谱面语义、事务引擎和插件生命周期不得继续共用一个模糊的 `Core Kernel` 所有者。

### ARV2-R004 — 七 crate Rust 边界

目标 Cargo workspace 必须精确包含：

1. `brilliant-core-types`；
2. `brilliant-score-foundation`；
3. `brilliant-extension-protocol`；
4. `brilliant-kernel-contracts`；
5. `brilliant-kernel-runtime`；
6. `brilliant-kernel-session`；
7. `brilliant-kernel-node`。

`core-types` 是最小叶子层；Score Foundation 与 Extension Protocol 分别消费它；Kernel Contracts 组合公开命令/结果 DTO；Kernel Runtime 只拥有状态机制；Kernel Session 拥有 Use Cases、28 个 Core handlers 和唯一 Composition Root。依赖图必须无环，Node/Tauri adapter 不形成第二套状态、验证或事务。

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

### ARV2-R012 — 统一插件生态与三类贡献面

架构必须分别定义：

1. Instrument Plugin：Guitar、Piano、Bass 和第三方乐器插件平级，使用同一协议；
2. TypeScript functional contribution：由 Product Extension Host 执行插件语义；
3. React visual contribution：只进入 Workbench 容器，不持有 Core 真相；
4. Product service contribution：通过 Layout、Renderer、Playback、Import/Export 等端口装配。

“官方”只表示默认安装、项目维护和资格等级，不授予特殊 Rust API。插件不直接进入 mutable store，也不把任意 JavaScript 实例放入 KernelSession。

### ARV2-R013 — Product Assembly 与 Kernel Session Composition

- `KernelSessionComposition`：由 `brilliant-kernel-session` 唯一拥有，组合 Kernel Runtime、Kernel Use Cases、28 个 Core handlers、ExtensionTransactionGateway 和 FrozenKernelContributionCatalog；
- `Product ApplicationAssembly`：由 Product Host 唯一拥有，组合 accepted KernelSession factory、选定插件、服务、Workbench、i18n 和公共贡献映射。

两者均形成 `ready | failed` 原子结果。Kernel Runtime 本身不拥有 handler 目录；Product Host 不重建 Runtime 私有状态；两个 identity 不互换。

### ARV2-R014 — Score、Instrument Plugin 与 Persistence 所有权

Event 继续拥有 duration，Voice sequence 派生 start，Chord Notes 共享 Event 时间，Note 只保存 stable ID 与 WrittenPitch。Guitar/Piano/Bass 等 Instrument Plugin 使用自己拥有的 Part-owned ExtensionBlock namespace 保存领域数据。Canonical `.bgp` package、manifest、atomic replace、autosave、recovery 和资源字节由 mandatory Official BGP Persistence 拥有；公共扩展优先进入 Import/Export/DocumentFormat Provider 端口。

### ARV2-R015 — 小 DTO Native Bridge

Node-API 必须暴露 opaque KernelSessionHandle。load、encode 和显式完整 snapshot 可以跨 FFI 传整文档；submit、undo、redo、select 使用小 DTO。TypeScript facade 继续执行 hostile JavaScript descriptor-first 捕获，Rust 再做 exact-shape decode；Rust transaction 不回调任意 JavaScript provider。

### ARV2-R016 — 分阶段迁移和可逆切换

RKP-0～RKP-9 必须保持严格依赖序列，每阶段独立任务、分支、allowlist、审计、接受和归档；任一失败回滚到上一 accepted stage。RKP-8 是唯一默认引擎切换点，产品不长期暴露 TS/Rust 双引擎选择器。

### ARV2-R017 — Rust 完成后优先 Guitar Core Loop

RKP-9 接受归档后，必须先以统一协议所需的最小公共 Plugin SDK 完成“单吉他谱 → 普通音符/休止符 → 弦品 → Layout → SVG → 基础 Playback → `.bgp` Save/Open → Undo/Redo”的首个纵向闭环，再继续扩展 marketplace/lifecycle API、通用 Registry 或高级 capability。

### ARV2-R018 — 性能与资源资格可观测

V2 必须固定交互、stress、RSS 目标，并增加 full scan、full clone、full validation、snapshot materialization、visited entities、updated indices、overlay records、ChangeSet bytes、FFI bytes 计数。普通局部编辑的前四项必须为零。

### ARV2-R019 — 旧架构冲突必须有 disposition

每个会造成实现分叉的旧想法必须被标记为 `保留`、`修订`、`废弃` 或 `历史记录`，并明确新 owner。候选阶段不直接编辑旧文档；接受后由独立 docs-only authority-sync 提交添加 current/superseded 标记和引用。

### ARV2-R020 — 商业级质量门

未来实现必须覆盖数据正确性、确定性、性能、资源上限、故障隔离、兼容、可回滚、可观测和端到端产品旅程。绿色 typecheck/build/full suite 只是必要条件，不能替代复杂度计数、differential oracle、hostile boundary 和真实 Guitar Core Loop 证据。

### ARV2-R021 — Plugin Command、Proposal 与 Kernel Request 分离

Plugin Semantic Command 在 Extension Host 中解释用户意图；插件只产生 detached `DomainChangeProposal`；Gateway 将其封装成固定的 `KernelExtensionTransactionRequest`。Rust Core 只认识 CoreCommand 与 ExtensionProposal，不注册 `guitar.*`、`piano.*` 或 `bass.*` handler。

### ARV2-R022 — 三层权威验证

每个 Extension transaction 按固定顺序执行：Core Semantic Validation、Rust Extension Protocol Validation、Plugin Domain Validation。Instrument Plugin 的可写领域数据必须提供 `DeclarativeDomainRules` 或确定性 WASM validator；缺少可接受的领域 validator 时，该 namespace 保持无损读取并停止写入。

### ARV2-R023 — 确定性 WASM 合同

事务级 WASM 仅接收规范化 detached input 并返回 data-only diagnostics/classification。它不直接修改 Store；不观察墙钟、随机数、文件、UI 或线程；执行受版本、内存、fuel、输出条数和输出字节上限约束。trap、超限或 malformed return 映射为原子 rejection。

### ARV2-R024 — Plugin migration 前置于 Session

插件 migration 在 detached 文档上、KernelSession 创建之前执行：Core decode/migration → Extension Host resolution → installed plugin migrations → 三层验证 → KernelSession composition。插件缺失时保留原 ExtensionBlock；migration 失败时不发布 writable/partially migrated session，并保留 lossless read-only 结果及 diagnostics。

### ARV2-R025 — Namespace 所有权与跨插件协作

插件只写自己声明且被 assembly 接受的 namespace。跨插件协作只能读取对方公开、版本化 contribution/capability；任何插件都不直接修改另一个插件的 ExtensionBlock。依赖和能力在新 Session 构造时解析并冻结。

### ARV2-R026 — Layout Contribution 与 Renderer 分离

Instrument Plugin 描述需要表达的语义对象；Layout Engine 决定位置；Render Scene 是稳定中间表示；Renderer 决定 SVG、Canvas、WebGPU 或 PDF 输出。乐器插件不持有 Renderer 对象或直接发出绘图调用。

### ARV2-R027 — Persistence 资格分层

Official BGP Persistence 是首版 mandatory trusted product service，唯一负责 canonical `.bgp` 保存、原子替换、恢复和 unknown extension 保真。MusicXML、MIDI、PDF、PNG 和附加文档格式通过 Import/Export/DocumentFormat Provider 扩展；替换 canonical `.bgp` owner 需要独立产品架构决策。

### ARV2-R028 — Stale revision 固定策略

Kernel 对 `expectedRevision != currentRevision` 返回稳定 `extension.stale-revision`，不在 Core 内自动 rebase。Extension Host 可以获取最新 snapshot 并重新执行原始 Plugin Semantic Command，最多自动重算一次；位置破坏或语义歧义操作返回 UI 重新确认。

### ARV2-R029 — FrozenKernelContributionCatalog

Product Extension Host 只提交严格 data-only 的 `KernelContributionCatalogDescriptorV1`。`KernelSessionComposition` 对其做 exact decode、重复/依赖/namespace/version/hash/order/cap 校验，再编译成不会跨 FFI、带私有 composition identity 的 `FrozenKernelContributionCatalog`。请求中的 fingerprint 只用于确定性 session mismatch，不作为真实性来源；任意 TypeScript/React 插件实例、DOM、回调和宿主对象都留在 Product Extension Host。

### ARV2-R030 — 混合架构定位

Brilliant Guitar 正式定义为 Microkernel/Plugin Architecture、Domain Model、Ports & Adapters、Command/Handler、CQRS-like read/write separation 与 Transactional Runtime Core 的混合架构，而非把全部产品能力强行归入单一微内核。

## 5. 范围外

本 planning candidate 明确排除：

- `src/**`、`test/**`、`package*.json`、`tsconfig*.json`、Cargo、Tauri、React 或构建配置修改；
- RKP-1 创建、启动或生产实现；
- Score schema V2、entity-owned/Note-owned ExtensionBlock；
- Guitar Instrument Plugin、Layout、Renderer、Playback、Persistence、Workbench、Extension Host 的生产实现；
- ready session 内 hot reload、unload、replace；
- 旧公开 export 或 command ID 删除；
- CVN-7 stress method 的再次正式测量；
- 当前 architecture authority 的立即替换；
- 归档、远端 push 或发布。

## 6. 接受标准

### 6.1 架构内容

- [ ] 主文档自包含并覆盖现状、目标、迁移、产品闭环和旧设计 disposition。
- [ ] Brilliant Core Platform 各上下文及 Product Application 边界唯一。
- [ ] 七 crate 依赖图无环，Core Types 保持最小叶子层。
- [ ] ScoreDocument/LiveScoreStore、EntityId/RuntimeHandle/MusicalLocation 无混用。
- [ ] transaction、history、validation、snapshot、event、thread owner 唯一。
- [ ] KernelSessionComposition 和 Product ApplicationAssembly 各有且只有一个 owner。
- [ ] Instrument、functional、visual、service contributions 与插件生命周期边界完整。
- [ ] Plugin Command、DomainChangeProposal、Kernel Request 三者没有混用。
- [ ] 三层验证、WASM、migration、namespace 和 stale revision 合同完整。
- [ ] `.bgp` canonical Persistence 与 Import/Export Provider 的资格边界完整。
- [ ] Layout Contribution、Layout Engine、Render Scene、Renderer 的责任链完整。
- [ ] Note/Event/time 与 ExtensionBlock owner 没有隐式 schema 漂移。
- [ ] RKP-0～RKP-9 顺序、rollback 和 post-RKP Guitar Core Loop 一致。
- [ ] 28/51/8/34/9/`brilliant-score-1` 兼容清单完整。

### 6.2 规划工件

- [ ] `prd.md`、`design.md`、`implement.md`、研究资料、handoff、review、JSON/JSONL 全部存在。
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
