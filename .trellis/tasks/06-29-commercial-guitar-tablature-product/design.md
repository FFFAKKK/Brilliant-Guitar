# Guitar Core Loop 技术设计

## 状态

- 阶段: Core K1-1～K1-5 已正式验收并归档；K1-6 审计修复测试候选 `355512aba4a8057d2d75aa665d74df49cdd2e23c` 已完成并通过 8/8 聚焦、169/169 完整测试，等待独立验收；Pure Core Kernel V1 尚未正式关闭，产品其余阶段保持 planning
- 目标: 为第一条可运行 MVP 闭环提供需求反推的技术设计骨架。
- 已确认技术栈: Tauri 2 + TypeScript + React + Vite。
- 首发平台: Windows 桌面。
- 架构原则: 参照操作系统微内核思想的 Core Kernel + 用户态服务模块。当前只实施 Pure Core Kernel 的已批准分块；外部工程目录结构属于后续脚手架阶段，不是当前内核事项。
- 首个实现里程碑: Pure Core Kernel V1，纯 TypeScript、无 UI、无 Tauri、无 VexFlow、无 Web Audio、无 PDF/PNG。
- K1-1 模型决策源: `.trellis/tasks/archive/2026-07/07-13-k1-1-foundation-replanning/design.md`；K1-2 执行源已归档；K1-3 权威源为 `.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`，已在 `7369eeac60fecea66c2c9164c04439625c2d78b0` 正式验收并通过 102/102 测试。字段级与行为级契约以 `.trellis/spec/core-kernel/` 为准。
- K1-4 Registry 合同以独立任务和活动 SPEC-015 为准；report 与更广插件协作仍只是路线图，不得反向扩大 K1-3 或 K1-4 封闭合同。

## 设计目标

第一阶段不追求 Guitar Pro 全量复刻，而是先证明 `Brilliant Guitar` 能完成专业打谱软件的最小闭环:

1. 新建标准 6 弦吉他谱。
2. 输入 4 小节 riff。
3. 同步显示六线谱和基础五线谱。
4. 添加少量 P0 高频吉他技巧。
5. 播放校对并显示播放光标。
6. 保存为 `.bgp`。
7. 重新打开 `.bgp` 后内容不丢失。
8. 导出可读 PDF 和 PNG。

## 架构设计: 微内核 + 用户态服务模块

### Microkernel: Core Kernel

内核是谱面真相和模块协作的唯一核心。所有操作都服务 `ScoreDocument` 谱面数据；布局坐标、屏幕坐标、导出页面坐标和播放光标都只能从谱面快照派生。它应该尽量小，只保留影响一致性、兼容性和长期维护的能力。我们可以接受少量 API 边界和快照成本，换取架构稳定性和扩展性。它负责:

- 谱面文档模型: `ScoreDocument` 由 `metadata + measureDefinitions + parts + extensions` 组成；通用骨架是 `Part -> Staff -> 每小节 Voice -> 有序 Event -> Note`。Core 不保存弦号、品号或吉他技巧语义。
- 音乐时间模型: 持久化规范化 `Fraction + NoteValue`，事件位置由 Voice 序列精确推导；tick、PPQ、毫秒和布局时间由适配层派生。
- MVP 验证: Core semantic validation 与 `ScoreFeatureProfile` 分离。通用 schema 可表达多 Part/Staff/Voice、和弦和未来节奏；首个 profile 只支持 4/4、固定 tempo、一个 Part/Staff、每小节一个 Voice、四分/八分/十六分、基础休止和单音。
- 软分析边界: 第一阶段不做软一致性、可演奏性分析、指法建议、教学提示、风格检查或难度评分；这些能力不阻塞 MVP。
- 命令事务: 已验收 K1-2 通过六个封闭命令处理 metadata、WrittenPitch、NoteValue、Voice Event 插入/删除和 undo/redo；patch/delta 只作内部实现。新建谱、小节增删、范围编辑和吉他技巧命令属于后续独立分块。
- 文档地址和范围: `ScoreAddress`、`ScorePoint`、`ScoreRange` 和命令目标校验。当前 UI 光标、选区高亮、鼠标拖选和临时 `ScoreCoordinate` 属于 `Editor Session Service` 或 `Layout Module`，不属于微内核。
- 文件契约: `.bgp` schema、manifest、score JSON、schema version、迁移入口。
- 快照和查询: `CommandBus.read()` 返回深冻结 `DocumentSnapshot`、history depths、dirty；六个 selector 与分层 range 提供受控读取，物理序列化属于 Persistence。
- 事件和注册表: K1-3 只提供 document-committed 与 dirty-state-changed 两个事实；K1-4 只登记现有 command/selector adapter，且不新增 Registry event。K1-5 migration/report 是 registry 外的 additive 观察与兼容边界；`ExtensionBlock` 不是 registry。
- 能力边界: `KernelCapability`、module identity、API version 和 capability 检查。
- 错误、诊断和报告: 内部 sealed error family，公共深冻结 `KernelIssue`，以及只面向当前真实消费者的 validation/migration `KernelReport`；K1-1 `Diagnostic`/`ValidationReport` 保持不变，导入/导出/恢复报告属于后续外部模块合同。

