# Core VNext Extensibility Reservation Review

> **状态：** 正式 Trellis documentation-only 子任务；规划包经用户审阅后已运行 `task.py start`，当前为 `in_progress`，只执行获批的父合同、路线图、GD-0 forward-evolution 和本任务证据同步。生产源码、测试、持久化 schema、活动 Registry 与现有 V1 运行时合同不属于本任务差异。
>
> **CVN-4 基线：** CVN-4 已于 2026-08-09 独立验收并归档：source/test `788594e670a1608ee2beabddcd217a9d340a5d30`、acceptance `1bb19b0ca4859e546e121593e522ba13d7406982`、archive `13039d05a2120e8db49924f4a417d4c36702cde1`，P0/P1/P2=`0/0/0`。本分支通过 merge `783f69c` 吸收已提交基线；CVN-4 独立 worktree 的归档后并行 dirty paths 保持原样。

## 1. 目标与产品价值

在 GD-0 最终合同确认、CVN-2 正式创建和 CVN-6 运行时集成之前，为 Core VNext 建立一个有限、版本化、可验证的扩展性预留章程。章程要证明未来技巧、乐器、分析和第三方模块可以通过追加式合同进入产品，而不要求重做 `ScoreDocument` 真相源、唯一事务所有者、history/replay/event 语义或已发布 V1 合同。

本任务解决的是“未来扩展从哪里进入、何时进入、由谁拥有、怎样升级和怎样失败”，而不是一次性实现完整插件平台。完成后，CVN-2 和 CVN-6 的操作者将获得明确边界：哪些是当前 V1 必须实现的能力，哪些只建立未来版本通道，哪些机制永久排除在模块权限之外。

产品收益：

- 官方领域模块继续使用稳定、确定的 V1 贡献通道；
- 后续模块文档操作、领域查询、安装升级和外部 Adapter 具有明确的版本入口；
- 当前 Core-only 工作保持推进，不因未来插件场景扩大 CVN-4；
- 将来扩展时主要追加新 ABI/registration entry，而不是回头改写 V1；
- 文件兼容、撤销、重放、缺失模块读取和迁移责任在实现前被写清。

## 2. 实时基线与权威

### 2.1 2026-08-09 实时状态

| 对象 | 已确认事实 | 本任务处理 |
|---|---|---|
| CVN-0 / CVN-1 / CVN-3 | 已有独立验收与归档记录 | 作为既有稳定输入 |
| CVN-4 | 已独立验收并归档；source/test `788594e`、acceptance `1bb19b0`、archive `13039d0`，P0/P1/P2=`0/0/0` | 作为已接受结构生命周期基线；本任务不重开或改写其结论 |
| 原始规划基线 | `00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8` | 保留为规划来源追踪 |
| 当前执行基线 | accepted CVN-4 branch `700bac9c457dba84d801161e7d3c39b83ed075ad`；merge/activation HEAD `783f69c581b32549fae3fb3d168cb2848bdd53f0` | 后续 task-owned diff 以 `783f69c` 为比较点 |
| 本任务分支 | `codex/core-vnext-extensibility-reservation-review` | 只承载获批规划文档差异；已合入的 CVN-4 source/test 属前置基线 |
| CVN-2 | 尚未建立正式 child；依赖 GD-0 独立合同确认 | 本任务必须在其合同冻结前关闭 |
| CVN-6 | 尚未建立正式 child；依赖 accepted CVN-2 | 消费本任务和 CVN-2 的最终决定 |
| CVN-5 | 依赖 accepted CVN-2、CVN-3、CVN-4、CVN-6 | 消费最终 Core/module batch 语义 |

### 2.2 权威顺序

1. 已独立验收的 Core 行为与活动 Core 规格；
2. 父任务 `feature-contract-matrix.md`；
3. 父任务 `prd.md`、`design.md`、`implement.md`；
4. GD-0 的 `public-contract` fences 与 `design.md`；
5. 本任务的 PRD、design、implement 和 research；
6. 路线图状态摘要；
7. 历史讨论与旧任务记录。

冲突规则：本任务可以规划父合同的显式修订，但在修订通过独立评审和用户确认之前，现有父合同仍是行为权威。本任务中的占位类型名只用于描述版本通道，不自动形成公开 API。

