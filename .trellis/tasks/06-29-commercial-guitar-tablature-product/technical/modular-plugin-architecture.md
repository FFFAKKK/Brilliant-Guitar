# 模块化与插件架构可行性

## 结论

可行，而且应该作为本项目的基础架构原则执行。用户已明确希望软件非常模块化、可维护、可扩展，并倾向仿照操作系统微内核结构设计一个核心内核，对外提供接口，外围功能以用户态服务模块形式与内核协作。

因此本项目的扩展路线不是“先写一堆功能，后面再补插件”，而是:

1. 先建立稳定的 `Core Kernel`。
2. 所有内置能力都按模块接入内核。
3. MVP 只开放内部模块和注册表。
4. 第三方插件运行时、沙箱、安装和市场全部后置。

## 模块化为什么适合本项目

- 打谱软件的核心资产是谱面语义，而不是某个 UI 页面或渲染库。
- 编辑行为可以统一建模为语义命令，天然适合撤销、回放、测试和插件调用。
- 渲染、播放、导入导出、练习、模板和分析都是边界清晰的外围能力。
- `.bgp` 文件需要长期兼容，必须由稳定内核控制 schema 和迁移。
- 未来 AI 转写、自动编曲、练习生成和教学模板都应该作为模块或插件进入，不能污染核心模型。

## 类操作系统结构

### Layer 1: Core Kernel

核心内核必须最稳定，负责:

- `domain`: 谱面文档模型、音乐事件、吉他语义、元数据。
- `commands`: 语义命令总线、事务、内部 delta、undo/redo、命令回放。
- `address-range`: 文档地址、范围和命令目标校验；当前 UI 光标和选区会话状态属于外部编辑会话服务。
- `validation`: 文档验证、unsupported 诊断、错误定位。
- `file-contract`: `.bgp` schema、manifest、迁移入口、插件私有数据命名空间。
- `snapshot-query`: 只读 `DocumentSnapshot`、受控 selector、可序列化 snapshot。
- `registry`: 命令、验证器、导入器、导出器、模板、selector 和内部模块贡献点。
- `events`: 文档加载、文档变更、命令执行、历史状态、诊断、脏状态、注册表和迁移完成事件。
- `capabilities`: 模块或插件的能力声明、权限和 API 版本。
- `errors-reports`: `KernelError`、`KernelDiagnostic`、`KernelReport`、`ImportReport`、`ExportReport` 和 `MigrationReport` 外壳。

强制要求:

- 不依赖 React、Tauri、浏览器 DOM、VexFlow、Web Audio 或具体文件系统实现。
- 所有核心行为都能用 fixture 测试。
- 所有写操作都必须通过语义命令事务。
- patch、JSON path、字段替换和数组操作只能作为内核内部 delta，不得成为插件或 UI 写入 API。
- 快照、selector 和事件协议必须遵守 `SPEC-014-kernel-snapshot-events.md`。
- 注册表和 capability 必须遵守 `SPEC-015-kernel-registry-capability.md`。
- 错误、diagnostic 和 report 必须遵守 `SPEC-016-kernel-errors-diagnostics-reports.md`。
- 内核 API 必须版本化，并进入兼容性测试。

### Layer 2: Internal Service Modules

MVP 和近期版本的功能都先作为内部模块接入:

- `layout`: 从快照生成布局 primitives。
- `renderer-svg`: SVG 视图和 `VexFlowRendererAdapter`。
- `playback`: 播放事件、节拍器、基础速度控制、播放光标。
- `persistence`: 本地 `.bgp` 读写、自动保存、崩溃恢复。
- `import-export`: PDF/PNG 导出，后续 Guitar Pro 导入。
- `analysis`: 谱面检查、可演奏性分析、错误定位。
- `templates`: 新建谱模板和练习模板。

强制要求:

- 依赖内核快照、语义命令接口或注册表。
- 不拥有谱面事实来源。
- 不能把 VexFlow、SVG、Web Audio 或外部格式对象写回内核。

### Layer 3: Workbench UI

面向用户的工作台:

- 谱面编辑区。
- 工具栏和菜单。
- 属性面板。
- 命令面板。
- 设置和快捷键。
- 未来插件面板。

强制要求:

- UI 只发语义命令，不直接改文档。
- UI 读取快照和诊断，不持有可变谱面真相。
- UI 扩展点必须受控，不能让插件任意改主界面布局。

### Layer 4: Extension Host

插件运行和管理层:

- 读取 plugin manifest。
- 校验 API version、runtime 和权限。
- 注册命令、验证器、导入器、导出器、模板和未来 UI 面板。
- 隔离插件异常。
- 记录插件修改来源。

MVP 只需要支持 `runtime = "internal-module"`。第三方 JS/TS、Lua、native 插件执行都必须后置。

## 插件与内核协作模型

核心结论: 采用两级信任模型和双层协作模型。可信内核内置模块通过启动期 `CoreModuleRegistration` 轻量直接注册；未来第三方插件通过 `Extension Host` 获得受控 `PluginKernelFacade`。两者共享 contribution descriptor、capability、语义命令、snapshot/selector 和 report 契约，但不强迫可信内核模块走完整插件代理。

两级信任模型:

- `trusted-core`: 随应用发布的 `builtin/internal-module`，由 Core Kernel 启动配置或打包清单确认，允许启动期直接注册。
- `external-plugin`: 未来第三方插件，由 Extension Host 加载和隔离，只能通过 facade 注册、读取、提交命令、订阅事件和报告错误。

`trustLevel`、`runtime` 和 capability 必须分开。`runtime` 描述模块如何加载或执行；`trustLevel` 描述它是否属于可信核心；capability 描述它具体能做什么。任何一级都不能单独绕过其他检查。

可信核心模块来源:

- `trusted-core` 只能来自静态 `KernelStartupModuleManifest`。
- 该清单随应用源码或打包产物发布，必须被版本控制、代码审查和测试覆盖。
- 清单只引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不引用外部文件路径、URL、脚本字符串或动态 import。
- 插件 manifest、用户配置和运行时模块不能把自己追加为可信核心模块。

### 产品视角

插件协作模型要让用户获得可扩展能力，而不是承担核心文件损坏风险。用户需要的是:

- 新导出器、验证器、模板、批量编辑命令可以被添加。
- 插件出错时主程序不崩溃，谱面不损坏。
- 禁用或缺失插件后，核心谱面仍然可打开、编辑、播放和保存。
- 未来插件能力能逐步开放，而不是 MVP 一次性承担完整插件平台复杂度。

### 业务逻辑视角

插件和内核协作流程分两层:

可信内核模块:

1. Core Kernel 启动 registry。
2. Core Kernel 读取静态 `KernelStartupModuleManifest`。
3. Core Kernel 校验清单 schema、runtime、apiVersion、capability 和 `registrationEntryId`。
4. Core Kernel 为清单中的 `builtin/internal-module` 分配 `trustLevel = "trusted-core"`。
5. `registrationEntryId` 解析到已编译绑定的 `CoreModuleRegistration` 工厂。
6. registry 校验 module identity、trustLevel、apiVersion、registration capability 和 contribution descriptor。
7. 成功后直接绑定 handler 引用，并冻结或进入 ready 状态。

未来第三方插件:

1. `Extension Host` 读取 `PluginManifest`。
2. `Extension Host` 校验 plugin id、apiVersion、runtime、permissions 和 contributes。
3. `Extension Host` 忽略或拒绝 manifest 中的自声明 trustLevel、`CoreModuleRegistrationEntryId` 或动态可信入口，并创建 `trustLevel = "external-plugin"` 的 `KernelModuleIdentity` 和 capability grant。
4. 插件贡献点通过 `KernelRegistry` 注册为 command、validator、importer、exporter、template 或后续 panel descriptor。
5. 插件读取谱面时调用 snapshot 或 selector。
6. 插件修改谱面时提交已注册语义命令。
7. 插件订阅事件时只接收 `Extension Host` 过滤后的事件。
8. 插件导入、导出、验证和异常统一生成 `ImportReport`、`ExportReport`、`KernelDiagnostic` 或 `KernelReportIssue`。

业务规则:

- 插件不得获取可变 `ScoreDocument`。
- 插件不得提交任意 patch。
- 插件不得直接订阅裸 `KernelEventBus`。
- 插件不得直接访问 `KernelRegistry` 可变接口；第三方插件注册必须由 `Extension Host` 代理。
- 所有插件写入都必须能归因到 plugin id，并进入 undo/redo。
- 注册权限和执行权限必须分离；例如 `command:register` 不等于 `command:execute`。

### 技术实现视角

建议的可信内核模块注册接口:

```ts
export interface CoreModuleRegistration {
  identity: KernelModuleIdentity
  capabilities: KernelCapability[]
  contributions: KernelContribution[]
  register(registry: KernelRegistry): RegistryResult[]
}
```

建议的第三方插件协作接口:

```ts
export interface PluginKernelFacade {
  readonly pluginId: string
  readonly apiVersion: KernelApiVersion
  read: PluginReadFacade
  commands: PluginCommandFacade
  registry: PluginRegistryFacade
  events: PluginEventFacade
  reports: PluginReportFacade
}

export interface PluginReadFacade {
  snapshot(scope?: SnapshotScope): DocumentSnapshot
  select<TArgs, TResult>(
    selectorId: SelectorId,
    args: TArgs
  ): SelectorResult<TResult>
}

export interface PluginCommandFacade {
  submit<TPayload>(
    commandId: CommandId,
    payload: TPayload
  ): CommandResult
}

export interface PluginRegistryFacade {
  contribute(contribution: KernelContribution): RegistryResult
  summary(query?: RegistryQuery): RegistrySummary
}

export interface PluginEventFacade {
  subscribe(
    type: KernelEventType,
    handler: (event: KernelEvent) => void
  ): PluginSubscription
}

export interface PluginReportFacade {
  createDiagnostic(diagnostic: KernelDiagnostic): void
  createReport(report: KernelReport): void
}
```

依赖方向:

- Trusted internal module -> CoreModuleRegistration -> KernelRegistry。
- Third-party plugin -> Extension Host facade -> Core Kernel public API。
- Core Kernel 不依赖插件实现、插件 runtime、React、Tauri、VexFlow 或 Web Audio。
- Extension Host 可以依赖 Core Kernel public API，但不能获得可变 `ScoreDocument`。

测试重点:

- 内部模块启动期直接注册不经过 Extension Host 代理，但仍通过 `KernelRegistry` 校验。
- 第三方插件无 `score:read` 时不能读取 snapshot。
- 第三方插件无 `command:execute` 时不能提交命令。
- 第三方插件注册贡献点时必须由 Extension Host 代理到 `KernelRegistry`。
- 插件命令执行后 undo/redo 可恢复。
- 插件异常转换为 diagnostic/report，不影响已提交事务。
- 插件事件订阅只收到授权事件。

### 反过度设计视角

MVP 不实现真实第三方运行时，也不把内部模块热路径强制塞进完整插件代理。第一阶段使用 `CoreModuleRegistration` 验证 registry、capability、command、snapshot 和 report 边界；保留 `PluginKernelFacade` 类型作为未来第三方插件的受控 API。

当前阶段保留:

- `internal-module` runtime。
- `CoreModuleRegistration`。
- manifest 类型。
- capability 检查。
- `PluginKernelFacade` 类型边界，但不强制用于可信内核模块热路径。
- 内部命令、验证器、导入器、导出器、模板贡献点。

当前阶段后置:

- 第三方 JS/TS 沙箱。
- 插件安装和卸载。
- 运行时热插拔。
- 插件市场。
- UI 面板插件。
- 权限授权 UI。
- 插件包签名和审核。

## 插件类型分级

### P0: 内部模块插件

第一版就应该支持，用来验证架构边界。

- 内置命令。
- 内置导入器/导出器。
- 内置文档验证器。
- 内置模板生成器。
- 内置批量编辑工具。

价值: 验证插件边界，不引入第三方安全问题。

### P1: 只读分析插件

适合早期开放。

- 检查超出品位范围。
- 检查不合理指法。
- 检查小节时值错误。
- 生成练习建议。

权限: 只读谱面快照，不允许修改文件。

### P2: 文档变换插件

谨慎开放。

- 批量移调。
- 生成变奏练习。
- 自动添加指法。
- 批量替换技巧标记。