Core Kernel 路线图仍按 9 类机制分类，但按任务分块实施；当前 K1-1 只交付第 1 类所需模型、codec、semantic/profile validation 与诊断，不把 9 类机制一次性实现:

1. 谱面核心对象模型，包括音乐时间模型。
2. 命令系统调用边界。
3. 事务、历史和一致性边界。
4. 文档地址和范围模型。
5. 硬一致性验证。
6. `.bgp` 语义契约和迁移入口。
7. 快照、事件和模块通信协议。
8. 注册表与能力边界。
9. 错误、diagnostic 和 report 契约。

内核边界计数规则: Core Kernel V1 的机制数量固定为 9 类。新增字段、数据结构或子模型必须先归入这 9 类之一；音乐时间模型归属第 1 类“谱面核心对象模型”，不是第 10 类内核功能，也不是播放时钟服务或 UI 时间线服务。未来如果某个能力无法清晰归入 9 类机制，必须先经过单独规划审查，不能在实现时直接塞进内核。

内核扩展准入规则: 只有当某个能力是多个模块共同依赖的基础契约、无法外置而不制造第二份谱面真相，并且能通过 schema、语义命令、validator、migration、snapshot/event、registry/capability 或 error/report 形成可测试契约时，才允许进入 Core Kernel。主要服务 UI 会话、布局/渲染、音频调度、物理导入导出 IO、插件发现/生命周期、分析建议或产品流程的能力必须留在外部模块。

注册表 handler 注销、运行时卸载、运行时热插拔、运行中插件启用/禁用和权限 UI 不进入当前 Core Kernel 实现规划；Kernel V1 只保留统一注册协议、registry/capability 和启动期静态模块清单，保证未来插件平台或 Extension Host 可以把第三方模块映射进同一注册流程。Core Kernel 完成后，会继续建设多个由官方随应用发布的内置模块，这些模块通过 registry/capability 与 Core Kernel 协作；具体模块清单、模块数量和拆分方式后续再规划。UI 模块只是官方内置模块中的一类，不被写死为第一个、唯一插件或固定顺序。未来第三方插件的安装、移除、启用和禁用配置只能在应用启动前完成；运行时热插拔、运行中卸载和启停不作为规划目标。

### Pure Core Kernel V1 Boundary

Pure Core Kernel V1 最终覆盖上述 9 类机制，但必须按 K1-1 至 K1-6 逐块评审。K1-1 至 K1-5 已验收归档；K1-6 已形成实现候选并等待独立验收。任何当前分块都不包含桌面壳、React UI、VexFlow/SVG 渲染、Web Audio 播放、PDF/PNG 真实导出、Guitar Pro 导入、Tauri 文件系统或第三方插件运行时。

Pure Core Kernel V1 可以定义外部导入/导出贡献点的抽象 descriptor 类型、capability 检查和 report 外壳，但不得注册 PDF、PNG、Guitar Pro 或 `.bgp` 物理读写的具体 descriptor/handler。`.bgp` schema、manifest 语义和迁移入口属于内核；zip 读写、文件路径、自动保存恢复、PDF/PNG 页面生成和 Guitar Pro 解析都属于外部用户态服务模块。

每个 Pure Core Kernel 分块必须能在无 UI、无浏览器 DOM、无 Tauri、无 VexFlow、无 Web Audio 的 TypeScript 测试环境中运行。K1-1 当前验收只覆盖 exact-time、schema/codec round-trip、semantic/profile validation、unknown ExtensionBlock 保真、诊断与公共导出边界；后续机制由各自任务验收。

