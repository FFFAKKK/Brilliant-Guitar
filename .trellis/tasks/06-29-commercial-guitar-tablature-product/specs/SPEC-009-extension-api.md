# SPEC-009 扩展 API 与插件系统

## 状态

- 状态: 草案
- 映射需求: `REQ-007`
- 目标: 为模块化软件和未来插件生态定义可实现、可测试、可控的扩展边界。
- 当前约束: 本文件是未来插件平台路线图，不是 K1-1/K1-4 实现契约；K1-4 必须先通过 `SPEC-015` 重规划门。
- 数据边界: `ScoreDocument.extensions` 已由 Core K1-1 定义为 score/part-owned 纯数据信封；它不等于插件安装、发现、registry 或执行 API。

## 适用范围

本 spec 约束产品层插件，即围绕 Core Kernel、命令、导入导出、验证器、模板和 UI 扩展点工作的插件。

长期插件体验向 VS Code 看齐: 插件安装和管理简单，manifest 声明 contribution，公开插件 API 统一以 TypeScript 为准，权限声明清晰，开发者能贡献命令、菜单、快捷键、面板、导入导出器、验证器、渲染器和教学工具。底层协作仍采用微内核边界: 统一注册、capability、snapshot、semantic command、event 和 report。

未来公开的第三方产品层插件统一采用 TypeScript 源码、SDK、类型契约、示例和兼容测试；发布包可包含编译后的 JavaScript 产物，但必须通过 TypeScript 类型契约和 manifest 校验。Pure Core Kernel V1 只实现统一注册协议的内核基础和官方/内置模块启动期注册，不执行第三方 TypeScript 插件运行时、编译产物、Lua 或 native 代码，也不实现真实 `Extension Host` 或 `PluginKernelFacade`。

不约束 Tauri/Rust 原生插件。原生插件属于应用壳和系统能力，只能由核心团队维护。

## 插件分层

- P0 内部模块插件: MVP 必须支持，用于验证扩展点。
- P1 只读分析插件: 可早期开放。
- P2 文档变换插件: 必须通过命令事务。
- P3 导入导出插件: 必须返回标准报告。
- P4 UI 面板插件: 后置开放。
- P5 播放和音频插件: 后置开放。

## 强制规则