## 3. 已确认的问题

当前 Core VNext 已有良好扩展基础：

- `ExtensionBlock` 提供 namespace/schemaVersion/owner/payload；
- `kernel.domain-commands.v1` 与 `CompiledDomainCommandContributionV1` 提供官方模块命令、验证、分类和 effect 定义；
- Assembly 在启动期全量构建、原子失败并深度冻结；
- Core/module 命令最终由同一个 transaction/history/replay/event owner 执行；
- CVN-5 的 batch 将允许同一冻结 Assembly 内的 Core 与官方模块命令组合；
- 缺失或不兼容的已知扩展进入无损只读状态，未知扩展保持无损保存。

长期扩展风险集中在五处：

1. V1 module-to-Core effect 只覆盖 `WrittenPitch`；
2. 领域专属 Selector 尚无独立贡献合同；
3. `ExtensionOwner` 在 `brilliant-score-1` 中固定为 Score/Part，后续细粒度方案尚无升级章程；
4. 模块安装、升级、禁用与 Assembly 代际尚无 Host 级路线；
5. Renderer、Playback、Import/Export、Analysis、UI Tool 等外部扩展口尚未进入统一版本图。

风险的正确处理方式是保留当前稳定内核，在版本边界上增加明确插槽；不是向模块交付可变文档、通用补丁或第二套事务系统。

## 4. 固定决策

### 4.1 立即保持的内核不变量

- `ScoreDocument` 是唯一持久化乐谱业务真相；
- 所有语义写入进入同一个 `submit(unknown)` 和候选态事务链；
- Core/module 共用 documentVersion、history、undo/redo、replay、checkpoint/dirty 和 committed event；
- ready Session 使用不可变 Assembly；
- handler 只获得 detached read view 与受限 builder；
- inverse 由 Core 或拥有 effect definition 的贡献从 candidate 当前值推导；
- namespace、capability、API/schema version 和资源限制必须显式；
- generic patch、JSON path、数组下标 target、whole-document replacement、可变文档句柄、第二 bus/history/replay/event owner继续排除。

### 4.2 预留分类

本任务必须把每个扩展建议放入且只放入下列一个类别：

| 类别 | 含义 | 当前代码结果 |
|---|---|---|
| `ADOPT_CONTRACT_NOW` | 现在写入父/GD-0 演进章程，约束 CVN-2/CVN-6 的兼容姿态 | 可产生规划文档 delta；不新增运行时功能 |
| `DEFER_VERSIONED_GATE` | 记录未来 entry/API/schema 版本、前置条件和验收场景 | 当前 V1 保持原样；未来独立任务实现 |
| `EXCLUDE_PERMANENTLY` | 与单一真相、单一事务或确定性冲突 | 后续模块也不获得该能力 |

### 4.3 本轮推荐分配

| 扩展项 | 分类 | 决定 |
|---|---|---|
| V1 command contribution、validator/classifier、Extension effect | `ADOPT_CONTRACT_NOW` | 保持现有 V1 精确形状与边界 |
| 新 registration entry / ABI 并行版本规则 | `ADOPT_CONTRACT_NOW` | 新能力使用新 entry/API version；已发布 V1 不原地扩大 |
| 模块结构化文档操作计划 | `DEFER_VERSIONED_GATE` | 未来采用受限、typed、bounded 的 Core operation expansion；当前使用 Core 命令和 CVN-5 batch |
| 领域 Selector contribution | `DEFER_VERSIONED_GATE` | 未来只读、detached、bounded、capability-gated |
| Extension envelope/owner 粒度升级 | `DEFER_VERSIONED_GATE` | 通过新 Score schema 与显式 migration；`brilliant-score-1` 保持不变 |
| Assembly generations 与模块包 Host | `DEFER_VERSIONED_GATE` | 新 Session 绑定新代，旧 Session 保持原代 |
| Renderer/Playback/Import/Export/Analysis/UI Adapter | `DEFER_VERSIONED_GATE` | 产品 Host 层版本化，Core 保持领域和平台无关 |
| ready Assembly 原地 register/unregister/replace | `EXCLUDE_PERMANENTLY` | 以新 Assembly generation 和新 Session 取代原地变更 |
| mutable document / generic patch / second transaction owner | `EXCLUDE_PERMANENTLY` | 继续作为架构禁区 |

