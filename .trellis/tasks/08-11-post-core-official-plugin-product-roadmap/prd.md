# Post-Core 官方插件与产品路线 PRD

> **Current architecture authority:** accepted Architecture Reset V2 at `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` (`e81c739b...`; audit `01a01da3...`, PASS, 34/34). This parent is synchronized by `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync` and remains planning-only/review-pending.

## 状态与权威

- 状态：`planning`。
- 性质：Core VNext 关闭后的长期父任务与交付顺序合同。
- 当前基线：`faaf424cf370bbf055ad2cf9862e472a50edc22f`。
- 当前优先级：继续完成 CVN-2、CVN-6、CVN-5、CVN-7；本任务在 CVN-7 独立验收归档前保持未激活。
- 实施边界：本任务本身只维护路线、合同、子任务映射和最终集成门；生产实现必须由后续独立子任务拥有。
- 当前架构指针：V2 是唯一 current architecture authority；本文件的旧五层文字仅在明确映射到 V2 owner 时继续作为路线说明。

## 目标

在不扩大 Core VNext 范围的前提下，固定以下长期交付顺序，并为后续操作者提供无歧义的进入条件、依赖、职责和验收边界：

`Core Platform/RKP-9 → equal Instrument Plugins → Product Host/Guitar Core Loop → Product Qualification → Product Extension Host/public plugins`

本任务要保护两项同等重要的长期资产：

1. 内核扩展性本身属于 Core 完成定义，必须先做到稳定、统一、可度量；
2. 完整软件随后通过官方插件和产品宿主消费该内核，而不是把具体吉他、视觉、播放或文件实现重新塞回 Core。

## Architecture Reset V2 边界同步

| Boundary | 唯一 owner | 关键禁止事项 |
|---|---|---|
| Core Platform / Kernel Runtime mechanisms | `brilliant-kernel-runtime` | 不拥有 Product Host、插件宿主或 Guitar 私有业务 |
| Kernel Session / Composition / 28 use cases | `brilliant-kernel-session` | 不重建 Product ApplicationAssembly，不形成第二状态/事务 owner |
| Product ApplicationAssembly | Product Host / `workbench-editor-session-v1` | 不把 Kernel private identity 当作应用 assembly identity |
| Product Extension Host | Product Host / `public-extension-platform-v1` future child | 不暴露 raw Registry、裸事件总线或 mutable ScoreDocument |
| Instrument Plugin protocol | `brilliant-extension-protocol` shared public contract | Guitar/Piano/Bass/third-party 平级；Guitar 不获得 Rust privileged provider |

`KernelSessionComposition` 与 `Product ApplicationAssembly` 各自返回原子 `ready | failed` 结果，并拥有不同 identity。RKP-9 完成后先进入 Guitar Core Loop；公共 Extension Host/marketplace/广泛 plugin API 仍在其后。

## 已确认事实

- Pure Core Kernel V1 已关闭。
- CVN-0、CVN-1、CVN-3、最终 CVN-4、扩展性预留门禁和 GD-0 文档/架构合同已验收。
- 当前已接受 Core 目录有 25 个命令；CVN-5 完成后固定为 28 个。
- CVN-2 在独立工作树中已有未提交实现候选，但最终独立实现复审、提交、接受和归档仍是当前门禁；本任务基线不吸收该未提交候选。
- CVN-6 负责把已接受的官方模块目录接入唯一 CommandBus、事务、历史、回放和事件所有者。
- CVN-5 负责范围删除、WrittenPitch 范围移调和显式原子 batch。
- CVN-7 负责兼容性、确定性、可靠性、资源和规模资格门，并关闭有限 Core VNext。
- GD-0 已固定 Guitar Domain 如何通过官方模块命令、验证、分类和模块自有 extension effect 接入 Core；Guitar 生产实现尚未激活。
- 产品目标已经固定 Windows 桌面首发、标准六弦 Guitar Core Loop、键盘优先编辑、SVG 首发渲染、基础播放校对、`.bgp`、PDF/PNG、简中/英文和商业级开源质量。

