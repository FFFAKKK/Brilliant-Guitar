# Guitar Core Loop 实现计划

## 状态

- 阶段: Phase 1 planning
- 前置条件: PRD、需求文档、技术设计经用户确认后，才能进入 `task.py start` 和代码实现。
- 实现策略: 先做一条纵向 MVP 闭环，再扩展功能面。

## 实现顺序

### 0. 规划收敛

- [ ] PRD 收敛，移除已解决开放问题。
- [x] 确认后续每个功能规划都包含产品视角、业务逻辑视角、技术实现视角和反过度设计视角。
- [x] 确认第一条纵向切片复杂度: 4 小节标准 6 弦吉他 riff。
- [x] 确认长期维护为项目原则，必须从始至终执行。
- [x] 确认 MVP 渲染目标: 自研布局模型 + SVG 首发渲染目标。
- [x] 确认 VexFlow 作为 MVP SVG 渲染适配器。
- [x] 确认未来第三方插件优先语言: JavaScript/TypeScript；MVP 不开放第三方代码执行。
- [x] 确认软件架构原则: 微内核式 Core Kernel + 用户态服务模块。
- [x] 确认命令系统边界: 对外只暴露语义命令，内部 patch/delta 只作为事务、undo/redo 和回放实现细节。
- [x] 确认 undo/redo 粒度: MVP 采用细粒度历史模型，每个成功可撤销语义命令默认一个 `HistoryEntry`，不做复杂智能合并。
- [x] 确认谱面数据根本原则: 所有操作服务 `ScoreDocument`，布局坐标、屏幕坐标、导出页面坐标和播放光标都从谱面快照派生。
- [x] 确认 Core Kernel 快照、selector、事件总线和模块通信协议采用 `SPEC-014` 模型。
- [x] 确认外部可变 `ScoreDocument` 副本方案已拒绝。
- [x] 确认 Core Kernel 注册表和 capability 作为独立内核功能，继续按 `SPEC-015` 细化。
- [x] 确认 Core Kernel 错误、diagnostic 和 report 作为独立内核功能，继续按 `SPEC-016` 细化。
- [x] 确认 Core Kernel V1 先落地 9 类机制；官方内置 UI 模块作为第一个可信模块/官方插件验证内核协作；第三方插件生命周期治理后置。
- [x] 确认第一阶段 Core Kernel 最小边界采用 9 类机制: 文档模型、命令边界、事务历史、地址范围、硬验证、文件语义、快照事件、注册能力、错误报告。
- [ ] 架构确认后再确认项目目录结构。
- [ ] 将稳定 spec 同步到 `.trellis/spec/`。
- [x] 将长期维护原则同步到 `.trellis/spec/guides/`。

### 1. 工程脚手架

- [ ] 创建 Tauri 2 + React + TypeScript + Vite 应用。
- [ ] 配置严格 TypeScript、ESLint、格式化、Vitest、Playwright。
- [ ] 按确认后的 Core Kernel 和模块边界建立目录；具体目录结构未确认前，不提前锁死为 `src/*` 或 workspace packages。
- [ ] 物理隔离 core-kernel、workbench-ui、desktop-shell、layout、renderer、playback、persistence、import-export、extension-api、fixtures/tests 等边界。
- [ ] 建立 Windows 本地运行和打包命令。

### 2. 领域模型与文件 schema

- [ ] 定义 `ScoreDocument`、`Track`、`Measure`、`Beat`、`NoteEvent`、`Technique`、`Tuning`、`Metadata`。
- [ ] 在内核中定义 `EntityId`、`ScoreAddress`、`ScorePoint`、`ScoreRange` 和 `CommandTarget`，明确它们服务 `ScoreDocument` 而不是替代谱面数据。
- [ ] 在编辑/布局模块中定义临时 `ScoreCoordinate`、`ViewCoordinate` 和 hit testing 解析链路，不把这些坐标类型暴露为内核写入 API。
- [ ] MVP 不单独创建 `Positioning Service` 包；在 `Layout Module + Editor Session Service` 中保持可抽取边界，并记录未来抽取条件。
- [ ] 定义整数 tick 时间模型，`ticksPerQuarter = 960`。
- [ ] 限制第一阶段验证器只接受 4/4、固定 tempo、单 track、单 voice、四分/八分/十六分和等长休止。
- [ ] 禁止第一阶段 UI 和命令系统暴露轨道添加、删除、重命名、排序、多轨列表或 track mute/solo。
- [ ] 禁止第一阶段 UI 和 schema 暴露歌词、自由文本框、和声分析、罗马数字或简谱视图。
- [ ] 验证器拒绝同一 beat 上多个 `NoteEvent`、和弦图或和弦名输入，并返回明确 unsupported。
- [ ] 定义 3 个 Core Loop 技巧类型: `slide`、`bend`、`vibrato`；预留 `hammer-on`、`pull-off`、`palm mute` 为 P0 后续增强。
- [ ] 定义 `.bgp` 包结构和 `manifest.json`、`score.json` schema。
- [ ] 定义 `MigrationReport`、schema version 兼容矩阵、迁移器注册入口和未知扩展数据保留规则。
- [ ] 明确 `.bgp` 第一阶段不加密、不做文件密码锁、不做 DRM，测试工具可解包检查核心语义。
- [ ] 建立最小 fixture 谱库。
- [ ] 实现文档验证器。
- [ ] 为 unsupported string count、time signature、tempo map、voice count、duration、非法弦号/品号建立验证器测试。
- [ ] 明确不实现软一致性、可演奏性分析、指法建议、教学提示、风格检查和难度评分；测试计划不得把它们作为 MVP 阻塞项。