音乐时间边界: Core 持久化规范化 `Fraction` 与 `NoteValue`，小节有效时长来自 meter/pickup，事件位置来自 Voice.sequence 的起点与前序时值之和。PPQ/tick、毫秒调度、Web Audio 时间、节拍器声音和播放光标都是 Playback/Layout adapter 派生数据，不写回 `ScoreDocument`。

谱面核心对象模型边界: `ScoreDocument` 顶层包含 `schemaVersion`、`id`、`metadata`、全谱 `measureDefinitions`、`parts` 与 `extensions`。Part 拥有 Staff、每小节内容与 Voice；Voice 的有序 Event 保存 `NoteValue` 和 rest/notes 内容。Note 只保存 WrittenPitch，SoundingPitch 由 Part transposition 派生。调弦、弦品位置与吉他技巧不进入 Core 字段。

吉他模块边界: Core K1-1 通过 score/part-owned `ExtensionBlock` 语义保真地保存未知 JSON payload，但不解释 payload。后续 Guitar Domain 在 Part-owned extension 中定义调弦、noteId 到弦品位置及吉他技巧；其 namespace、版本、codec、验证和迁移必须在 Block 2 单独设计。

内核禁止:

- 依赖 React、Tauri、VexFlow、SVG DOM、Web Audio、PDF/PNG 库或具体文件选择器。
- 引入 PDF/PNG 生成器、Guitar Pro 解析器、zip 文件 IO、字体嵌入或平台文件系统实现。
- 保存 VexFlow 对象、DOM 节点、组件状态或播放引擎状态。
- 把 UI 坐标、SVG 坐标、VexFlow 坐标、PDF/PNG 页面坐标或播放光标状态写入 `.bgp` 当作谱面语义。
- 把 Web Audio `currentTime`、真实毫秒播放调度、节拍器输出状态或 DAW transport 状态写入 `ScoreDocument`。
- 解析屏幕坐标、布局坐标、SVG/VexFlow 坐标、鼠标拖选、缩放滚动或 hit testing。
- 让任何模块绕过命令事务修改文档。
- 暴露任意 patch、JSON path、字段替换或脚本式写入命令。
- 在事件 payload 中暴露可变 `ScoreDocument`、内部 delta、React 组件、SVG/VexFlow 对象、Web Audio 节点或 Tauri 文件对象。
- 把 UI 光标、选区高亮、鼠标拖拽或播放光标 tick 当作 Core Kernel 事件。

### Kernel Snapshot / Event Protocol

当前已验收合同见 `specs/SPEC-014-kernel-snapshot-events.md`。K1-3 采用:

- Snapshot / Selector: `CommandBus.read()` 返回携带 `documentVersion` 的 `DocumentSnapshot`、history depths 与 dirty；selector 结果由输入 snapshot/read state 的版本关联。
- Post-Commit Event: K1-3 只发布 committed submit/undo/redo 的 `core.document.committed`，以及 dirty 布尔变化时的 `core.session.dirty-state-changed`；其他事实必须由后续分块单独批准。
- Command-only write: event 和 snapshot 都不是写入口，任何修改仍然必须回到语义命令。
- Cache invalidation: 渲染、播放、导出和自动保存根据来源 `documentVersion` 与事件类型失效缓存。
- Error isolation: 事件处理器同步 throw 或返回 Promise/thenable 后异步 rejection 均不得回滚已提交事务、阻止后续 handler 或产生未处理 rejection；结构化模块错误报告由 K1-5 定义。
- No reentrancy: 事件分发期间 submit/undo/redo/markPersisted 稳定拒绝；Core 不创建隐式延迟事务，外部需要后续写入时只能在回调结束后显式调度。
- Derived read models: 外部模块可以基于 snapshot 创建布局 primitives、hit areas、播放事件、导出页面模型、缩略图、分析报告或导入中间模型；这些派生数据不是 `ScoreDocument` 副本，不能保存为权威谱面，也不能整体写回内核。

明确不放进内核事件:

- UI 当前光标。
- 选区高亮。
- 鼠标拖拽状态。
- 播放光标 tick。
- SVG DOM 事件。
- VexFlow 对象生命周期。
- Web Audio 节点事件。
- 外部可变 `ScoreDocument` 副本。
- 外部整文档覆盖 API，例如 `getMutableDocumentCopy`、`replaceDocumentFromExternalCopy` 或 `saveMutableWorkingCopy`。

### Kernel Registry / Capability Protocol