## 层级定义

### Layer 1：Core Kernel

拥有通用谱面真相、语义命令、事务历史、地址范围、验证、schema/迁移入口、快照、事件、模块贡献目录和结构化失败合同。

### Layer 2：官方领域插件

首个实现为 Guitar Domain，拥有调弦、弦品、技巧、吉他领域命令、领域验证、支持性分类、模块自有数据和迁移语义。

### Layer 3：官方产品服务模块

拥有 Layout、Renderer、Playback、Persistence、Import/Export、Analysis 和 Template 等可替换派生能力。

### Layer 4：产品宿主

拥有 Desktop Shell、Workbench、Editor Session、Input Controller、Application Assembly，以及公共插件阶段才建立的 Extension Host；负责把 Core 与已批准模块组装为可操作、会话内稳定的产品。

### Layer 5：后续公共插件

在官方插件和产品闭环验证稳定合同后，开放主题、菜单、工具栏、面板、谱面 overlay、功能命令、分析、教学、导入导出、渲染和播放等视觉与功能贡献。公共插件只调用 Extension Host 暴露的版本化 facade，不直接持有可变 ScoreDocument、可变 Registry 或裸事件总线。

## 需求

### POPR-R001 — Core VNext 是当前第一优先级

- CVN-2、CVN-6、CVN-5、CVN-7 按现有依赖和独立验收流程完成。
- 本任务不改变 CVN 的合同、命令数量、阶段顺序或文件所有权。
- CVN-7 验收归档以前，post-Core 实现子任务保持未创建或未激活。

### POPR-R002 — 内核扩展性属于 Core 完成定义

- Core 完成线包含官方模块 SDK、冻结目录、运行时集成、模块验证/分类/effect、兼容迁移、统一事务和资格门。
- Core 完成线排除具体 Guitar 规则、工作台、布局、渲染、播放、物理文件 IO、导出和公共插件宿主。
- CVN-7 结束后停止向 Core VNext 追加新的产品机制。

### POPR-R003 — CVN-7 后首先进入官方插件路线

- 第一个 post-Core 实现任务必须是官方 Guitar Domain V1。
- 其依赖为已归档 CVN-0 至 CVN-7、已接受 GD-0 和本父任务的规划接受记录。
- 任何公共插件平台实现都排在 Guitar Domain 和产品闭环之后。

### POPR-R004 — 第一批官方插件为 Guitar Domain

- Guitar Domain 拥有标准六弦调弦、弦品映射、首批技巧、吉他领域命令、验证、分类、extension schema、fixture 和迁移。
- Core 继续只保存 WrittenPitch、通用谱面结构和不解释领域 payload 的 ExtensionBlock。
- Guitar Domain 的写入必须进入同一 Core 事务、历史、回放和事件通道。

### POPR-R005 — 官方产品服务模块保持在 Core 外

- Layout、Renderer、Playback、Persistence、Export 由独立子任务拥有。
- 它们读取冻结 snapshot、selector 或经批准的派生输入；谱面改变统一转换为语义命令、导入结果或迁移结果。
- 派生布局、SVG 对象、播放队列、文件句柄和导出页面模型不成为 ScoreDocument 真相。

### POPR-R006 — Desktop Shell、Workbench 和 Editor Session 属于产品宿主

- Desktop Shell 拥有窗口、文件选择、系统集成、安装和打包。
- Workbench 拥有菜单、工具栏、命令面板、属性检查器、设置、i18n 和模块视觉编排。
- Editor Session 拥有光标、选区、临时坐标、输入上下文和视图状态。
- Application Assembly 在启动期原子选择 Core、官方模块和产品服务；ready 后的应用会话保持固定贡献集合。
- `workbench-editor-session-v1` 是 Application Assembly、官方 service-provider 目录和稳定应用会话 identity 的唯一首版实施 owner；Guitar Core Loop 只调用该 child 已验收的 assembly contract/factory。
- 产品宿主通过公开 Core/模块合同协作，不形成第二个文档写入口。

### POPR-R007 — Guitar Core Loop 是首个完整产品闭环

