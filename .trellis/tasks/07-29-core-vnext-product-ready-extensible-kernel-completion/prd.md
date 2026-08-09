# Core VNext Product-Ready Extensible Kernel Completion

## Goal

在已验收的 Pure Core Kernel V1 之上，以追加式、可版本化且稳定优先的方式，完成产品级可扩展微内核所需的全部领域无关机制。完成后的 Core 必须允许随产品发布的官方领域模块接入同一套文档真相、事务、history、undo/redo、replay、验证、支持分类、事件、diagnostics 与迁移语义，同时继续保持 Core 对 Guitar、UI、渲染、播放、物理文件系统和插件运行时的零依赖。

本任务是父级规划与最终集成门禁，不直接批准生产实现。每个可独立验收的能力必须拆成子任务，完成独立规划、实现、审计与归档后，父任务才可关闭。

## Background and Confirmed Baseline

- Pure Core Kernel V1 已在 `d92a7586536ac8757c318ae6f75aabd8698f85ac` 正式关闭；K1-6 验收覆盖 8/8 聚焦测试与 169/169 完整测试。
- 当前 Core 已包含九类机制：领域模型与 codec、命令事务、history/replay、地址与范围、snapshot/selectors/checkpoint/dirty/events、Registry/Capability/Gateway、errors/issues/reports，以及当前 schema migration。
- 当前公开命令目录只有六个 Core 命令；新建谱面、小节结构编辑、范围删除、范围移调和显式批事务曾被明确延期。
- K1-4 Registry 只支持启动期静态装配的 Core command/selector，并在 ready 后冻结；没有 runtime register/unregister/replace、Registry change event 或第三方代码执行。
- GD-0 已形成官方领域命令加入唯一 `CommandBus`、history、replay 与事件链的文档候选，但仍处于独立验收等待状态，尚未授权生产实现。
- Core V1 qualification 记录 25 个合同组覆盖、0 coverage gap、0 可复现缺陷；唯一非阻断 P3 是公开 `unknown` guard 的 descriptor-first、no-getter、no-throw 合同尚未统一写入规范。
- `ScoreDocument`、`CommandBus`、documentVersion、history、checkpoint/dirty 与 committed event 各自仍只有一个权威 owner。

## Product Decisions

### CVN-D001 — Completion target

采用 **A：产品级可扩展微内核**。Core VNext 的完成标准是领域无关机制足以支撑官方模块与完整编辑闭环，而不是把所有产品功能放入 Core。

### CVN-D002 — Stability over hot plug

稳定性是首要目标。模块、descriptor、handler、validator、profile、migration 与 capability 在应用启动期完成校验、编译和冻结；ready 后没有热插拔、动态注册、卸载、替换或 change event。

### CVN-D003 — Additive evolution

Core V1 保持已验收基线。VNext 使用版本化追加接口、显式兼容矩阵和迁移路径，不静默改名、扩大或重新解释既有 V1 公共合同。

### CVN-D004 — Microkernel ownership

Core 只拥有跨模块一致性所需的机制。Guitar 语义、Editor 会话、Layout、Renderer、Audio、物理 `.bgp` IO、导入导出适配器和未来 Extension Host 继续由用户态模块拥有。

### CVN-D005 — One state and transaction owner

领域模块不建立第二份谱面模型、第二个 bus、第二套 history/replay/event 或通用 patch 通道。所有语义写入必须经过唯一 Core 事务所有者。

### CVN-D006 — Controlled kernel-spine refactor

Core VNext 需要一次范围较大的内部“内核脊柱重构”，但不进行整套 Core 推倒重写。重构只覆盖当前阻碍可扩展性的闭合接缝：command decode/dispatch、prepare/apply effect、private history entry、validator/classifier pipeline、replay catalog binding，以及 Registry 的 compiled contribution assembly。