### 3. 命令系统

- [ ] 实现语义命令接口、文档事务、undo/redo、命令回放。
- [ ] 实现内部 delta 机制，但不得把 patch/JSON path 写入暴露为公开命令。
- [ ] 实现细粒度历史模型: 每个成功可撤销语义命令生成一个独立 `HistoryEntry`。
- [ ] 确保 `undo` 和 `redo` 一次只移动一个历史条目；MVP 不做时间窗口合并、宏命令合并或跨命令智能压缩。
- [ ] 为每个命令定义稳定 command id、payload schema、capability、错误码和 i18n label key。
- [ ] 实现新建谱、设置元数据、添加小节、输入音符、设置弦号/品号、添加技巧。
- [ ] 实现 3 个 Core Loop 技巧的添加、删除、保存、重开和撤销/重做。
- [ ] 添加测试，证明 UI、内部模块和未来插件 API 不能提交任意 patch 类命令。
- [ ] 为每个命令建立单元测试和回放测试。
- [ ] 添加测试，证明连续执行 `insertNote -> setFret -> addTechnique` 后，三次 undo 会逐步撤销技巧、品号修改和插入音符。
- [ ] 添加测试，证明失败命令、unsupported 命令和验证失败命令不会增加 undo stack 条目。

### 4. 内核快照、事件和模块通信协议

- [ ] 定义 `KernelReadApi`、`DocumentSnapshot`、`SnapshotScope` 和 `SelectorResult`。
- [ ] 实现 MVP built-in selector: `selectDocumentMetadata`、`selectFullScore`、`selectSerializableScore`、`selectMeasureRange`、`selectEntityByAddress`、`selectDiagnostics`、`selectHistoryState`、`selectDirtyState`、`selectRegistrySummary`。
- [ ] 定义 `KernelEvent` envelope、`KernelEventType`、`KernelEventBus.subscribe` 和内部 `publish`。
- [ ] 在成功命令、undo、redo、文档加载、迁移、诊断变化、脏状态变化、历史状态变化和注册表变化后生成稳定事件。
- [ ] 确保 `TransactionResult.events` 与事件总线发布的事件使用同一组 `eventId`。
- [ ] 禁止失败命令、rollback 命令和 unsupported 命令发布 `kernel.document.changed`。
- [ ] 捕获事件处理器异常，并记录 `module-event-handler-failed` diagnostic 或模块错误报告；不得回滚已提交事务。
- [ ] 禁止事件分发期间重入提交命令，需要后续写入时由外部调度队列提交。
- [ ] 禁止事件 payload 携带可变 `ScoreDocument`、内部 delta operation、React 组件、SVG/VexFlow 对象、Web Audio 节点或 Tauri 文件对象。
- [ ] 明确 UI 光标、选区高亮、鼠标拖拽和播放光标 tick 属于外部服务事件，不进入 Core Kernel 事件。
- [ ] 允许模块创建布局 primitives、hit areas、播放事件、导出页面模型、缩略图、分析报告或导入中间模型，但这些派生数据不能是可变 `ScoreDocument` 副本。
- [ ] 禁止实现 `getMutableDocumentCopy`、`replaceDocumentFromExternalCopy`、`saveMutableWorkingCopy` 或外部整文档覆盖 API。
- [ ] 添加测试，证明外部模块无法通过公开 API 获取可变 `ScoreDocument` 副本。
- [ ] 建立 snapshot 只读测试、selector 纯读测试、事件顺序测试、事件异常隔离测试和缓存失效测试。

### 5. 内核注册表和 Capability