闭环必须覆盖：新建标准六弦谱、输入四小节 riff、首批技巧、六线谱/五线谱同步显示、播放校对、保存、关闭重开、自动保存恢复、PDF/PNG 导出和可重复端到端验收。

### POPR-R008 — 公共视觉与功能插件后置开放

- 首次公共插件规划在官方 Guitar Domain、官方服务模块、产品宿主、Guitar Core Loop 和产品资格门完成之后进入。
- 首批公共贡献至少覆盖主题/快捷键/模板、谱面 overlay、只读分析和语义命令。
- 面板、完整 Renderer/Playback Adapter 和更广导入导出 contribution 按独立版本化子任务开放。
- 公共插件的发现、manifest 校验、授权、事件过滤、异常隔离和贡献映射由未来 Extension Host 拥有；应用 ready 后不增删、启停或热替换贡献。

### POPR-R009 — 官方与第三方最终共享版本化贡献合同

- 官方模块先对贡献合同进行真实产品验证。
- 公共 SDK 从已经被官方模块和集成测试使用的合同提取，而不是提前冻结未验证接口。
- 官方编译绑定与公共插件 manifest 是不同的发现/授权前端，但必须映射到同一版本化逻辑贡献模型；来源不自动授予权限。
- 进入应用装配后共享语义命令、冻结快照、过滤事件、结构化报告和版本纪律；第三方路径始终经过 Extension Host facade，不直接调用私有 Registry binding。

### POPR-R010 — 商业级开源交付覆盖完整产品

- 发布路线必须覆盖根仓库说明、Apache-2.0、贡献流程、DCO、第三方声明、变更日志和版本策略。
- 工程门禁必须覆盖类型、格式、单元/集成/端到端测试、文件 fixture、视觉 golden、播放事件、性能基准、安装和发布检查。
- “Core 测试通过”只证明 Core 基础，不替代产品层资格门。

## 未来子任务映射

| 顺序 | 建议 slug | 交付物 | 强制依赖 |
|---:|---|---|---|
| 1 | `official-guitar-domain-v1` | Guitar extension schema、调弦/弦品/技巧、领域命令与 fixture | CVN-0～7、GD-0、本规划接受 |
| 2 | `bgp-file-contract-persistence-v1` | 物理 `.bgp`、打开/保存/自动保存/恢复 | Core schema/迁移稳定、Guitar 数据合同 |
| 3 | `layout-primitives-v1` | 框架中立的谱面布局与 hit-area primitives | Guitar Domain、Core snapshot/address |
| 4 | `svg-renderer-v1` | 六线谱/五线谱 SVG 与技巧视觉语义 | Layout、Guitar Domain |
| 5 | `playback-validation-v1` | 播放事件、传输控制、节拍器、光标输入 | Guitar Domain、Core musical time |
| 6 | `workbench-editor-session-v1` | Desktop/Workbench、Editor Session、Application Assembly、官方 provider 目录、文件/播放绑定、命令面板、i18n | File/Persistence、Layout、Renderer、Playback、Guitar Domain、Core commands |
| 7 | `pdf-png-export-v1` | PDF/PNG 页面生成、进度、结果报告及 Workbench contribution | Layout、Renderer、Workbench contribution API |
| 8 | `guitar-core-loop-integration-v1` | 新建到导出的完整纵向闭环 | 以上 1～7 |
| 9 | `product-release-qualification-v1` | 产品兼容、性能、安装、发布和开源门禁 | Guitar Core Loop 集成 |
| 10 | `public-extension-platform-v1` | 公共视觉与功能插件平台规划、合同提取和实施拆分 | 产品资格门、官方合同证据 |

子任务只在其直接依赖被独立验收归档后创建；任务树不替代写入每个子任务 PRD/implement 的显式依赖。

## 进入、退出与停线条件

### 本父任务进入条件

- 统一规划基线包含最终 CVN-4、扩展性章程、GD-0 和 CVN-2 规划。
- 本任务只修改 `.trellis/**`。

### 本父任务规划完成条件