该重构必须作为独立子门禁先完成，保持六个既有命令、Core-only 公共 API、结果分类、版本、history、undo/redo、replay、checkpoint/dirty 与 event trace 完全兼容；重构门禁内不同时加入新结构命令或 Guitar 行为。read/snapshot/address、ScoreDocument codec/语义、events、reports 和 current-schema migration 等稳定主体按默认冻结处理。

### CVN-D007 — Capability delivery after refactor

结构编辑仍分阶段交付：先创建谱面与 measure 生命周期，再处理 Part/Staff/Voice 生命周期，最后加入范围变换与显式原子 batch。分阶段是为了隔离不变量和回归来源，不缩减最终完成范围。

### CVN-D008 — Aggregate deletion and reference safety

采用“所有权级联、跨引用严格拒绝”：删除实体时，其结构上独占且随父实体失去意义的后代作为一个 aggregate 原子移除并完整保存 inverse；来自 aggregate 外部的稳定引用不会被静默级联删除，必须先通过显式迁移、重指向或独立删除命令处理。公共删除命令不提供通用 `cascade: true` 开关。

- 删除 Measure 同步移除每个 Part 对应的 `PartMeasureContent`；
- 删除 Part 同步移除其 Staff、全部 measure content、Voice/Event/Note 以及所有 Part-owned `ExtensionBlock`；
- 删除 Voice 同步移除其自身 Event/Note；
- 删除 Staff 时，只要任何 Voice `defaultStaffId` 或 Event `staffId` 仍引用该 Staff，就稳定拒绝；
- 删除最后一个 Measure、Part、Staff 或 Voice 时，现有 semantic required invariant 继续决定是否拒绝；
- 所有被级联移除的未知 extension/payload 必须进入细粒度 inverse，undo 后深度相等恢复。

### CVN-D009 — Cross-module atomic batch

显式 batch 从第一版起允许按顺序组合 **当前 session 的同一冻结 assembly** 能够解码的 Core 与官方模块命令。Batch 仍通过唯一 `submit(unknown)` 入口提交，不新增第二个写方法；输入只包含原始语义命令信封，不接受已解码 command、catalog/assembly handle 或内部 effect。禁止 nested batch；child count 固定为 `1..100`，单个 transaction 的 expanded primitive effects 与 canonical affected addresses 均固定上限 `131,072`，输入图上限遵守 `feature-contract-matrix.md` 的 CVN-FC-010。

整个 batch 只创建一个候选文档，按 child 顺序 decode/prepare/apply，在全部 child 完成后运行一次完整 semantic/domain validation 与 classification pipeline。任一 child 失败时返回稳定的 `failedCommandIndex` 与 child failure，整体状态保持不变；成功时只产生一次 documentVersion 增量、一个 history entry、一个 committed event 和一个聚合 assessment。聚合顺序固定为 child command 顺序，每个 child 内 Core first、随后 frozen module catalog order。

### CVN-D010 — Balanced product qualification scale

采用 **A：平衡型产品验收规模**。发布阻断的代表性 fixture 固定为 200 Measures、8 Parts、每个 Part/Measure 恰好 2 Voices、每个 Voice 恰好 8 Events，共 25,600 Events；组合恰好两个 synthetic official modules，并以恰好 2,000 个已提交 history entries 验证长历史路径。

在记录完整 Node/OS/CPU/内存/build hash 的 Windows reference environment 上，预热后多次采样并以 P95 判定：普通单目标 submit/undo/redo `<= 100 ms`，immutable read/snapshot `<= 50 ms`，100-child 原子 batch `<= 300 ms`，100-command deterministic replay `<= 2 s`，代表性 fixture 的 create/decode/semantic/compatibility pipeline `<= 1 s`。