## 5. Requirements

### R001 — 规划隔离与 CVN-4 状态真实性

所有文档必须准确记录 CVN-4 已独立验收并归档及其决定性 commit/P0-P2 证据。本任务的 task-owned Git diff 以 activation baseline `783f69c` 为起点，只包含自身任务工件和获批的父/GD-0 规划文档；已接受 CVN-4 source/test/archive 历史作为合并基线保留，CVN-4 独立 worktree 的归档后并行 dirty paths 不进入本任务。

### R002 — 有限扩展性章程

交付一份完整扩展口清单。每个扩展口必须写明 owner、数据方向、版本单元、权限、Session 生命周期、失败模式、兼容策略、迁移责任、当前阶段和未来进入条件。清单不得使用“以后再说”或无 owner 的开放占位。

### R003 — V1 精确保持

本任务默认保持以下 V1 合同：`kernel.domain-commands.v1`、`CompiledDomainCommandContributionV1` 九字段、score/Part Extension owner、WrittenPitch module-to-Core request、现有 availability/migration、28 Core command IDs、`brilliant-score-1` 和当前资源上限。任何 V1 形状变化必须作为显式 parent/GD-0 contract delta 单独列出，不可通过解释性文字暗中扩大。

### R004 — 追加式 ABI 版本通道

父合同必须明确：未来模块能力通过新的 registration entry、API version 或 Score schema version追加；同一版本的 ID、字段含义、capability 和 failure 语义保持稳定。Assembly compiler 对每个支持版本使用独立 decoder/binding parity；未知版本稳定拒绝；版本间没有隐式降级、猜测或自动 reinterpretation。

### R005 — 模块文档操作演进边界

规划未来的 typed Core operation expansion，但不冻结未经实施验证的公开签名。未来门禁至少固定：

- 模块提交原始语义命令，不取得 mutable candidate；
- expansion 只引用声明 capability 允许的 Core 操作；
- 使用稳定 entity ID/ScoreAddress，不使用数组下标和 JSON path；
- 最大展开深度为一层；排除 self-recursion、module-to-module 隐式调用和 nested batch；
- 每次 expansion 受 child/effect/address/resource 上限约束；
- 全部操作进入一个 candidate，并只产生一个 commit/history/event；
- Core/module 最终语义验证与 Replay 仍使用同一逻辑 Assembly；
- 旧贡献缺失或版本不兼容时继续走明确 availability 结果。

当前 V1 的跨边界组合路径保持为：应用或模块前端构建 `core.transaction.batch`，其中包含独立 Core 与模块语义命令。

### R006 — Domain Selector 演进边界

规划一个未来只读贡献门禁。Selector 必须读取 detached snapshot/compatible ExtensionBlock view，只返回 data-only、detached、deeply frozen、bounded 结果；沿用 capability/namespace/assembly identity；不形成缓存真相、活动订阅所有者或写入口。高成本查询需要显式资源限制和取消/超限结果。

### R007 — Extension 持久化演进

保持 `brilliant-score-1` 的 `(owner, namespace)` 唯一和 Score/Part owner。未来 block ID、更细粒度 owner/address 或分片只通过新 Score schema 和显式纯数据 migration 进入。规划必须说明旧文档无损读取、模块缺失、迁移失败、回滚、未知 extension 保真和旧 Session 行为。

### R008 — Assembly generation 与模块包生命周期

规划未来 Host 流程：安装/升级候选包 → 身份、依赖、capability、ABI/schema compatibility 校验 → 构建全新不可变 Assembly → 新 Session 绑定新代 → 旧 Session 保持原代。后续第三方 Host 可以追加签名、来源、沙箱、进程隔离、资源配额和故障隔离；这些内容不进入 CVN-2 V1 的系统可信内置模块实现。

### R009 — 外部 Adapter 平面

Renderer、Playback、Import/Export、Analysis 与 UI Tool/Panel 归产品 Host 或专用服务所有。它们通过 Snapshot/Selector 读取，通过 Command/Gateway 写入；物理 IO、布局缓存、音频时钟和 UI 状态不进入 `ScoreDocument`、Core history 或模块命令 ABI。未来每类 Adapter 使用独立版本化 contribution contract，不复用 document-effect 权限代替自身合同。

