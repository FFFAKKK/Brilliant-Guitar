# REQ-007 扩展系统、插件 API 与安全边界

## 决策状态

- 状态: 已确认方向
- 合并目标: 最终 PRD 的扩展性要求
- 当前结论: 模块化和插件系统可行；产品架构采用微内核式 Core Kernel + 用户态服务模块。未来第三方产品层谱面插件优先采用 JavaScript/TypeScript；MVP 先实现内部扩展点，不开放任意第三方插件运行。
- 用户决策: Lua 和 native 插件后置，native 只在性能或系统能力确有需要时开放；MVP 不执行任意第三方 JS/TS、Lua 或 native 代码。

## 用户价值

用户明确希望产品比 Guitar Pro 8 更具扩展性。扩展性不能只是“以后能加功能”，而要在文件格式、命令系统、导入导出、自动化和 UI 入口上有明确边界。

## 规划审核视角

### 产品视角

模块化插件要解决的是“用户和开发者能按自己的工作流扩展软件，但核心谱面和文件资产不被破坏”。用户真正需要的是可发现的命令、可安装或内置的导入导出能力、可运行的批量编辑和可配置为下次启动禁用的问题插件，而不是第一阶段就拥有复杂插件商店或运行时热插拔能力。

必要场景:

- 内部模块像插件一样接入，用来验证架构边界。
- 用户未来能安装只读分析、批量变换、导入导出或教学模板插件。
- 插件出错时，主程序仍能打开、保存和编辑核心谱面。
- 缺失插件时，`.bgp` 中的插件私有数据能保留。

### 业务逻辑视角

插件与内核协作必须围绕五条受控通道:

1. 注册通道: 插件通过 `Extension Host` 把 contribution descriptor 注册到 `KernelRegistry`。
2. 读取通道: 插件通过 snapshot 或 selector 读取谱面，不持有可变 `ScoreDocument`。
3. 写入通道: 插件通过已注册语义命令提交修改，进入事务、验证、undo/redo 和事件流。
4. 事件通道: 插件通过 `Extension Host` 订阅过滤后的内核事件，不能直接订阅裸 `KernelEventBus`。
5. 报告通道: 插件导入、导出、迁移、验证和异常必须输出标准 report、diagnostic 或 `KernelError`。

业务规则:

- 插件必须声明 manifest、apiVersion、runtime、permissions 和 contributes。
- 插件只能获得被授予的最小 capability。
- 插件异常必须被隔离；未来第三方插件的禁用只能写入下次启动配置，当前运行期不得卸载 handler、改变已注册贡献点集合或热插拔插件。
- 应用进入 ready 状态后，第三方插件新增、移除、启用、禁用或热插拔请求必须返回 `restart-required` 或 `unsupported-at-runtime` 类稳定结果。
- 插件私有数据必须按插件 ID 命名空间隔离。

### 技术实现视角

插件与内核采用两级信任模型和双层协作模型: 可信内核内置模块走启动期轻量直接注册，未来第三方插件走 `Extension Host` 提供的受控 `PluginKernelFacade`。

协作边界:

- `CoreModuleRegistration` 用于 `trustLevel = "trusted-core"` 的 `builtin` 和可信 `internal-module`，在启动期把 contribution descriptor 和 handler 直接注册进 `KernelRegistry`，避免热路径经过完整插件代理。
- `trusted-core` 只能由静态 `KernelStartupModuleManifest` 声明；该清单随应用源码或打包产物发布，不接受插件或用户配置追加。
- `Extension Host` 负责第三方或非可信插件的 manifest 读取、runtime/API version/permissions 校验、插件上下文创建、registry 代理注册、事件过滤和异常捕获。
- `Core Kernel` 只暴露稳定的命令、读取、注册表、事件和 report 契约。
- 插件 API 不暴露 React、VexFlow、SVG DOM、Web Audio、Tauri 文件对象或可变文档。
- MVP 内部模块可以同进程直接注册 handler，但必须使用同一套 contribution descriptor、capability、语义命令、snapshot/selector 和 report 契约。
- `runtime`、`trustLevel` 和 capability 独立建模；运行时类型不自动获得权限，可信级别也不绕过 registry 校验。
- `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不能引用外部路径、URL、脚本字符串或动态 import。

可测试性:

- manifest 校验测试。
- capability denied 测试。
- 内部模块启动期直接注册测试。
- 插件通过 selector 读取测试。
- 插件命令进入 undo/redo 测试。
- 插件异常隔离测试。
- 缺失插件私有数据保留测试。

### 反过度设计视角

MVP 不需要完整第三方插件平台，也不应该让可信内核模块为了“像插件”而承担完整代理成本。当前阶段只需要把内部模块按同一套 contribution 契约接入，验证“读走 snapshot、写走 command、贡献点走 registry、错误走 report”这条链路。

当前阶段避免:

- 第三方 JS/TS 任意代码执行。
- 插件安装器和插件市场。
- 热插拔插件。
- 多进程插件沙箱。
- 权限 UI。
- 远程插件仓库。
- UI 面板插件。
- native 动态库插件。
- 内部模块热路径强制走 `Extension Host` 代理。

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
- 内核公开 API: 命令、只读快照、selector、事件、注册表、capability、diagnostic、ImportReport、ExportReport。
- 内部插件注册表。
- 可注册的导入器和导出器接口。
- 可注册的文档验证器。
- 可注册的模板生成器。
- 可注册的菜单/命令入口。
- 插件元数据 manifest。
- 插件 API 版本号。
- 插件私有数据命名空间。

MVP 可暂不开放:

- 第三方 JavaScript/TypeScript 插件安装或任意代码执行。
- 插件市场。
- 付费插件或商业插件市场。
- 原生动态库插件。

## 插件语言策略

- REQ-007-L01: 未来第三方产品层谱面插件优先采用 JavaScript/TypeScript 包和类型契约。
- REQ-007-L02: MVP 只支持内部模块插件，运行时标记为 `internal-module`。
- REQ-007-L03: JavaScript/TypeScript 第三方插件开放前，必须先完成权限声明、沙箱隔离、API version、异常隔离、启动前禁用配置机制和兼容测试。
- REQ-007-L04: Lua 不作为第一公开插件语言；除非后续证明轻量脚本能力比 TS 类型契约更重要，否则不进入公开插件 API。
- REQ-007-L05: Native 动态库不作为公开谱面插件机制；只能作为核心团队维护的系统能力或性能模块。

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
- REQ-007-F03: 导入器、导出器、验证器、模板生成器都必须通过注册表注册。
- REQ-007-F04: 插件私有数据必须按插件 ID 命名空间隔离。
- REQ-007-F05: 插件在下次启动被禁用或缺失时，核心谱面必须仍能打开、显示、播放和保存；运行中禁用请求不得改变当前进程已注册的 handler 集合。
- REQ-007-F06: Tauri/Rust 原生插件只用于核心团队维护的系统能力，不等同于开放给用户的谱面插件。
- REQ-007-F07: 插件和内部模块读取谱面必须通过内核快照或 selector，不能持有可变文档对象。
- REQ-007-F08: 插件和内部模块写入谱面必须通过内核命令事务，不能绕过 undo/redo、验证器和事件流。
- REQ-007-F09: 插件和内部模块写入谱面只能提交已注册语义命令，不能提交任意 patch、JSON path、字段替换、数组 splice 或脚本式写入。
- REQ-007-F10: 未来第三方插件不得直接调用 Core Kernel 可变接口，必须通过 `Extension Host` 提供的受控 facade 与内核协作。
- REQ-007-F11: MVP 内部模块可以使用启动期 `CoreModuleRegistration` 直接注册贡献点和 handler，但必须遵守同一套 contribution descriptor、capability、语义命令、snapshot/selector 和 report 契约。
- REQ-007-F12: 注册权限必须与执行权限分离；能注册命令、验证器、导入器或导出器，不等于能执行写命令、读取谱面或访问文件。
- REQ-007-F13: MVP 正式采用两级信任模型；随应用发布的 `builtin/internal-module` 为 `trusted-core`，未来第三方插件为 `external-plugin`。
- REQ-007-F14: 插件 manifest 不得声明或提升自身 trust level；trustLevel 只能由 Core Kernel 启动配置、打包清单或 Extension Host 分配。
- REQ-007-F15: `trusted-core` 模块必须出现在静态 `KernelStartupModuleManifest` 中；不在清单中的模块即使 runtime 为 `internal-module` 也不能获得可信核心身份。
- REQ-007-F16: `KernelStartupModuleManifest` 不得引用外部文件路径、URL、脚本字符串或动态 import 作为可信模块注册入口。

## 安全与稳定要求

- 插件必须声明权限。
- 插件不能默认访问任意文件系统。
- 插件异常不能导致主程序崩溃或文档损坏。
- 插件修改文档必须走事务和 undo/redo。
- 插件修改文档必须走语义命令，不能获得底层 patch 写入能力。
- 插件私有数据必须可忽略。
- 插件 API 破坏性变更必须通过版本号和迁移策略处理。

## 行为契约

- `PluginManifest` 至少包含 id、name、version、apiVersion、runtime、permissions、entrypoints。
- `PluginManifest` 必须声明 `contributes`，说明插件贡献命令、验证器、导入器、导出器、模板或面板。
- MVP 插件 manifest 的 `runtime` 只能是 `internal-module`。
- 插件命令必须可被命令面板发现。
- 插件修改文档前必须拿到可撤销事务。
- 插件导入器必须返回标准 `ImportReport`。
- 插件导出器必须返回标准 `ExportReport`。
- 插件异常必须被隔离，不能导致主程序崩溃。

## MVP 不做

- 不做无沙箱的任意 JavaScript/Native 插件运行。
- 不做插件商店。
- 不承诺跨版本插件永远兼容。

## 验收标准

- [ ] AC-007-01: 产品内部功能也尽量通过命令系统注册，命令面板能发现。
- [ ] AC-007-02: 一个内部“批量给选区降半音”的命令能通过统一命令 API 执行并撤销。
- [ ] AC-007-03: 一个内部导出器能通过注册接口被导出菜单发现。
- [ ] AC-007-04: 打开含未知插件私有数据的文件时，主程序能保留该数据并正常编辑核心谱面。

## 开放问题

- 无。未来第三方产品层谱面插件优先采用 JavaScript/TypeScript；MVP 只开放内部模块插件和 API 边界。