另设 400 Measures、16 Parts、每个 Part/Measure 恰好 2 Voices、每个 Voice 恰好 8 Events，共 102,400 Events；从同一初始文档提交并 replay 恰好 10,000 个 semantic envelopes。该档必须确定性完成、peak RSS `<= 2.0 GiB`，且没有 crash、stack overflow 或 state divergence；其 latency 先作为趋势记录，经过单独批准的预算后再升级为发布阻断项。可移植 CI 以结果一致性、资源上限和同机 accepted-baseline A/B ratio `<= 1.20` 为主，不在未校准机器上直接套用 reference-Windows 绝对耗时。

### CVN-D011 — Core-first roadmap ownership

用户已决定先把领域无关内核机制完整收口，再恢复 Guitar Domain 实现。GD-0 已冻结的公开 construction/result/availability/replay 合同继续作为候选权威，Core VNext 不重新命名或扩大这些合同；但其旧下游执行顺序在本父规划获批后必须同步为：

- 原 CK1.1-0 guard prerequisite 由 CVN-0 承接；
- 新增 CVN-1 行为保持型脊柱重构；
- 原 CK1.1-1 official module SDK 由 CVN-2 承接；
- 原 GD-2 中领域无关的 Core runtime seam 由 CVN-1、CVN-6 承接，cross-module batch 扩展由 CVN-5 承接；
- GD-1、GD-3、GD-4 在 CVN-7 通过后恢复规划与实施；旧 GD-2 不再重复实现第二套 Core seam，剩余 Guitar binding 工作在 Guitar 路线恢复时重新定界。

该映射只调整下游工作归属，不把 Guitar schema、命令或技巧移入 Core，也不把尚待独立验收的 GD-0 文档候选提前表述为 accepted baseline。

### CVN-D012 — Versioned extensibility reservations

Core VNext 的完成合同继续以当前 V1 形状为准；未来能力通过新的 registration entry、明确的新 API version、独立的 Score schema version 或 Core 外部 Adapter contract 追加。已发布版本的字段含义、capability、failure、资源上限和 Session 语义不在原版本内扩张，也不通过隐式降级、猜测或 reinterpretation 改变。

本父级现在预留五类后续独立 gate：受限的 module-to-Core operation expansion、只读 Domain Selector contribution、更细粒度 Extension owner/schema、Assembly generation 与模块包 Host、Renderer/Playback/Import/Export/Analysis/UI Adapter。每个 gate 都必须另有 owner、版本、失败模型、兼容与迁移合同、资源上限、fixtures、决定性测试、用户批准和独立验收；这些预留不属于当前 V1 实现范围，也不增加 Core command、FC primary owner 或运行时导出。

以下不变量跨所有未来 gate 永久保持：`ScoreDocument` 唯一真相；单一 transaction/history/replay/event owner；ready Session 绑定不可变 Assembly；模块仅获得 detached read data 与受限、typed、bounded 能力；generic patch、JSON path、mutable document、whole-document replacement、ready Assembly 原地 register/unregister/replace 和第二事务所有者继续排除。该章程必须在 GD-0 最终合同验收和 CVN-2 public SDK allowlist 冻结前完成独立复审；CVN-6 只消费已验收的 CVN-2 与本章程。

## Requirements

`feature-contract-matrix.md` 是以下需求的绑定式明细。它已经在父级冻结 28-command finite catalog、factory、payload、anchor、cascade、range、batch、failure priority、resource caps、fixture 与 benchmark method。Child 只拥有实现、私有组织和证据，不拥有重新选择这些可观察合同的空间。

### CVN-R001 — Finite completion charter

规划必须给出有限、可验收的 Core VNext 完成定义、子任务图、依赖顺序、公共 API 演进规则和最终停止门禁。不得使用“继续完善”作为无限延期或无限扩张的理由。

### CVN-R002 — Official module contribution seam

Core 必须提供面向随产品编译发布的官方模块的强类型、版本化贡献入口，使模块可贡献领域命令及其严格解码、handler、受限 effect request、validator、support classifier、issue 与 affected-address facts，并加入同一原子事务链。模块不提供 inverse；Core 必须从隔离候选的当前值推导并反序保存细粒度 inverse effect set。