- [ ] 定义 `KernelRegistry`、`KernelContribution`、`ContributionKind`、`ContributionStatus` 和 `RegistrySummary`。
- [ ] 定义 `KernelModuleIdentity`、`KernelModuleTrustLevel`、`KernelModuleRuntime`、`KernelCapability` 和 `CapabilityCheckResult`。
- [ ] 定义 `KernelStartupModuleManifest`、`TrustedCoreModuleDeclaration` 和 `CoreModuleRegistrationEntryId`。
- [ ] 将 `runtime`、`trustLevel` 和 capability 独立判断；`runtime = "internal-module"` 不自动获得全部权限，`trustLevel = "trusted-core"` 不绕过 registry 校验。
- [ ] 为 command、selector、hard validator、technique definition、migration、importer/exporter descriptor 和 template descriptor 建立注册入口。
- [ ] 拒绝重复注册、未知 kind、unsupported runtime、api version 不兼容和 capability 不足。
- [ ] 注册表变化后递增 `registryVersion` 并发布 `kernel.registry.changed`。
- [ ] 确保 registry summary 不泄露 handler、React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。
- [ ] 建立重复注册、capability denied、api version incompatible 和 unsupported runtime 测试。

### 6. 内核错误、Diagnostic 和 Report

- [ ] 定义 `KernelError`、`KernelDiagnostic`、`KernelIssueTarget` 和 `KernelIssueSource`。
- [ ] 定义 `KernelReport`、`KernelReportIssue`、`KernelReportSummary`、`ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和 `RecoveryReport` 外壳。
- [ ] 为 command、schema、migration、import、export、registry、capability 和 module exception 建立稳定错误 code。
- [ ] 确保所有用户可见错误文本只通过 i18n key 渲染。
- [ ] 确保 hard validation diagnostic 能定位到 `ScoreAddress` 或 `ScoreRange`。
- [ ] 捕获模块异常并转换为 `module-error` diagnostic 或 report issue。
- [ ] 确保 report 默认不包含用户谱面正文、访问令牌或本机隐私路径。
- [ ] 建立 module exception、report 复用、diagnostic 定位和 report 隐私测试。

### 7. 编辑器 UI

- [ ] 实现主窗口、菜单、工具栏、谱面视图、属性面板。
- [ ] 实现新建标准 6 弦吉他谱。
- [ ] 实现单轨信息显示，且不提供轨道管理入口。
- [ ] 实现键盘优先的 4 小节 riff 输入路径。
- [ ] 实现谱面光标，至少定位到小节、beat、弦和音符槽位。
- [ ] 实现时值、弦号、品号、休止、移动、删除、撤销/重做、播放校对的基础快捷键。
- [ ] 实现时值键、数字品号输入和方向键弦间/拍间移动。
- [ ] 实现四分/八分/十六分和基础休止输入；附点、三连音、变拍号和多 voice 返回 unsupported。
- [ ] 实现 3 个 Core Loop 技巧的键盘输入入口或命令面板入口。
- [ ] 实现鼠标辅助定位和选择。
- [ ] 明确不把自由文本谱解析作为第一阶段主输入。
- [ ] 明确不把 MIDI 输入、MIDI 录入、MIDI 导入或虚拟指板点选输入纳入第一阶段阻塞项。
- [ ] 建立键盘-only 核心路径 Playwright 测试。

### 8. 谱面渲染

- [ ] 实现布局模型。
- [ ] 集成并锁定 VexFlow 依赖版本。
- [ ] 实现 `VexFlowRendererAdapter`。
- [ ] 实现自定义 SVG overlay，用于 Core Loop 技巧、选区、播放光标和编辑辅助。
- [ ] 实现 SVG 六线谱渲染和 hit testing。
- [ ] 实现基础五线谱派生显示。
- [ ] 实现 3 个 Core Loop 技巧的基础 SVG 显示。
- [ ] 验证修改六线谱品号后五线谱同步更新。
- [ ] 建立布局 primitives 与 SVG DOM 解耦测试。
- [ ] 建立 hit testing 坐标链路测试，证明 `ViewCoordinate -> LayoutPrimitive -> ScoreAddress/ScorePoint/ScoreRange 或 semantic payload -> semantic command -> ScoreDocument` 可回放且不绕过内核。
- [ ] 记录未来抽取 `Positioning Service` 的触发条件: 多页、多轨、多声部、复杂选区、多渲染后端或导出预览定位复杂度明显上升。
- [ ] 建立 VexFlow 渲染 smoke test 和版本锁定检查。

### 9. 播放校对

- [ ] 实现文档快照到播放事件的转换。
- [ ] 实现开始、暂停、继续和停止。
- [ ] 实现基础速度控制。
- [ ] 实现节拍器开关。
- [ ] 实现播放光标或当前 beat/note 高亮。
- [ ] 实现基础合成音色或占位吉他音色。
- [ ] 保证播放层不修改文档。
- [ ] 建立播放事件生成测试和播放层只读快照测试。

### 10. 保存、打开、自动保存

- [ ] 实现 `.bgp` 写入。
- [ ] 实现 `.bgp` 读取。
- [ ] 实现保存前和打开后的 schema 校验。
- [ ] 实现基础自动保存和恢复提示。
- [ ] 建立 round-trip 测试。

### 11. PDF/PNG 导出

- [ ] 实现导出服务接口。
- [ ] 实现 PDF 导出。
- [ ] 实现 PNG 导出。
- [ ] 建立 Windows 字体、DPI、页面尺寸和可读性 smoke test。

### 12. 扩展系统边界

- [ ] 实现内部插件注册表。
- [ ] 定义 `PluginManifest`、`PluginRuntime`、权限声明和贡献点类型。
- [ ] 定义 `CoreModuleRegistration`，用于可信 `builtin/internal-module` 启动期直接注册贡献点和 handler。
- [ ] 定义 `PluginKernelFacade`，用于未来第三方插件，包含 read、commands、registry、events 和 reports 五类受控接口。
- [ ] 实现两级信任模型: `trusted-core` 用于随应用发布的 `builtin/internal-module`，`external-plugin` 用于未来第三方插件。
- [ ] 实现静态 `KernelStartupModuleManifest`，作为 `trusted-core` 模块的唯一来源。
- [ ] 校验 `KernelStartupModuleManifest` 中的 runtime、apiVersion、capabilities 和 `registrationEntryId`。
- [ ] 拒绝清单中的外部路径、URL、脚本字符串、动态 import 或未知 `registrationEntryId`。
- [ ] 确保插件 manifest 不能声明或提升自身 trust level。
- [ ] MVP 只接受 `runtime = "internal-module"`。
- [ ] 拒绝第三方 JS/TS、Lua 或 native 插件 manifest，并返回明确 unsupported。
- [ ] 实现内部命令、验证器、导入器、导出器和模板注册接口。
- [ ] 确保内部模块直接注册时仍走 `KernelRegistry` 校验，不直接获取可变 `ScoreDocument`。
- [ ] 区分注册权限和执行权限，例如 `command:register` 不等于 `command:execute`。
- [ ] 确保插件修改文档必须通过命令事务和 undo/redo。
- [ ] 确保插件事件订阅通过 `Extension Host` 过滤，未来第三方插件不能直接订阅裸 `KernelEventBus`。
- [ ] 建立插件异常隔离测试，插件错误不能导致主程序崩溃或文档损坏。
- [ ] 建立未知插件私有数据 round-trip 测试。

### 13. 国际化

- [ ] 建立 `zh-CN` 和 `en-US` 字典。
- [ ] 所有用户可见文本使用 i18n key。
- [ ] 技巧名称支持中文显示名和英文术语。
- [ ] 实现 locale 解析顺序: 已保存用户偏好 -> 受支持系统语言 -> `en-US` fallback。
- [ ] 提供测试和截图验证可用的 locale override。

### 14. 质量门禁

- [ ] 类型检查通过。
- [ ] 单元测试通过。
- [ ] 命令回放测试通过。
- [ ] 文件 round-trip 测试通过。
- [ ] 导出 smoke test 通过。
- [ ] Playwright 核心路径测试通过。
- [ ] Windows 本地启动和基础打包验证通过。
- [ ] `Guitar Core Loop` 长期回归脚本通过。
- [ ] 文件兼容性 fixture 和迁移检查通过。

## 预计验证命令

具体命令以脚手架落地后的 `package.json` 为准，预计至少包含:

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run tauri build
```