批准设计见 `specs/SPEC-015-kernel-registry-capability.md` 与独立 K1-4 任务:

- Atomic Startup Registry: 完整 manifest 严格解码、compiled binding 与 candidate 验证全部成功后，才返回 frozen ready Registry。
- Closed Contributions: 只登记现有六个 command 与六个 K1-3 selector adapter；不接受 arbitrary handler 或其他 kind。
- Static Capability Gateway: 七个 capability 互不蕴含，模块先授权再委托既有 CommandBus/selector/read/subscribe；trusted Core Host direct API 保留。
- Minimal Summary: 只读、确定排序、深冻结、脱离内部状态，不泄露 grants、trust、handler、index、Registry 或可变 `ScoreDocument`。
- Command-only Write: Registry 不产生第二写入路径；修改谱面仍走既有语义命令事务。
- Immutable Runtime: ready 后无 mutation API、`registryVersion` 或 Registry event；moduleId 不进入 history/replay/K1-3 events。

明确不放进 Core Kernel:

- 第三方插件安装。
- 插件市场。
- 第三方 TypeScript 插件运行时、编译产物执行、Lua 或 native 第三方插件运行时。
- 插件签名、审核和权限 UI。
- Tauri/Rust 原生权限系统。

### Kernel Error / Diagnostic / Report Protocol

正式合同见 `specs/SPEC-016-kernel-errors-diagnostics-reports.md` 与活动 Core `errors-reports.md`：

- Structured Error: 内部错误族只负责安全行为复用，公共边界统一为 closed、深冻结的 `KernelIssue` 数据。
- Diagnostic: K1-1 `Diagnostic` 保持原 code/path/details；K1-5 adapter 使用 closed location/source 投影，不新增 `KernelDiagnostic`。
- Shared Report Shell: 当前 Core 只公开 validation/migration 两种 `KernelReport`；import/export/recovery 专属类型由未来实际模块定义。
- I18n Message: 用户可见文本只通过 `messageKey` 解析。
- Privacy by Default: report 默认不包含用户谱面正文、访问令牌、本机隐私路径或第三方密钥。

明确不放进 Core Kernel:

- 诊断包打包、上传或隐私过滤实现。

### Desktop Shell Module

- 技术: Tauri 2 + Rust。
- 责任: 窗口、文件选择器、文件系统访问、应用配置、崩溃诊断、打包、未来自动更新。
- 禁止: 不在 Rust 壳层实现谱面业务规则，除非后续性能验证要求局部下沉且仍遵守内核契约。

### Workbench UI Module

- 技术: TypeScript + React + Vite。
- 责任: 编辑器界面、工具栏、快捷键、面板、菜单、i18n、用户操作编排。
- MVP: 键盘优先输入，采用谱面光标、时值键、数字品号输入、方向键移动弦/拍、技巧快捷键和命令面板。
- i18n: 首次启动跟随系统语言；中文系统使用 `zh-CN`，其它系统使用 `en-US`；保存的用户语言偏好优先于系统语言；测试可显式固定 locale。
- 禁止: React 组件不得直接持有可变谱面真相，不得绕过内核命令修改谱面。

### Layout Module

- 责任: 从内核快照生成页面、系统、小节、音符、技巧、文本和 hit area primitives。
- 约束: 布局 primitives 必须与 SVG DOM、VexFlow、React 状态和浏览器事件解耦。
- 坐标链路: 用户点击先产生 view coordinate，经布局 hit test 转为语义目标候选，例如 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或命令 payload，再由 UI 提交语义命令修改 `ScoreDocument`。
- 模块化策略: MVP 不单独拆 `Positioning Service`，先由 `Layout Module + Editor Session Service` 承担坐标解析；后续复杂度上升后抽出专门外部模块。
- 复用: SVG 视图、PDF/PNG 导出和未来 Canvas/WebGL 必须共享同一布局语义。

### Renderer Module

- MVP: 自研布局模型 + SVG 首发渲染目标。
- MVP 适配器: `VexFlowRendererAdapter`。
- 自定义 overlay: 用于 Core Loop 技巧、选区、播放光标、编辑命中辅助和 VexFlow 不直接满足的视觉细节。
- 禁止: VexFlow 对象不得进入内核、`.bgp`、命令系统、文件格式或 hit testing 唯一真相。

### Playback Module