贡献目录必须启动期一次性构建、全量验证、深度冻结；构建失败时不得暴露半初始化 session。Core-only 构造与行为保持原样。

### CVN-R003 — Stable module SDK

规划必须定义最小官方模块 SDK，包括纯数据合同、只读上下文、descriptor/binding parity、namespace ownership、API/schema compatibility 和数据化失败边界。SDK 不暴露可变 `ScoreDocument`、内部 mutation/history、bus internals、subscriber、clock、randomness、filesystem、network 或平台对象。

### CVN-R004 — Generic document-structure operations

Core 必须补齐产品编辑闭环需要的领域无关结构能力。父级固定范围包括：

- CVN-FC-020/021 的确定性单-measure 初始 `ScoreDocument` factory；
- `core.measure.insert/remove/move/set-definition`；
- `core.part.insert/remove/move/set-name/set-instrument`；
- `core.staff.insert/remove/move/set-definition`；
- `core.voice.insert/remove/move/set-default-staff/set-sequence-start`；
- `core.event.set-staff-assignment`；
- 所有受影响 measure coverage、引用、稳定 ID、未知 extension 与 history 逆变换的一致性维护。

以上十九个结构命令的 ID、target、payload、anchor、no-op、cascade 与 rejection 已由 CVN-FC-030–070 固定。独立子任务必须逐项实现和证明，不通过公开 patch、JSON path、数组下标目标或整文档覆盖实现。

结构删除遵守 CVN-D008。所有权 aggregate 的级联是该语义命令的确定组成部分；跨 aggregate 引用在 effect application 前完成 preflight，并返回稳定、无部分变更的拒绝结果。

### CVN-R005 — Range and explicit atomic batch operations

Core 必须在已有 `ScoreRange` 基础上实现 `core.range.delete`、`core.range.transpose-written-pitch` 与 `core.transaction.batch`。三者的 inclusive selection、owner rules、遍历顺序、no-op、failure attribution 与原子 batch pipeline 由 CVN-FC-080–102 固定。批处理必须有确定顺序、单次 validation/commit、单个 history entry、单个 documentVersion 增量、统一 undo/redo/replay/event 语义和稳定失败优先级。

Batch 遵守 CVN-D009：可组合 Core 与官方模块命令，但每个原始 child envelope 都必须由活动 session 的 frozen assembly 唯一解析。未知/不兼容命令、外部 catalog/assembly handle、nested batch、101-child、131,073-effect/address 和中途 preparation/effect failure 均原子拒绝；child execution failure 带零基 index，final semantic/domain failure 保持顶层 failure，不虚构 child index。

智能历史合并、按时间窗口自动压缩与隐式命令合并不属于完成门禁；如未来需要，必须另设显式 `historyMergePolicy`。

### CVN-R006 — Domain validation and compatibility integration

集成 session 必须先运行 Core semantic validation，再按冻结目录顺序运行所有适用且精确兼容的官方领域 validator；随后才执行 Core 与模块 profile/support classification。验证完整性必须显式呈现，缺失或不兼容的 required contribution 进入无损只读状态，不得伪装为完整验证。

### CVN-R007 — Schema and migration evolution

规划必须定义 Core schema 与官方扩展 schema 的版本兼容、读取、迁移和报告责任。Core 保留未知 extension；已知模块只解释自己拥有且版本兼容的 payload。迁移必须是确定、纯数据、可审计、可回归且与活动 CommandBus 状态脱离的过程。

物理包读取、文件路径、原子写盘、自动保存与恢复仍由 Persistence Service 负责。

### CVN-R008 — Input-boundary consistency

所有公共 `unknown` guard 与严格 codec 必须遵循 descriptor-first、no-getter、no-throw、有限工作量与稳定数据化失败。该规则属于领域 predicate/codec 边界；K1-5 errors/reports 继续负责意外异常的稳定转换，两者保持分层。