- EXT-001: 插件不得直接持有可变谱面对象。
- EXT-002: 插件读取谱面时只能读取快照或受控 selector。
- EXT-002a: 快照、selector 和事件订阅必须遵守 `SPEC-014-kernel-snapshot-events.md`；MVP 只允许内部模块直接订阅内核事件，未来第三方插件必须通过 `Extension Host` 过滤和代理。
- EXT-003: 插件修改谱面必须通过命令系统和事务。
- EXT-004: 插件命令必须进入 undo/redo 历史。
- EXT-005: 模块和未来插件必须声明稳定 `id`、`version`、`apiVersion`、`permissions`、`contributes`；Pure Core Kernel V1 的声明来源是 `KernelStartupModuleManifest`，未来第三方插件的声明来源是后续 `PluginManifest`。
- EXT-006: 插件贡献点必须显式注册，不能运行时随意注入主程序。
- EXT-007: 后续插件平台若使用 ScoreDocument ExtensionBlock，必须分配稳定 reverse-domain namespace 并遵守 score/part owner；物理资源存储另行规划。
- EXT-008: Core K1-1 必须保真未知 ExtensionBlock 的 JsonValue 语义；领域模块/插件缺失时不得静默丢弃。物理资源和字节级保真不在该承诺内。
- EXT-009: 插件异常必须被捕获；未来第三方插件只能被标记为下次启动禁用，当前运行期不得因此卸载 handler、改变已注册贡献点集合或热插拔插件。
- EXT-010: MVP 不允许无沙箱第三方脚本或 native 动态库插件。
- EXT-011: Pure Core Kernel V1 只接受 `runtime = "builtin" | "internal-module"` 的启动期模块；未来 `PluginManifest` 必须声明 `runtime`，但真实第三方 manifest 读取和校验不进入 V1。
- EXT-012: 未来第三方 TypeScript 插件开放前，必须具备权限声明、沙箱隔离、API version、异常隔离、启动前禁用配置机制和兼容测试；发布包可包含编译后的 JavaScript 产物，但必须通过 TypeScript 类型契约和 manifest 校验。
- EXT-013: 插件 API 只能暴露 Core Kernel 的稳定公开接口，不得暴露 React 组件、VexFlow 对象、SVG DOM、Web Audio 节点或 Tauri 文件系统内部实现。
- EXT-014: 插件贡献点必须通过内核注册表注册，不能在运行时绕过注册表注入主程序能力。
- EXT-015: 插件写入谱面只能提交已注册语义命令，不能提交任意 patch、JSON path、字段替换、数组 splice 或脚本式写入。
- EXT-016: 插件贡献点注册和 capability 检查必须遵守 `SPEC-015-kernel-registry-capability.md`；错误对象和 report 外壳必须遵守 `SPEC-016-kernel-errors-diagnostics-reports.md`。
- EXT-017: 未来第三方插件不得直接调用 Core Kernel 可变接口；经过启动前安装、校验和授权后，也必须收敛到同一套 contribution descriptor、capability、snapshot、semantic command、event 和 report 契约。
- EXT-018: MVP 内部模块可以使用启动期 `CoreModuleRegistration` 直接注册贡献点和 handler，但必须遵守同一套 contribution descriptor、capability、语义命令、snapshot/selector 和 report 契约。
- EXT-019: MVP 内部模块事件订阅遵守 `SPEC-014`；未来第三方插件事件订阅必须由 `Extension Host` 按 capability 过滤，第三方插件不得直接订阅裸 `KernelEventBus`。
- EXT-020: 注册权限必须与执行权限分离；例如 `command:register` 不等于 `command:execute`，`exporter:register` 不等于任意文件写权限。
- EXT-021: 模块来源与权限解耦；`origin = official | third-party` 只描述来源，模块实际权限由启动前授权和 capability 决定。
- EXT-022: 插件 manifest 不得声明或提升自身 trust level/capability；trustLevel 和 capability 只能由 Core Kernel 启动配置、打包清单、开发者模式或未来插件平台分配。
- EXT-023: 未来第三方模块可以在启动前被授予高权限并替换官方 UI、渲染器、导入导出器或其它模块，但仍必须通过统一注册协议和内核公开接口协作。
- EXT-024: 应用进入 ready 状态后，第三方插件新增、移除、启用、禁用或热插拔请求不得改变当前 registry handler set；此类请求只能写入下次启动配置，或返回 `restart-required` / `unsupported-at-runtime` 类稳定错误。
- EXT-025: Pure Core Kernel V1 的 `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不得把外部路径、URL、脚本字符串或动态 import 当作注册入口；未来第三方安装源和签名策略后置单独设计。

## 未来 PluginManifest 契约

本节是长期 VS Code 式插件平台的设计草案，不是 Pure Core Kernel V1 的实现项或验收门槛。V1 只实现 `KernelStartupModuleManifest` 和 `CoreModuleRegistration`，为未来 `PluginManifest -> 授权 -> 统一注册协议` 留出稳定落点。

```ts
export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: string
  kind: "score-extension"
  runtime: PluginRuntime
  entry: string
  permissions: PluginPermission[]
  contributes: PluginContributions
}

export type PluginRuntime =
  | "internal-module"
  | "javascript-typescript"

export type PluginPermission =
  | "score:read"
  | "score:write"
  | "command:execute"
  | "command:register"
  | "selector:execute"
  | "selector:register"
  | "validator:register"
  | "importer:register"
  | "exporter:register"
  | "template:register"
  | "event:subscribe"
  | "diagnostic:create"
  | "report:create"
  | "file:open-dialog"
  | "file:save-dialog"
  | "network:declared"