权限: 只能通过语义命令事务修改文档，必须可撤销；不得获得任意 patch 写入能力。

### P3: 导入导出插件

中期开放。

- 新格式导入。
- 新格式导出。
- 教学网页包导出。
- 视频素材导出。

权限: 文件读写必须受用户显式选择和 manifest 限制。

### P4: UI 面板插件

后置开放。

- 自定义练习面板。
- 和弦库面板。
- AI 助手面板。
- 指法分析面板。

权限: UI 插件只能进入指定区域，不能任意注入主界面。

### P5: 播放和音频插件

最后开放。

- 音色扩展。
- 播放处理器。
- 音频同步。
- 节奏训练器。

原因: 性能、稳定性和用户体验风险最高。

## Tauri 插件与产品插件的区别

Tauri 官方插件机制适合扩展应用原生能力，例如文件系统、窗口、更新器、系统 API、Rust 命令和前端绑定。它属于桌面壳模块。

本产品要支持的是“谱面插件生态”，例如新增导出格式、批量编辑、教学模板、AI 编曲和指法分析。这类插件必须建立在我们的内核 API、命令系统和文件契约之上，不能等同于 Tauri plugin。

因此架构分成两类:

- App Native Plugin: Tauri/Rust 层插件，只由核心团队维护，用于系统能力。
- Score Extension Plugin: 产品层插件，围绕谱面模型、命令、导入导出、验证器和 UI 扩展点。

## 插件 API 基础契约

每个插件必须有 `PluginManifest`:

```json
{
  "id": "com.brilliant-guitar.example",
  "name": "Example Plugin",
  "version": "0.1.0",
  "apiVersion": "0.1",
  "kind": "score-extension",
  "runtime": "internal-module",
  "entry": "plugin.js",
  "permissions": ["score:read", "command:execute"],
  "contributes": {
    "commands": [],
    "validators": [],
    "importers": [],
    "exporters": [],
    "templates": [],
    "panels": []
  }
}
```

强制规则:

- 插件 ID 必须稳定且全局唯一。
- 插件必须声明 API version、runtime、权限和贡献点。
- MVP 只接受 `runtime = "internal-module"`。
- 插件读取谱面只能读取快照或 selector。
- 插件修改谱面必须走语义命令事务。
- 插件不得提交任意 patch、JSON path、字段替换、数组 splice 或脚本式写入。
- 插件异常不能导致主程序崩溃。
- 禁用插件后，核心谱面仍必须可打开。
- 插件私有数据必须按插件 ID 命名空间隔离。

## 主要风险

- 安全风险: 插件可能读取文件、联网、破坏文档或执行恶意代码。
- 兼容风险: 插件 API 变更会破坏旧插件。
- 性能风险: 插件可能阻塞编辑器、渲染或播放。
- 支持风险: 用户会把第三方插件问题归因到主软件。
- 数据风险: 插件私有数据可能污染文件格式。

## 风险控制

- MVP 不开放任意第三方插件安装。
- 插件 API 版本化。
- 插件权限默认最小化。
- 插件写操作必须可撤销，并且必须通过已注册语义命令表达用户或模块意图。
- 插件私有数据必须命名空间隔离。
- 插件运行必须有超时、错误捕获和禁用机制。
- 公开插件目录后置到生态成熟后；近期不规划付费插件或商业插件市场。

## 外部参考

- Tauri plugin docs: https://v2.tauri.app/develop/plugins/
- VS Code Extension API: https://code.visualstudio.com/api
- Figma Plugin Manifest: https://developers.figma.com/docs/plugins/manifest/
- JetBrains Extension Points: https://plugins.jetbrains.com/docs/intellij/plugin-extension-points.html

## 验收标准

- [ ] 内部模块必须通过内核注册表注册贡献点。
- [ ] 模块边界能支持不用改 UI 就新增一个内部导出器。
- [ ] 模块边界能支持不用改领域模型就新增一个只读分析器。
- [ ] 插件不能直接改谱面对象，只能提交语义命令事务。
- [ ] 插件不能获得任意 patch 或字段路径写入能力。
- [ ] 禁用插件后，用户文件仍可打开并保留插件私有数据。
- [ ] MVP 文档明确第三方插件安装不是第一版必须项。