### CVN-R009 — Public API evolution and compatibility

新增公共能力必须具备明确的 API version、兼容规则、冻结边界、弃用策略和导出测试。VNext 不得扩大为通用 document mutation API，也不得让 module identity 污染既有 Core-only envelope、history、replay 或 event shape。

### CVN-R010 — Reliability and scale qualification

最终门禁必须覆盖：

- 大型谱面、长 history 与长 replay 的确定性和资源上限；
- hostile input、getter/proxy/稀疏数组和异常 handler 隔离；
- 多官方模块装配顺序与兼容矩阵；
- submit/no-op/reject/undo/redo/replay/checkpoint/dirty/event 的跨机制一致性；
- codec/migration round-trip 与未知 extension 保真；
- 公共 API、forbidden dependency、隐私安全失败和工作区可复现构建。

规模与延迟合同遵守 CVN-D010 及 CVN-FC-130–134。Qualification harness 固定使用 5 次 warm-up、20 次 measured samples、nearest-rank P95、fresh state、确定性 generator/seed，并记录 median/P95、peak heap/RSS、环境信息与 build hash；失败报告必须区分绝对预算失败、同机 A/B `1.20` ratio 回归和功能/确定性失败。最终产品质量规范需要同步这些已批准阈值，不继续只保留“approximately immediate”的非量化描述。

### CVN-R011 — Parent/child delivery model

本父任务自身拥有 Core VNext API evolution and completion charter，并固定为下列八个独立子门禁；child 正式任务名可在创建时确定，但命令集合、公共功能条件和验收数据已经由本 PRD 与 `feature-contract-matrix.md` 固定，拆分任务不扩大或重新解释其能力范围：

1. public unknown-guard consistency；
2. behavior-preserving command/transaction/registry spine refactor；
3. official module SDK and frozen contribution assembly；
4. document creation and measure lifecycle commands；
5. Part/Staff/Voice lifecycle commands；
6. range transformations and explicit atomic batch；
7. domain validation/profile/diagnostic/schema-migration integration；
8. Core VNext compatibility, reliability and scale integration gate。

每个子任务必须在自身 `prd.md`/`implement.md` 写明真实依赖，不以父子目录关系暗示执行顺序。

父规划获批后只按依赖逐个创建和评审下一项 child，不要求预先创建全部八项。父任务进入协调状态不等于任何生产 child 获得实施授权。

### CVN-R012 — Future extension port charter

每个 future extension port 必须在实现前形成可审计章程，并逐项写明：机制 owner、registration/contract ID、版本单元、输入输出方向、capability、Session/Assembly 生命周期、资源上限、稳定失败、兼容规则、迁移与回滚责任、缺失或版本不兼容时的行为、代表性 acceptance scenario，以及进入正式 planning 的前置证据。

未来版本只能追加独立 decoder、binding parity、export allowlist 和 qualification fixture。operation expansion 必须保持 typed、stable-addressed、单层、bounded，并复用同一个候选与提交；Selector 必须只读、detached、deeply frozen、bounded；Extension owner 粒度只随新 Score schema 和显式纯数据 migration 进入；模块包变更只构建新 Assembly generation 并由新 Session 使用；外部 Adapter 通过 Snapshot/Selector 读取并通过 Command/Gateway 写入。任何 port 若要求扩大现有 V1 九字段 ABI、改变 `brilliant-score-1`、新增第二事务路径或给 ready Assembly 提供原地 mutation，必须停止该 child 并返回父级合同复审。

## Out of Scope

- runtime hot plug、register/unregister/replace、模块热重载与 Registry changed event；
- 第三方插件发现、签名、授权、沙箱执行、进程隔离与 Extension Host 生命周期；
- Guitar tuning、string/fret、slide、bend、vibrato 或其他乐器领域规则；
- React/Tauri UI、Editor session、布局、渲染、播放与音频引擎；
- 物理 `.bgp` 包、文件路径、自动保存、崩溃恢复以及 PDF/PNG/Guitar Pro 实际 IO；
- 公开 patch、JSON path、mutable document getter、任意脚本 handler 或第二套事务系统；
- 隐式 history merge、协同编辑、OT/CRDT 和跨会话 undo。

