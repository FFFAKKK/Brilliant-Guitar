# Guitar Core Loop 技术设计

## 状态

- 阶段: Phase 1 planning
- 目标: 为第一条可运行 MVP 闭环提供需求反推的技术设计骨架。
- 已确认技术栈: Tauri 2 + TypeScript + React + Vite。
- 首发平台: Windows 桌面。
- 架构原则: 参照操作系统微内核思想的 Core Kernel + 用户态服务模块。目录结构尚未确认。

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

- 谱面文档模型: `ScoreDocument`、track、measure、beat、note/rest、technique、tuning、metadata。
- MVP 验证: 4/4、固定 tempo、单 track、单 voice、四分/八分/十六分、基础休止、每 beat 单音。
- 软分析边界: 第一阶段不做软一致性、可演奏性分析、指法建议、教学提示、风格检查或难度评分；这些能力不阻塞 MVP。
- 命令事务: 新建谱、设置元数据、添加小节、输入音符、设置弦号/品号、设置技巧、删除、undo/redo。对外只暴露语义命令；patch/delta 只作为内核内部事务和历史实现细节。MVP 采用细粒度历史模型，每个成功可撤销语义命令默认生成一个 `HistoryEntry`，不做复杂智能合并。
- 文档地址和范围: `ScoreAddress`、`ScorePoint`、`ScoreRange` 和命令目标校验。当前 UI 光标、选区高亮、鼠标拖选和临时 `ScoreCoordinate` 属于 `Editor Session Service` 或 `Layout Module`，不属于微内核。
- 文件契约: `.bgp` schema、manifest、score JSON、schema version、迁移入口。
- 快照和查询: `DocumentSnapshot`、`KernelReadApi`、受控 selector、可序列化 snapshot。
- 事件和注册表: 提交后 `KernelEventBus`、`KernelRegistry`、内部命令、selector、hard validator、technique definition、migration、导入器/导出器 descriptor、模板 descriptor 和未来插件贡献点。
- 能力边界: `KernelCapability`、module identity、API version 和 capability 检查。
- 错误、诊断和报告: `KernelError`、`KernelDiagnostic`、`KernelReport`、`ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和 report issue 基础类型。

第一阶段 Core Kernel 先按 9 类机制完成整体规划:

1. 谱面核心对象模型。
2. 命令系统调用边界。
3. 事务、历史和一致性边界。
4. 文档地址和范围模型。
5. 硬一致性验证。
6. `.bgp` 语义契约和迁移入口。
7. 快照、事件和模块通信协议。
8. 注册表与能力边界。
9. 错误、diagnostic 和 report 契约。

注册表 handler 注销、运行时卸载、热插拔、插件禁用和权限 UI 属于生命周期治理细节，后置到 Core Kernel 总边界确认后再讨论。

内核禁止:

- 依赖 React、Tauri、VexFlow、SVG DOM、Web Audio、PDF/PNG 库或具体文件选择器。
- 保存 VexFlow 对象、DOM 节点、组件状态或播放引擎状态。
- 把 UI 坐标、SVG 坐标、VexFlow 坐标、PDF/PNG 页面坐标或播放光标状态写入 `.bgp` 当作谱面语义。
- 解析屏幕坐标、布局坐标、SVG/VexFlow 坐标、鼠标拖选、缩放滚动或 hit testing。
- 让任何模块绕过命令事务修改文档。
- 暴露任意 patch、JSON path、字段替换或脚本式写入命令。
- 在事件 payload 中暴露可变 `ScoreDocument`、内部 delta、React 组件、SVG/VexFlow 对象、Web Audio 节点或 Tauri 文件对象。
- 把 UI 光标、选区高亮、鼠标拖拽或播放光标 tick 当作 Core Kernel 事件。

### Kernel Snapshot / Event Protocol

推荐设计见 `specs/SPEC-014-kernel-snapshot-events.md`。第一阶段建议采用:

- Snapshot / Selector: 外部模块只读 `DocumentSnapshot` 或 selector 结果；每次读取都带 `documentVersion`。
- Post-Commit Event: 内核只发布已经 commit 的事实事件，例如文档加载、文档变化、命令执行、历史状态、诊断、脏状态、注册表和迁移完成。
- Command-only write: event 和 snapshot 都不是写入口，任何修改仍然必须回到语义命令。
- Cache invalidation: 渲染、播放、导出和自动保存根据 `documentVersion`、selector 结果版本和事件类型失效缓存。
- Error isolation: 事件处理器异常不得回滚已提交事务；内核记录 diagnostic 或模块错误报告。
- No reentrancy: 事件分发期间不得直接重入提交命令，需要后续写入时由外部调度队列在事件分发结束后提交。
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

推荐设计见 `specs/SPEC-015-kernel-registry-capability.md`。第一阶段建议采用:

- Kernel Registry: 只登记稳定贡献点 descriptor，不负责第三方插件发现、安装、沙箱或 UI 生命周期。
- Static Internal Capability: MVP 对 `builtin` 和 `internal-module` 做静态 capability 检查，为未来 Extension Host 代理第三方插件预留边界。
- Summary-only Registry: 外部模块只能读取只读 registry summary，不能拿到 handler、React 组件、VexFlow 对象或可变 `ScoreDocument`。
- Command-only Write: 注册表不是写入通道；修改谱面仍走语义命令、导入结果或迁移结果。

明确不放进 Core Kernel:

- 第三方插件安装。
- 插件市场。
- JS/TS、Lua 或 native 第三方插件运行时。
- 插件签名、审核和权限 UI。
- Tauri/Rust 原生权限系统。

### Kernel Error / Diagnostic / Report Protocol

推荐设计见 `specs/SPEC-016-kernel-errors-diagnostics-reports.md`。第一阶段建议采用:

- Structured Error: 命令、注册、权限、schema、迁移、导入导出和模块异常统一转成 `KernelError`。
- Diagnostic: 文档验证、unsupported、模块异常和事件处理器失败使用可定位 `KernelDiagnostic`。
- Shared Report Shell: `ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和恢复报告复用 `KernelReport` 与 `KernelReportIssue`。
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

