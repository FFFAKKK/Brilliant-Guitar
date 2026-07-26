# REQ-007 扩展系统、插件 API 与安全边界

## 决策状态

- 状态: 已确认方向
- 合并目标: 最终 PRD 的扩展性要求
- 当前 Core 状态: K1-1～K1-5 已验收归档；K1-6 审计修复测试候选 `355512aba4a8057d2d75aa665d74df49cdd2e23c` 已完成并通过 8/8 聚焦、169/169 完整测试，等待独立验收；扩展系统实现仍未授权。
- 当前结论: 模块化和插件系统可行；产品架构采用微内核式 Core Kernel + 用户态服务模块。长期插件体验向 VS Code 看齐，但底层所有模块统一通过 registry、capability、snapshot、semantic command、event 和 report 与内核协作。
- 用户决策: 官方模块和第三方模块使用同一套注册流程；来源与权限解耦，未来第三方模块可以在启动前被授予高权限并替换官方 UI、渲染、导入导出等模块。未来公开第三方插件统一采用 TypeScript；插件发布包可包含编译后的 JavaScript 产物，但源码、SDK、类型契约、示例和兼容测试以 TypeScript 为准。Lua 和 native 不作为公开插件语言；native 只允许作为官方/内置系统能力或未来单独评审的外部进程能力；MVP 不执行任意第三方 TypeScript 插件运行时、编译产物、Lua 或 native 代码。

## 用户价值

用户明确希望产品比 Guitar Pro 8 更具扩展性。扩展性不能只是“以后能加功能”，而要在文件格式、命令系统、导入导出、自动化和 UI 入口上有明确边界。

## 规划审核视角

### 产品视角

模块化插件要解决的是“用户和开发者能按自己的工作流扩展软件，但核心谱面和文件资产不被破坏”。长期体验应接近 VS Code: 插件安装和管理简单，manifest 声明 contribution，公开插件 API 统一以 TypeScript 为准，权限声明清晰，能贡献命令、菜单、快捷键、面板、导入导出器、验证器、渲染器和教学工具。第一阶段不做复杂插件商店或运行时热插拔能力，只先把统一注册协议和内核能力边界打稳。

必要场景:

- 内部模块像插件一样接入，用来验证架构边界。
- 用户未来能安装只读分析、批量变换、导入导出或教学模板插件。
- 插件出错时，主程序仍能打开、保存和编辑核心谱面。
- 缺失插件时，`.bgp` 中的插件私有数据能保留。

### 业务逻辑视角

K1-4 official module 与未来第三方插件分阶段协作。当前批准流程是:

1. trusted Host 声明完整静态 manifest 与 compiled bindings。
2. 严格生成并校验 `KernelModuleIdentity`、API version 和 capability。
3. candidate 绑定现有六个 command 与六个 selector adapter。
4. 全部成功后原子返回 frozen Registry。
5. 内部模块通过 capability-scoped gateway 调用既有 Core API。

第三方发现、校验、授权、registration adapter 和 facade 属于未来 Extension Host；不能把 K1-4 当成任意插件注册入口。

插件与内核协作必须围绕五条受控通道:

1. 注册通道: K1-4 只有 trusted Host startup factory；未来插件注册通道另行批准。
2. 读取通道: 插件通过 snapshot 或 selector 读取谱面，不持有可变 `ScoreDocument`。
3. 写入通道: 插件通过已注册语义命令提交修改，进入事务、验证、undo/redo 和事件流。
4. 事件通道: V1 内部模块按内核事件规则订阅；未来第三方插件通过后续插件平台过滤后的事件订阅，不能直接订阅裸 `KernelEventBus`。
5. 报告通道: 已验收 K1-5 只提供 `Diagnostic`、`KernelIssue` 和 validation/migration `KernelReport` 基础；未来插件 importer/exporter 的专属 report 与 ingress 必须由对应真实模块和 Extension Host 独立批准。

业务规则:

- 模块来源 `origin` 只说明 official 或 third-party，不决定权限高低。
- 模块能力由 trusted Host capability grant 决定；official 不天然绕过规则，third-party 授权模型另行规划。
- 未来插件必须声明 manifest、apiVersion、runtime、permissions 和 contributes；K1-4 不读取真实第三方插件 manifest，也不实现通用 registration handler。
- 插件只能获得被授予的 capability。
- 插件异常必须被隔离；未来第三方插件的禁用只能写入下次启动配置，当前运行期不得卸载 handler、改变已注册贡献点集合或热插拔插件。
- K1-4 ready Registry 没有生命周期 mutation API；第三方 `restart-required` 等结果由未来 Extension Host 定义。
- 插件私有数据必须按插件 ID 命名空间隔离。

### 技术实现视角

插件与内核采用分阶段模型。K1-4 只允许 trusted Host 原子创建 official command/selector Registry 并为内部模块发放 gateway；未来第三方 contribution、发现、授权和 Core 映射必须由 Extension Host 独立批准。

协作边界:

- `KernelStartupModuleManifest` 是 K1-4 唯一启动期模块来源，只引用 `core.commands.v1` 与 `core.selectors.v1` 私有 compiled binding。
- K1-4 只绑定现有六个 command 与六个 selector adapter，并通过 `KernelModuleGateway` 授权调用。
- 未来第三方插件平台可以研究把已安装、已校验、已授权的模块映射到受控 facade；新增 contribution kind 或 registration adapter 必须独立批准。
- `Extension Host`、第三方 manifest 读取、插件上下文创建、事件过滤代理和第三方异常隔离属于未来插件平台，不进入 Pure Core Kernel V1。
- `Core Kernel` 的 K1-4 已验收命令、读取、frozen Registry/gateway 和事件契约保持不变；已验收 K1-5 只增加 validation/migration issue/report 数据 API，不增加插件 report ingress。
- 插件 API 不暴露 React、VexFlow、SVG DOM、Web Audio、Tauri 文件对象或可变文档。
- K1-4 内部模块可以同进程运行，但不能直接注册 handler；它只能使用 Host 创建的 capability-scoped gateway。
- `origin`、`runtime`、`trustLevel` 和 capability 独立建模；来源、运行时类型和可信级别都不自动获得权限，也不绕过 registry 校验。
- `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不能引用外部路径、URL、脚本字符串或动态 import。

可测试性:

- 启动期模块清单校验测试。
- capability denied 测试。
- Host 原子 startup 与内部模块 gateway 测试。
- 插件通过 selector 读取测试。
- 插件命令进入 undo/redo 测试。
- 插件异常隔离测试。
- 缺失插件私有数据保留测试。

### 反过度设计视角

MVP 不需要完整第三方插件平台，也不应该让可信内核模块为了“像插件”而承担完整代理成本。当前阶段只需要把内部模块按同一套 contribution 契约接入，验证“读走 snapshot、写走 command、贡献点走 registry、错误走 report”这条链路。

当前阶段避免:

- 第三方 TypeScript 插件运行时或其编译产物任意代码执行。
- 插件安装器和插件市场。
- 热插拔插件。
- 多进程插件沙箱。
- 权限 UI。
- 远程插件仓库。
- UI 面板插件。
- native 动态库插件。
- 真实 `Extension Host`、真实 `PluginKernelFacade` 和第三方插件 manifest 读取。
- 内部模块热路径强制走未来插件平台代理。

## 扩展目标

- 让高级用户自动化重复编辑。
- 让开发者增加导入导出格式。
- 让教师和内容创作者生成定制练习材料。
- 让产品未来支持第三方插件或内部插件。
- 让 AI 功能以插件方式进入，而不是污染核心文档模型。

## MVP 扩展边界

推荐 MVP:

- 内置命令系统。
- 命令面板。
- 模块化核心内核。
- 当前 Core 公开 `Diagnostic`、`KernelIssue` 和 validation/migration `KernelReport`；未来真实 importer/exporter 可在独立合同中定义专属 report，不属于当前 K1-5 API。
- 内部插件注册表。
- 可注册的导入器和导出器接口。
- 可注册的文档验证器。
- 可注册的模板生成器。
- 可注册的菜单/命令入口。
- 启动期模块清单和模块身份。
- 插件 API 版本号。
- Pure Core Kernel V1 不定义插件私有数据命名空间或模块私有数据持久化位置；未来扩展数据存储在对应模块规划阶段单独设计。

MVP 可暂不开放:

- 第三方 TypeScript 插件安装、运行时或其编译产物任意代码执行。
- 真实第三方 `PluginManifest` 读取和校验。
- 真实 `Extension Host` 或 `PluginKernelFacade`。
- 插件市场。
- 付费插件或商业插件市场。
- 原生动态库插件。

## 插件语言策略

- REQ-007-L01: 未来公开第三方产品层谱面插件统一采用 TypeScript 源码、SDK、类型契约、示例和兼容测试。
- REQ-007-L02: MVP 只支持内部模块插件，运行时标记为 `internal-module`。
- REQ-007-L03: TypeScript 第三方插件开放前，必须先完成权限声明、沙箱隔离、API version、异常隔离、启动前禁用配置机制和兼容测试；发布包可包含编译后的 JavaScript 产物，但必须通过 TypeScript 类型契约和 manifest 校验。
- REQ-007-L04: Lua 不作为公开插件语言；除非未来作为单独外部工具协议重新评审，否则不进入公开插件 API。
- REQ-007-L05: Native 动态库不作为公开谱面插件机制；只能作为官方/内置系统能力或未来单独评审的外部进程能力。

## 插件能力分级

- Level 0: 配置扩展，例如快捷键、主题、模板。
- Level 1: 只读分析插件，例如查找超出演奏范围的音符。
- Level 2: 文档变换插件，例如批量移调、生成练习变奏。
- Level 3: 导入导出插件。
- Level 4: UI 面板插件。
- Level 5: 音频和播放插件。

MVP 推荐做到 Level 0 到 Level 2 的内部实现边界，第三方开放后置。

## 模块化架构要求

- REQ-007-F01: Core Kernel 必须独立于 UI、渲染、播放、导入导出、文件系统、桌面壳和插件运行时。
- REQ-007-F02: 所有编辑动作必须通过命令系统进入文档事务。
- REQ-007-F03: 导入器、导出器、验证器、模板生成器如何注册属于未来 Extension Host/领域任务；K1-4 Registry 不支持这些 kind。
- REQ-007-F04: 插件私有数据必须按插件 ID 命名空间隔离。
- REQ-007-F05: 插件在下次启动被禁用或缺失时，核心谱面必须仍能打开、显示、播放和保存；运行中禁用请求不得改变当前进程已注册的 handler 集合。
- REQ-007-F06: Tauri/Rust 原生能力第一阶段只用于核心团队维护的系统能力；未来是否开放 native 第三方模块必须单独评审。
- REQ-007-F07: 插件和内部模块读取谱面必须通过内核快照或 selector，不能持有可变文档对象。
- REQ-007-F08: 插件和内部模块写入谱面必须通过内核命令事务，不能绕过 undo/redo、验证器和事件流。
- REQ-007-F09: 插件和内部模块写入谱面只能提交已注册语义命令，不能提交任意 patch、JSON path、字段替换、数组 splice 或脚本式写入。
- REQ-007-F10: K1-4 official module 通过 manifest/frozen Registry/gateway 协作；未来第三方是否复用该协议必须独立评审。
- REQ-007-F11: K1-4 内部模块只能通过 Host 创建的 gateway 使用既有 command/selector/read/event adapter，不获得公开 registration 或 handler。
- REQ-007-F12: K1-4 七个 capability 互不蕴含；未来验证器、导入器、导出器与文件权限另行定义。
- REQ-007-F13: `origin`、`runtime`、`trustLevel` 和 capability 必须独立建模；official 不天然拥有全部权限，third-party 未来也可以经启动前授权获得高权限。
- REQ-007-F14: 插件 manifest 不得自我声明或提升 trustLevel/capability；trustLevel 和 capability 只能由启动前授权、打包清单、开发者模式或未来插件平台分配。
- REQ-007-F15: Pure Core Kernel V1 的模块必须出现在静态 `KernelStartupModuleManifest` 中；未来第三方模块也必须在启动前完成授权和注册准备，运行中不得加入。
- REQ-007-F16: V1 的 `KernelStartupModuleManifest` 不得引用外部文件路径、URL、脚本字符串或动态 import 作为可信模块注册入口；未来第三方安装源和签名策略后置单独设计。

## 安全与稳定要求

- 插件必须声明权限。
- 插件不能默认访问任意文件系统。
- 插件异常不能导致主程序崩溃或文档损坏。
- 插件修改文档必须走事务和 undo/redo。
- 插件修改文档必须走语义命令，不能获得底层 patch 写入能力。
- 插件私有数据必须可忽略。
- 插件 API 破坏性变更必须通过版本号和迁移策略处理。

## 行为契约

- `KernelStartupModuleManifest` 是 Pure Core Kernel V1 的唯一模块来源。
- 未来 `PluginManifest` 至少包含 id、name、version、apiVersion、runtime、permissions、entrypoints 和 contributes，但不进入 Pure Core Kernel V1 实现。
- 未来 `PluginManifest` 必须声明 `contributes`，说明插件贡献命令、验证器、导入器、导出器、模板或面板。
- V1 模块 runtime 只能是 `builtin` 或 `internal-module`。
- 插件命令必须可被命令面板发现。
- 插件修改文档前必须拿到可撤销事务。
- 未来插件导入器必须返回经独立批准、复用 `KernelIssue`/`KernelReport` 基础的 import report；当前没有公共 `ImportReport`。
- 未来插件导出器必须返回经独立批准、复用 `KernelIssue`/`KernelReport` 基础的 export report；当前没有公共 `ExportReport`。
- 插件异常必须被隔离，不能导致主程序崩溃。

## MVP 不做

- 不做无沙箱的任意 JavaScript/Native 插件运行。
- 不做插件商店。
- 不承诺跨版本插件永远兼容。
- 不做真实第三方 `Extension Host`、`PluginKernelFacade` 或插件管理 UI。

## 验收标准

- [ ] AC-007-01: 产品内部功能也尽量通过命令系统注册，命令面板能发现。
- [ ] AC-007-02: 一个内部“批量给选区降半音”的命令能通过统一命令 API 执行并撤销。
- [ ] AC-007-03: 一个内部导出器能通过注册接口被导出菜单发现。
- [ ] AC-007-04: 打开含未知插件私有数据的文件时，主程序能保留该数据并正常编辑核心谱面。

## 开放问题

- 无。长期插件体验向 VS Code 看齐；官方和第三方模块最终使用同一注册流程，来源与权限解耦。Pure Core Kernel V1 只实现统一注册协议、内置模块静态注册和 capability 检查，不实现真实第三方插件平台。