## Acceptance Criteria

- [ ] CVN-AC001: `prd.md`、`design.md`、`implement.md` 明确定义有限 Core VNext 完成边界，并通过用户审阅。
- [ ] CVN-AC002: 父级 charter 与 CVN-R011 的八个独立子门禁全部可追踪，每个子任务写明输入基线、依赖、产出和停止条件。
- [ ] CVN-AC003: 所有规划均锁定 startup-frozen composition；公共 API 中不存在 ready 后的注册、卸载、替换或热插拔入口。
- [ ] CVN-AC004: Core V1 公共合同被列为兼容性基线，并有自动化公共导出与行为回归计划。
- [ ] CVN-AC005: 官方领域命令通过唯一 bus/history/replay/event owner 原子执行，且 Core 源码保持零 Guitar 依赖。
- [ ] CVN-AC006: 通用结构、范围和 batch 能力分别有精确、可测试、无 patch 的语义命令计划。
- [ ] CVN-AC007: module validation、profile、diagnostics、schema compatibility 与 migration 的责任和执行顺序无歧义。
- [ ] CVN-AC008: hostile input、性能、确定性、未知 extension 保真、失败隐私和多模块组合均进入最终 qualification matrix。
- [ ] CVN-AC009: Guitar、UI、渲染、播放、物理 IO 与第三方插件生命周期仍通过公开 Core 合同协作，没有被吸收入内核。
- [ ] CVN-AC010: 父任务最终只在全部子门禁独立通过、活动规范同步、完整回归通过且人工验收后关闭。
- [ ] CVN-AC011: 内核脊柱重构具有重构前 characterization trace 和重构后深度相等证明；该门禁没有新增用户可见命令、领域行为或动态生命周期。
- [ ] CVN-AC012: 稳定主体的受保护路径清单明确；任何超出命令/事务/Registry 接缝的修改都必须给出独立不变量证据并重新评审范围。
- [ ] CVN-AC013: Measure/Part/Voice 删除的 ownership cascade 可精确 undo/redo/replay；Staff 跨引用删除稳定拒绝，公共合同中不存在通用 cascade 开关。
- [ ] CVN-AC014: CVN-D010 的 25,600-event 发布阻断 fixture 满足全部 reference-Windows P95 预算，102,400-event stress fixture 与 10,000-command workload 确定性完成，且 benchmark 证据可复现。
- [ ] CVN-AC015: GD-0 与产品路线图完成 CVN-D011 映射同步；GD-0 公共合同未被静默改写，旧 CK1.1/GD-2 generic Core seam 没有形成重复实施路径。
- [ ] CVN-AC016: `feature-contract-matrix.md` 的 CVN-FC-001–143 全部映射到唯一 primary owner 与决定性测试；active child 文档不存在未决公共合同占位符或未量化的发布条件。
- [ ] CVN-AC017: 新增命令目录精确为 22 个、VNext Core 总目录精确为 28 个；公共导出/catalog fixture 对 ID、version、target 和 payload 做 exact allowlist 断言。
- [x] CVN-AC018: 所有 future extension port 均可追踪到 owner/version/capability/data-direction/failure/compatibility/migration/Session lifecycle/acceptance scenario；`kernel.domain-commands.v1`、九字段 ABI、WrittenPitch/score-Part effect scope、`brilliant-score-1`、28-command catalog、44 个 `CVN-FC-*` headings、9 个 primary-owner rows、资源上限和 GD-0 public-contract fences 保持基线相等；任务差异只含获批规划文档，且 CVN-2/CVN-6 明确消费已验收 reservation charter。