- PRD、design、implement、三份 research、上下文 JSONL 和操作者交接全部完成。
- 产品父任务和 Core VNext 路线完成窄同步。
- Trellis validation、JSON/JSONL、文档引用、保护路径、diff check、Core 基线验证和独立规划复审通过。
- 规划提交完成，任务状态仍为 `planning`。

### post-Core 激活条件

- CVN-0 至 CVN-7 全部独立验收归档。
- Core VNext 父路线记录固定 28 命令和最终资格证据。
- 用户明确批准创建第一个官方 Guitar Domain 子任务。

### 停线条件

- 任一 CVN 仍处于候选、修复或复审状态；
- post-Core 子任务要求改变 Core VNext 已接受公共行为；
- 官方模块需要第二套文档、事务、历史、回放或事件所有者；
- 产品任务试图把 React、具体渲染对象、播放节点或物理 IO 放入 Core；
- 公共插件平台早于官方插件和 Guitar Core Loop 被激活。

## 明确排除

- 本任务不创建上述十个实现子任务。
- 本任务不运行 `task.py start`。
- 本任务不修改生产代码、测试、package 或 tsconfig。
- 本任务不实现 Guitar Domain、UI、渲染、播放、文件、导出或公共插件运行时。
- 本任务不改变已接受 Core V1/CVN/GD-0 合同。

## 验收标准

- [ ] POPR-AC-001：任务状态为 `planning`，分支、基线、父任务和工作树信息完整。
- [ ] POPR-AC-002：`POPR-R001`～`POPR-R010` 均有唯一职责和可核对结果。
- [ ] POPR-AC-003：Core、官方领域插件、官方服务模块、产品宿主、公共插件五层职责互不重叠。
- [ ] POPR-AC-004：Core 完成线精确指向 CVN-2、CVN-6、CVN-5、CVN-7，且不扩大其范围。
- [ ] POPR-AC-005：未来十个子任务顺序、交付物和强制依赖完整。
- [ ] POPR-AC-006：每个产品阶段都记录进入条件、退出条件和用户收益。
- [ ] POPR-AC-007：产品层差距分别映射到 Guitar、文件、布局、渲染、播放、工作台、导出、集成和资格任务。
- [ ] POPR-AC-008：公共插件平台位于官方插件、产品闭环和产品资格门之后，并固定经 Extension Host/versioned facade 接入，零 raw Registry 或裸事件总线访问。
- [ ] POPR-AC-009：Guitar Domain 的数据、命令、验证和迁移所有权与 Core 边界一致。
- [ ] POPR-AC-010：Layout/Renderer/Playback/Persistence/Export 的派生数据不进入 ScoreDocument。
- [ ] POPR-AC-011：`workbench-editor-session-v1` 唯一拥有 Application Assembly；产品宿主没有第二写入口、历史、回放或事件所有者，装配失败发布零会话，ready 后不改变活动会话贡献集合。
- [ ] POPR-AC-012：Guitar Core Loop 覆盖新建、编辑、技巧、双谱表显示、播放、保存重开、恢复和 PDF/PNG。
- [ ] POPR-AC-013：开源和产品质量门不以 Core 绿灯替代。
- [ ] POPR-AC-014：产品父任务和 Core VNext durable roadmap 均包含固定 post-Core 出口。
- [ ] POPR-AC-015：`implement.jsonl` 和 `check.jsonl` 含真实、存在且相关的 spec/research 路径。
- [ ] POPR-AC-016：相对基线的 `src/**`、`test/**`、`package.json`、`tsconfig.json` 差异为零。
- [ ] POPR-AC-017：Trellis validation、JSON/JSONL、父子引用、`git diff --check`、typecheck、build 和全量测试通过。
- [ ] POPR-AC-018：独立规划复审结果为 P0/P1/P2=`0/0/0` 后才创建规划提交。
- [ ] POPR-AC-019：操作者交接明确当前继续 CVN-2，post-Core 父任务保持未激活。
- [ ] POPR-AC-020：未来操作者可仅依据本任务确定下一任务，不再重新选择阶段顺序。