- 责任: 从文档快照生成播放事件，驱动播放光标、节拍器和基础合成音。
- MVP: 开始、暂停、继续、停止、基础速度控制、节拍器。
- 禁止: 播放层只读快照，不修改谱面文档，不从 SVG/VexFlow/React 状态反推音乐语义。

### Persistence Module

- 责任: 读写 `.bgp` 单文件开放包，处理自动保存、崩溃恢复和保存失败保护。
- 包结构: `manifest.json`、`score.json`、`assets/`、`plugins/`、`preview/`。
- 边界: `.bgp` 包内语义、schema 和迁移入口由 Core Kernel 定义；Persistence 只负责真实 zip 读写、文件路径、原子保存、自动保存和恢复。
- 文件保护: 第一阶段不做文件密码锁、加密保存或 DRM，保持 `.bgp` 可解包、可审查、可迁移。
- 禁止: 文件读写不得绕过内核验证器和 schema version。

### Import / Export Modules

- 模块定位: 用户态服务模块，不属于 Core Kernel。它们读取内核 snapshot/selector，提交语义命令、导入结果或迁移结果，并输出标准 report。
- 第一阶段产品闭环打开: 原生 `.bgp` 和自动保存恢复文件，由 `Persistence Service` 负责物理 IO。
- 第一阶段产品闭环导出: PDF + PNG，由 `Export Service` 负责页面生成、字体和文件输出。
- 第二阶段: 只规划 Guitar Pro 导入，其它外部导入后置，Guitar Pro 导出长期后置。
- 约束: 导入/导出器的模块专属 report 由其未来任务定义；导入结果必须通过内核验证器。K1-5 不预建 import/export report alias，Core 不包含 PDF/PNG/Guitar Pro 的具体实现。

### Unified Module Registration / Future Extension Host

- K1-4: official module 的启动期静态 manifest、私有 compiled binding、frozen Registry 与 module gateway。
- 贡献点: 只含现有六个 commands 与六个 selectors；validators、format descriptors、templates 后置。
- 运行时: K1-4 只接受 manifest-bound `official + builtin/internal-module + system-trusted`。
- 身份模型: `origin`、`runtime`、`trustLevel` 和 capability 独立判断；`origin = official` 不天然拥有全部权限，third-party 授权另行规划。
- 启动来源: K1-4 模块只能来自静态 `KernelStartupModuleManifest` 与应用内 compiled binding。
- 协作模型: trusted Host 原子创建 Registry，内部模块只接收 capability gateway；未来 Extension Host 的第三方发现、授权、registration adapter 和 facade 必须单独设计。
- 生命周期: 第三方插件安装、移除、启用和禁用配置必须在应用启动前完成；应用进入 ready 状态后不得新增、卸载、启用、禁用或热插拔第三方插件，变更需要重启后生效。
- 启动顺序: Core Host 一次提交 `KernelStartupModuleManifest`，解析两个私有 compiled registration entry 并在隔离 candidate 中验证；全部成功后原子返回 frozen `KernelRegistry`，模块只接收 gateway。
- 读取: 插件只能通过 snapshot 或 selector 读取谱面。
- 写入: 插件只能提交已注册语义命令，进入事务、验证、undo/redo 和事件流。
- 事件: V1 内部模块遵守内核事件规则；未来第三方插件只能订阅由 Extension Host 按 capability 过滤后的事件。
- 报告: 插件导入、导出、验证和异常必须输出标准 report、diagnostic 或 `KernelError`。
- 权限: 注册权限与执行权限分离；能注册贡献点不等于能执行写命令或访问文件。
- 禁止: V1 不执行第三方 TypeScript 插件运行时、编译产物、Lua 或 native 插件代码；插件不得直接访问可变文档对象；启动清单不得引用外部路径、URL、脚本字符串或动态 import；应用运行中不得改变第三方插件集合。

## 第一条纵向切片

已确认切片: `4 小节标准 6 弦吉他 riff`。

覆盖范围:

- UI: 新建谱、谱面编辑视图、保存、打开、导出入口。
- 内核: 一个 `brilliant-score-1` 文档、4 个全谱小节、一个吉他 Part/Staff、每小节一个 Voice、4/4、固定 tempo、四分/八分/十六分、基础休止与单音；吉他使用书写到实际 `-7/-12` transposition，具体调弦与弦品位置后续放入 Part-owned GuitarExtension。
- 输入: 谱面光标、时值键、数字品号、方向键移动、技巧快捷键或命令面板、删除、undo/redo。
- 技巧: 不属于 Core K1-1。后续 Guitar Domain 先确定扩展 payload 与领域命令，再选择 slide、bend、vibrato 等 P0 样例验证保存、重开、撤销/重做和渲染/播放派生；不得沿用旧的 Core 测试技巧 registry 作为既定前提。
- 渲染: 六线谱可编辑，五线谱同步显示基础音高和节奏。
- 渲染适配: VexFlow 绘制基础五线谱/六线谱，自定义 SVG overlay 补齐编辑辅助和 Core Loop 技巧显示。
- 播放: 合成播放、开始/暂停/继续/停止、播放光标、节拍器、基础速度控制。
- 文件: 保存 `.bgp`，重开后无数据丢失。
- 导出: PDF 和 PNG 可读。
- 测试: schema 验证、命令回放、保存打开 round-trip、导出 smoke test。

## 关键风险

- 内核边界过薄，导致谱面语义散落到 React、VexFlow 或导出模块中。
- 为了毕业设计演示写死临时路径，导致毕业后无法长期维护。
- 第一版导入导出范围过大，拖慢 MVP 闭环。
- VexFlow 适配层泄漏到内核或 `.bgp`，破坏长期维护边界。
- PDF/PNG 导出受 Windows WebView2、字体和 DPI 影响，需要进入质量门禁。
- 插件系统过早开放第三方安装，引入安全和兼容风险。

## 长期维护原则

- 长期维护是项目原则，必须从始至终一直执行。
- 毕业设计版本是长期产品的第一个可维护版本，不是一次性 demo。
- `.bgp` 文件、schema version、迁移器和 fixture 谱库必须从第一阶段进入设计。
- `.bgp` 第一阶段保持开放包结构，不得为了短期商业保护引入加密、密码锁或 DRM。
- `Guitar Core Loop` 必须成为长期回归测试脚本，后续版本不得破坏新建、编辑、播放、保存、重开和 PDF/PNG 导出闭环。
- 重要架构决策必须写入设计文档或 ADR，不能只存在于代码。
- 任何破坏兼容性的变更都必须有迁移策略、发布说明和测试证据。
- 任何功能不得以“只是 MVP”或“只是毕设”为理由绕过内核、命令系统、schema、迁移或回归测试。

## 已确认设计决策与非阻塞项

- Core Kernel 路线图仍使用 9 类机制分类，但必须按 K1-1 至 K1-6 分块评审，不能一次性交付或把后续机制倒灌进 K1-1。
- 音乐时间模型属于谱面核心对象模型，不新增第十类机制；Core 持久化 Fraction/NoteValue，tick/PPQ、真实播放时钟和播放光标由外部 adapter 派生。
- 快照、selector、事件订阅与模块通信遵守 `SPEC-014` 和 `.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`，旧详细模型已归档。
- 外部可变 `ScoreDocument` 副本方案已拒绝；这类方案与微内核设计相悖。外部模块只能生成非谱面事实的派生模型，最终写入仍走内核受控入口。
- Registry/capability 已通过 `SPEC-015` 与独立 K1-4 任务实现为 command/selector-only startup Registry，并在 `94766a0` 验收归档。
- K1-1 diagnostics 已确认；K1-5 已通过 `SPEC-016` 增加 additive Issue adapters、validation/migration reports 与 current-schema migration，并于 2026-07-21 通过独立验收。
- 注册表 handler 运行时注销/卸载、第三方插件热插拔、运行中启用/禁用和运行中卸载已明确不作为稳定性目标；未来第三方插件配置变更必须启动前完成并通过重启生效。官方随应用发布的内置模块会有多个，UI 模块只是其中一类，具体模块清单、数量和拆分方式后续再确定；官方和第三方的权限模型不再按来源二分，最终都收敛到同一套注册协议，这些生命周期治理能力不作为当前内核总规划和 Kernel V1 实现阻塞项。
- 外部工程目录结构、monorepo 方案、`apps/desktop` 和 `packages/*` 拆分不属于当前 Core Kernel 规划阶段；这些只在后续工程脚手架阶段根据已确认内核边界和模块协作方式重新评估，不作为当前内核规划阻塞项。
- 当前设计文档无新增设计问题；K1-6 审计修复测试候选 `355512aba4a8057d2d75aa665d74df49cdd2e23c` 等待独立验收，验收前不得关闭 Pure Core Kernel V1 或解锁后续实现。