### R010 — 模块依赖与互操作

未来模块依赖只通过 composition root 的显式 identity/version/schema requirement 解析。模块之间不持有对方 handler、bus 或 mutable state。跨模块业务操作通过同一 Assembly 内的公开语义命令、batch 和共享 Core addresses/facts 组合；循环依赖、缺失依赖和版本冲突在 Session 创建前稳定失败。

### R011 — 代表场景追踪

规划必须逐项证明下列场景存在当前路径或明确未来 gate：

1. 技巧模块新增、更新、删除 Part-owned 技巧数据；
2. 技巧命令同时改变 WrittenPitch 与自己的 extension；
3. 钢琴 Part、双谱表、Voice、Event staff assignment 使用 Core 命令；
4. 钢琴指法、踏板、左右手归属使用模块 extension；
5. 钢琴高层结构化操作使用当前 batch 或未来 operation expansion；
6. 领域 UI 查询自己的派生视图；
7. 模块缺失、版本过新、迁移失败和重装恢复；
8. 模块升级后新旧 Session 并存；
9. Renderer/Playback/Import/Export 消费模块数据但不修改 Core 内部状态；
10. 多模块原子事务、undo/redo/replay 和 failure rollback。

### R012 — 父合同最小 delta

后续文档执行阶段采用最小变更：

- 父 `prd.md` 追加 `CVN-D012`、`CVN-R012`、`CVN-AC018`；
- `feature-contract-matrix.md` 在 CVN-FC-112 后增加非 V1 功能的“Additive evolution reservation”子节，不新增 Core command、FC primary owner 或 qualification 数量；
- roadmap 增加本 planning gate、CVN-2 前置复审和后 CVN-7 future-gate index；
- GD-0 `design.md` 增加 forward-evolution boundary，保持所有 `public-contract` fence 字节/语义不变；
- 活动 `.trellis/spec/**` 等实际行为通过未来 accepted implementation 同步，本任务不提前改写。

### R013 — 数量与行为保持

规划 delta 必须保持：

- Core command 总数 28；
- `CVN-FC-*` heading 与 primary-owner 计数不变；
- `brilliant-score-1` 不变；
- 当前 V1 ABI 字段、effect scope、caps、failure priority 和 fixtures 不变；
- CVN-4 的 15 命令与审计边界不变；
- CVN-5 原始 child batch 语义不变；
- CVN-2/CVN-6 仍需单独规划、激活、实现和独立验收。

### R014 — 依赖与停止点

CVN-4 已完成并作为稳定输入。以下动作进入前必须完成本任务的独立评审、用户确认和归档：

- GD-0 作为最终 accepted contract 被锁定；
- CVN-2 正式 child 创建或 public SDK allowlist 冻结；
- CVN-6 运行时设计开始消费 CVN-2。

CVN-2 保持对 accepted GD-0、accepted CVN-1 与 accepted reservation gate 的依赖；CVN-5 保持对 accepted CVN-2/CVN-3/CVN-4/CVN-6 的依赖。本任务不重开 CVN-4 验收。

### R015 — 可验证规划证据

交付物必须包含当前 surface inventory、reservation decision matrix、scenario matrix 和 contract impact map。验证覆盖 JSON/JSONL、Markdown fence、路径存在、parent/child linkage、任务状态、FC/command count、规划-only diff、`task.py validate` 与 `git diff --check`。

### R016 — 独立审查与交接

独立审查必须给出 P0/P1/P2 计数，并重点检查：V1 是否被静默扩大、未来预留是否误写成已实现、CVN-4 accepted/archive 证据是否准确、是否产生第二事务路径、是否遗漏具体场景、task-owned diff 是否碰触 source/test/spec/CVN-4 archive。任务已经经用户批准 activation；最终用户接受后才记录 gate acceptance/archive，并使 GD-0/CVN-2 消费该章程。

## 6. Acceptance Criteria