- MVP 打开: 原生 `.bgp` 和自动保存恢复文件。
- MVP 导出: PDF + PNG。
- 第二阶段: 只规划 Guitar Pro 导入，其它外部导入后置，Guitar Pro 导出长期后置。
- 约束: 导入器必须输出 `ImportReport`；导出器必须输出 `ExportReport`；导入结果必须通过内核验证器。

### Extension Host Module

- MVP: 内部插件注册表和内部扩展点。
- 贡献点: commands、validators、importers、exporters、templates。
- 运行时: MVP 只接受 `internal-module`。
- 信任模型: MVP 只采用两级，随应用发布的 `builtin/internal-module` 为 `trusted-core`，未来第三方插件为 `external-plugin`。
- 可信来源: `trusted-core` 只能来自静态 `KernelStartupModuleManifest`，清单随应用源码或打包产物发布。
- 协作模型: `trusted-core` 模块通过启动期 `CoreModuleRegistration` 直接注册贡献点和 handler；`external-plugin` 模块必须通过 `Extension Host` 获得受控 `PluginKernelFacade`。
- 身份边界: `runtime`、`trustLevel` 和 capability 独立判断；运行时类型不自动获得权限，可信级别也不绕过 registry 校验。
- 启动顺序: Core Kernel 先校验 `KernelStartupModuleManifest`，再解析已编译绑定的 `CoreModuleRegistrationEntryId`，最后调用 `KernelRegistry` 注册贡献点。
- 读取: 插件只能通过 snapshot 或 selector 读取谱面。
- 写入: 插件只能提交已注册语义命令，进入事务、验证、undo/redo 和事件流。
- 事件: 未来第三方插件只能订阅由 `Extension Host` 过滤后的事件。
- 报告: 插件导入、导出、验证和异常必须输出标准 report、diagnostic 或 `KernelError`。
- 权限: 注册权限与执行权限分离；能注册贡献点不等于能执行写命令或访问文件。
- 禁止: 不执行第三方 JS/TS、Lua 或 native 插件代码；插件不得直接访问可变文档对象；启动清单不得引用外部路径、URL、脚本字符串或动态 import。

## 第一条纵向切片

已确认切片: `4 小节标准 6 弦吉他 riff`。

覆盖范围:

- UI: 新建谱、谱面编辑视图、保存、打开、导出入口。
- 内核: 一个标准 6 弦调弦轨道、4 小节、4/4、固定 tempo、单 voice、四分/八分/十六分、基础休止和单音输入。
- 输入: 谱面光标、时值键、数字品号、方向键移动、技巧快捷键或命令面板、删除、undo/redo。
- 技巧: 3 个 Core Loop 技巧，`slide`、`bend`、`vibrato`；`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强。
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

## 待确认设计问题

- 第一阶段 Core Kernel 的最小边界是否采用本文推荐的 9 类机制。
- Core Kernel 的快照、selector、事件总线和模块通信协议已确认采用 `SPEC-014` 模型。
- 外部可变 `ScoreDocument` 副本方案已拒绝；这类方案与微内核设计相悖。外部模块只能生成非谱面事实的派生模型，最终写入仍走内核受控入口。
- Core Kernel 的注册表与 capability 已确认作为独立内核功能，继续按 `SPEC-015` 细化。
- Core Kernel 的错误、diagnostic 和 report 已确认作为独立内核功能，继续按 `SPEC-016` 细化。
- 注册表 handler 注销/卸载、插件热插拔和可信模块禁用暂时后置，不作为当前内核总规划阻塞项。
- 项目目录结构暂不确认，待内核边界、模块拆分和构建边界确认后再决定。