export interface PluginContributions {
  commands?: CommandContribution[]
  validators?: ValidatorContribution[]
  importers?: ImporterContribution[]
  exporters?: ExporterContribution[]
  templates?: TemplateContribution[]
  panels?: PanelContribution[]
}
```

## 插件与内核协作契约

插件与内核协作采用统一注册协议。官方模块和未来第三方模块最终都以 `KernelModuleIdentity + capability + contribution descriptor + handler` 的形式进入 `KernelRegistry`；差异只存在于启动前发现、校验、授权和加载阶段。

Pure Core Kernel V1 使用启动期直接注册:

- `builtin` 和可信 `internal-module` 可以通过 `CoreModuleRegistration` 直接向 `KernelRegistry` 注册贡献点和 handler。
- 直接注册只允许发生在内核初始化或模块启动阶段，不能作为运行时热插拔入口。
- 直接注册仍必须校验 module identity、apiVersion、registration capability 和 contribution descriptor。
- V1 只接受随应用发布并出现在 `KernelStartupModuleManifest` 中的 `builtin/internal-module`。

信任模型:

- `origin`: 标记模块来源，例如 `official` 或 `third-party`。
- `trustLevel`: 标记模块被授权后的信任级别，例如 `system-trusted` 或 `sandboxed`。
- `capabilities`: 标记模块实际可以调用哪些内核 API。
- 来源、运行时、信任级别和 capability 独立建模；official 不天然拥有全部权限，third-party 未来也可以经启动前授权获得高权限。
- MVP 不设计 marketplace-reviewed、partner、semi-trusted 等额外等级。

启动期模块来源:

- Pure Core Kernel V1 的模块身份只来自 `KernelStartupModuleManifest`。
- 该清单随应用源码或打包产物发布，并由测试覆盖。
- V1 不允许插件 manifest、用户配置或运行时模块把自己追加到清单。
- 未来第三方插件平台可以在应用启动前读取第三方 manifest、完成安装/签名/开发者模式/用户授权校验后，把模块映射成同一套 `KernelModuleIdentity`、capability 和 contribution descriptor。

插件生命周期边界:

- 未来第三方插件的安装、移除、启用和禁用配置只能在应用启动前解析并生效。
- 应用进入 ready 状态后，当前 registry handler set 不可被第三方插件生命周期请求改变。
- 运行中禁用请求只能写入下次启动配置，或返回 `restart-required` / `unsupported-at-runtime`；不得在当前进程 unregister handler。

未来第三方插件平台也必须收敛到五条受控通道:

- 注册通道: `Extension Host -> KernelRegistry`。
- 读取通道: `Extension Host -> KernelReadApi -> snapshot/selector`。
- 写入通道: `Extension Host -> CommandBus.submit`。
- 事件通道: `Extension Host -> filtered KernelEvent`。
- 报告通道: `Extension Host -> KernelDiagnostic/KernelReport`。

```ts
export interface CoreModuleRegistration {
  identity: KernelModuleIdentity
  capabilities: KernelCapability[]
  contributions: KernelContribution[]
  register(registry: KernelRegistry): RegistryResult[]
}

/**
 * Future Extension Host facade.
 *
 * 非 Pure Core Kernel V1 实现项。
 * 用途:
 * - 未来为第三方插件提供受控 read/command/registry/event/report API。
 * - 未来插件平台必须把 facade 调用重新收敛到同一套 registry、capability 和 semantic command 契约。
 */
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

协作规则:

- `PluginKernelFacade` 不暴露可变 `ScoreDocument`。
- `PluginKernelFacade` 不暴露内部 delta、patch、JSON path 或字段替换接口。
- `PluginKernelFacade` 不暴露 React、VexFlow、SVG DOM、Web Audio 或 Tauri 文件对象。
- 第三方插件的 facade 必须由 `Extension Host` 根据 manifest 和 capability 创建。
- `PluginKernelFacade` 是未来第三方插件平台的 facade 草案，不属于 Pure Core Kernel V1 必须实现项。
- MVP 的 `internal-module` 可以同进程运行，并可通过 `CoreModuleRegistration` 直接注册；测试仍必须证明它没有绕过 snapshot、command、registry 和 report 契约。

## 贡献点契约

### Commands

- 命令必须声明稳定 ID、标题、输入 schema 和所需权限。
- 命令必须表达领域语义，例如插入音符、设置品号、添加技巧或批量移调，不能表达任意字段 patch。
- 命令执行必须返回成功、失败或可恢复警告。
- 修改文档的命令必须提供撤销信息。

### Validators

- 验证器只读谱面快照。
- 验证器输出标准 diagnostic。
- diagnostic 必须包含 severity、message、location、sourcePluginId。

### Importers

- 导入器输入由用户显式选择。
- 导入器输出领域模型或中间模型。
- 导入器必须返回 `ImportReport`。

### Exporters

- 导出器输入是领域模型快照。
- 导出器必须返回 `ExportReport`。
- 导出器不得静默丢失关键能力。

### Templates

- 模板生成器必须通过命令创建或修改文档。
- 模板参数必须声明 schema。

### Panels

- UI 面板插件后置开放。
- 面板必须运行在隔离容器中。
- 面板只能通过公开 API 读取状态和发命令。

## MVP 范围

必须做:

- 内部命令注册。
- 内部验证器注册。
- 内部导入器/导出器注册。
- 内部模板注册。
- `KernelStartupModuleManifest` 和 `CoreModuleRegistration` 数据结构。
- `KernelModuleIdentity` 中的 origin、runtime、trustLevel 和 apiVersion 字段。
- `CoreModuleRegistration` 类型边界。
- Core K1-1 定义通用 ExtensionBlock namespace/owner/payload 信封并保真未知 JsonValue；具体领域 payload 和物理资源位置由对应模块单独设计。
- API 版本字段。

文档级未来草案:

- `PluginManifest`，用于后续 VS Code 式第三方插件平台。
- `PluginKernelFacade`，用于后续 `Extension Host` 受控代理。

明确不做:

- 第三方插件安装。
- 插件市场。
- 付费插件或商业插件市场。
- 真实第三方 `PluginManifest` 读取、校验或加载。
- 真实 `Extension Host` 或 `PluginKernelFacade` 实现。
- 第三方 TypeScript 插件运行时或其编译产物执行。
- 任意 JavaScript 执行。
- Lua 插件。
- Native 动态库插件。
- UI 面板插件。
- 运行中新增、移除、启用、禁用或热插拔第三方插件。

## Pure Core Kernel V1 测试要求

- [ ] AC-009-01: 注册一个内部验证器后，验证结果能显示来源插件 ID。
- [ ] AC-009-02: 注册一个内部抽象 exporter descriptor 后，registry summary 能发现该 descriptor；不得实现 UI 发现逻辑或真实导出 handler。
- [ ] AC-009-03: 内部插件执行批量移调命令后，undo 能恢复执行前状态。
- [ ] AC-009-04: Core 保真未知 score/part ExtensionBlock 的 JsonValue 语义；不承诺物理 `extensions/` 目录、插件资源或字节级 round-trip。
- [ ] AC-009-05: 插件抛出异常时，主程序不崩溃，并记录插件错误。
- [ ] AC-009-06: V1 启动期注册拒绝 `runtime = "javascript-typescript" | "lua" | "native"`，并给出明确 unsupported 错误。
- [ ] AC-009-07: 模块 origin 不自动授予 capability；official 模块缺少 capability 时同样被拒绝。
- [ ] AC-009-08: 内部模块通过已注册语义命令修改谱面后，该命令进入 undo/redo 历史并带 module id 来源。
- [ ] AC-009-09: 内部模块通过 `CoreModuleRegistration` 直接注册贡献点时，不经过 Extension Host 代理，但仍触发 registry 校验、apiVersion 校验和 capability 校验。
- [ ] AC-009-10: 拥有 `command:register` 权限的模块不能因此自动执行写命令；执行写命令仍需要 `command:execute`。
- [ ] AC-009-11: V1 不读取真实第三方 `PluginManifest`；第三方 manifest 文件不能影响当前启动期模块集合。
- [ ] AC-009-12: 未出现在 `KernelStartupModuleManifest` 的模块不能注册贡献点。
- [ ] AC-009-13: 只有出现在 `KernelStartupModuleManifest` 且匹配已绑定 `CoreModuleRegistrationEntryId` 的模块才能进入 V1 注册流程。
- [ ] AC-009-14: V1 `KernelStartupModuleManifest` 尝试引用文件路径、URL、脚本字符串或动态入口时，不能被当作模块加载。
- [ ] AC-009-15: 应用进入 ready 状态后，第三方插件新增、移除、启用、禁用或热插拔请求不会改变当前 registry handler set，并返回 `restart-required` 或 `unsupported-at-runtime`。

## 后续插件平台测试要求

- [ ] AC-009-F01: 第三方 `PluginManifest` 经安装、校验和授权后，可以被映射成同一套 `KernelModuleIdentity`、capability 和 contribution descriptor。
- [ ] AC-009-F02: 第三方 system-trusted 模块可以替换官方 UI 或渲染模块，但仍不能直接获取可变 `ScoreDocument`。
- [ ] AC-009-F03: 第三方插件通过未来 `PluginKernelFacade` 读取 snapshot 时不会获得可变 `ScoreDocument`。
- [ ] AC-009-F04: 第三方插件通过未来 `PluginKernelFacade` 提交写命令后，该命令进入 undo/redo 历史并带 module id 来源。
- [ ] AC-009-F05: 打开含未知 ExtensionBlock 的文件后必须语义保留；若未来物理插件资源无法保留，Persistence/插件平台必须明确报告。