## 风险边界和回滚点

- Core Kernel 边界: 谱面语义、命令事务、验证、schema、迁移、事件和注册表，变更必须配套 schema、fixture、undo/redo 和命令回放测试。
- Layout / Renderer 边界: 布局 primitives、VexFlow SVG 适配器、overlay、hit area 和导出复用，变更必须配套布局测试和截图验证。
- Persistence 边界: `.bgp` 读写、自动保存、崩溃恢复和迁移，变更必须配套 round-trip、损坏文件和兼容性测试。
- Playback 边界: 播放事件、节拍器、速度控制和播放光标，变更必须证明播放层只读快照且不修改文档。
- Desktop Shell 边界: 系统权限、文件选择、路径访问、打包和诊断，变更必须审查权限、路径和文件访问范围。

## 进入实现前检查

- [ ] 用户确认 PRD 当前版本。
- [x] 用户确认第一条纵向切片。
- [ ] 等待当前规划送审结果；审核意见返回前不进入实现、不运行 `task.py start`。
- [x] 用户确认第一阶段 Core Kernel 最小边界后，`design.md` 无阻塞开放问题。
- [x] 注册表 handler 注销/卸载、插件热插拔和可信模块禁用已记录为后置细节，不阻塞当前内核总规划。
- [ ] `implement.md` 的阶段顺序被接受。
- [ ] Trellis Phase 1 质量门禁通过。