- [x] AC001：任务目录、parent linkage、独立 `codex/` 分支和 worktree 已建立；用户批准后 `task.py start` 已将状态切换为 `in_progress`。
- [x] AC002：文档记录 CVN-4 的 source/test、acceptance、archive commits 和 P0/P1/P2=`0/0/0`，与 live archive 证据一致。
- [x] AC003：扩展口全部进入 `ADOPT_CONTRACT_NOW`、`DEFER_VERSIONED_GATE` 或 `EXCLUDE_PERMANENTLY`，没有未分类条目。
- [x] AC004：`ScoreDocument`、single submit、single transaction/history/replay/event owner 与 frozen Session Assembly 被列为永久不变量。
- [x] AC005：`kernel.domain-commands.v1` 和 `CompiledDomainCommandContributionV1` 的当前边界被精确列出。
- [x] AC006：未来 ABI 使用新 entry/API version，未知版本、冲突和不兼容具有稳定创建失败规则。
- [x] AC007：模块文档 operation expansion 的深度、递归、目标、capability、资源、事务和 replay 边界完整。
- [x] AC008：当前 V1 Core/module 组合明确继续使用 `core.transaction.batch`。
- [x] AC009：Domain Selector 的输入、输出、能力、资源与真相所有权完整。
- [x] AC010：Extension envelope/owner 的未来升级明确使用新 Score schema 与显式 migration。
- [x] AC011：Assembly generation 保证新旧 Session 代际隔离和候选构建原子性。
- [x] AC012：第三方包 Host 与系统可信内置模块 V1 清晰分层。
- [x] AC013：Renderer/Playback/Import/Export/Analysis/UI Adapter 的 owner 和 Core 协作边界完整。
- [x] AC014：模块依赖不存在直接 handler/state 耦合，composition root 负责确定性解析。
- [x] AC015：十个代表场景全部映射到当前路径或具名 future gate。
- [x] AC016：父 PRD delta 精确为 CVN-D012/CVN-R012/CVN-AC018。
- [x] AC017：Feature Matrix delta 不新增 Core command 或 `CVN-FC-*` primary owner。
- [x] AC018：GD-0 forward-evolution 同步不改变任何现有 `public-contract` fence。
- [x] AC019：活动 `.trellis/spec/**` 在行为落地前保持当前 accepted 描述。
- [x] AC020：28-command、`brilliant-score-1`、V1 effect scope、caps、fixtures 和 failure priority保持原样。
- [x] AC021：CVN-2/CVN-6/CVN-5 的依赖和停止点与父路线一致。
- [x] AC022：`implement.jsonl` 与 `check.jsonl` 只含真实 spec/research 上下文，没有 seed `_example`。
- [x] AC023：任务、父任务和引用路径通过 Trellis validation；Markdown fences、JSON/JSONL 和 `git diff --check` 通过。
- [x] AC024：最终 diff 没有 `src/**`、`test/**`、构建配置、CVN-4 task 或活动 spec 修改。
- [x] AC025：提交后验收复核在一项窄 P2 术语修复后给出最终 P0/P1/P2=`0/0/0`；用户于 2026-08-09 授权继续收尾。Gate 可归档，CVN-2 仍需 accepted GD-0 与单独 planning approval。

## 7. Out of Scope

- 生产 TypeScript、测试、fixture、build/package 配置修改；
- 重开、修改或替代 CVN-4 已记录的 source/test、验收、归档和独立审查结论；
- CVN-2、CVN-5、CVN-6 的实现或 task activation；
- 新 Core command、Note/Chord lifecycle 或新 target/address kind；
- `brilliant-score-1` 迁移或 `ExtensionOwner` 运行时扩展；
- 第三方脚本执行、沙箱、签名、市场、下载器和 UI；
- Renderer、Playback、Import/Export Adapter 的实现；
- runtime hot reload、活动 Session 原地迁移、跨 Session undo 或协同编辑；
- 对现有资源预算、失败优先级和 qualification fixture 的重新选择。

## 8. Open Questions

没有阻断本轮规划的问题。用户已经确定“先完成 Core、同时在 CVN-2/CVN-6 前预留强扩展位置”；本任务采用“V1 精确保持 + 新版本通道预留 + 未来独立 gate”的最小复杂度方案。任何希望把 future gate 提前为 V1 功能的决定都需要单独 parent/GD-0 contract review。
