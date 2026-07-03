# SPEC-009 扩展 API 与插件系统

## 状态

- 状态: 草案
- 映射需求: `REQ-007`
- 目标: 为模块化软件和未来插件生态定义可实现、可测试、可控的扩展边界。

## 适用范围

本 spec 约束产品层插件，即围绕 Core Kernel、命令、导入导出、验证器、模板和 UI 扩展点工作的插件。

未来公开的第三方产品层插件优先采用 JavaScript/TypeScript 包和类型契约。MVP 只实现内部模块插件和 API 边界，不执行第三方 JS/TS、Lua 或 native 代码。

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
- EXT-005: 插件必须声明 `id`、`version`、`apiVersion`、`permissions`、`contributes`。
- EXT-006: 插件贡献点必须显式注册，不能运行时随意注入主程序。
- EXT-007: 插件私有数据必须使用插件 ID 作为命名空间。
- EXT-008: 缺失插件时，主程序必须保留该插件私有数据。
- EXT-009: 插件异常必须被捕获；未来第三方插件只能被标记为下次启动禁用，当前运行期不得因此卸载 handler、改变已注册贡献点集合或热插拔插件。
- EXT-010: MVP 不允许无沙箱第三方脚本或 native 动态库插件。
- EXT-011: `PluginManifest` 必须声明 `runtime`，MVP 只接受 `internal-module`。
- EXT-012: 未来第三方 JS/TS 插件开放前，必须具备权限声明、沙箱隔离、API version、异常隔离、启动前禁用配置机制和兼容测试。
- EXT-013: 插件 API 只能暴露 Core Kernel 的稳定公开接口，不得暴露 React 组件、VexFlow 对象、SVG DOM、Web Audio 节点或 Tauri 文件系统内部实现。
- EXT-014: 插件贡献点必须通过内核注册表注册，不能在运行时绕过注册表注入主程序能力。
- EXT-015: 插件写入谱面只能提交已注册语义命令，不能提交任意 patch、JSON path、字段替换、数组 splice 或脚本式写入。
- EXT-016: 插件贡献点注册和 capability 检查必须遵守 `SPEC-015-kernel-registry-capability.md`；错误对象和 report 外壳必须遵守 `SPEC-016-kernel-errors-diagnostics-reports.md`。
- EXT-017: 未来第三方插件不得直接调用 Core Kernel 可变接口，必须通过 `Extension Host` 提供的 `PluginKernelFacade` 与内核协作。
- EXT-018: MVP 内部模块可以使用启动期 `CoreModuleRegistration` 直接注册贡献点和 handler，但必须遵守同一套 contribution descriptor、capability、语义命令、snapshot/selector 和 report 契约。
- EXT-019: 插件事件订阅必须由 `Extension Host` 按 capability 过滤，第三方插件不得直接订阅裸 `KernelEventBus`。
- EXT-020: 注册权限必须与执行权限分离；例如 `command:register` 不等于 `command:execute`，`exporter:register` 不等于任意文件写权限。
- EXT-021: MVP 采用两级信任模型；随应用发布的 `builtin/internal-module` 由内核标记为 `trusted-core`，未来第三方插件由 `Extension Host` 标记为 `external-plugin`。
- EXT-022: 插件 manifest 不得声明或提升自身 trust level；trustLevel 只能由 Core Kernel 启动配置、打包清单或 Extension Host 分配。
- EXT-023: 应用进入 ready 状态后，第三方插件新增、移除、启用、禁用或热插拔请求不得改变当前 registry handler set；此类请求只能写入下次启动配置，或返回 `restart-required` / `unsupported-at-runtime` 类稳定错误。
- EXT-023: `trusted-core` 模块只能由静态 `KernelStartupModuleManifest` 声明；该清单属于内核启动配置，不属于第三方插件 manifest。
- EXT-024: `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不得把外部路径、URL、脚本字符串或动态 import 当作可信注册入口。

## Manifest 契约

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

插件与内核协作采用两级信任模型和双层协作模型。

可信内核模块使用启动期直接注册:

- `builtin` 和可信 `internal-module` 可以通过 `CoreModuleRegistration` 直接向 `KernelRegistry` 注册贡献点和 handler。
- 直接注册只允许发生在内核初始化或模块启动阶段，不能作为运行时热插拔入口。
- 直接注册仍必须校验 module identity、apiVersion、registration capability 和 contribution descriptor。
- 可信内核模块的 `KernelModuleIdentity.trustLevel` 必须为 `trusted-core`。

信任模型:

- `trusted-core`: 随应用发布、由项目维护者维护的 `builtin/internal-module`，可走启动期直接注册，但不能绕过 capability 和 registry 校验。
- `external-plugin`: 未来第三方插件，不能走启动期直接注册，只能通过 `Extension Host` 提供的 facade 与内核协作。
- MVP 不设置 semi-trusted、partner、marketplace-reviewed 等中间等级。

可信模块来源:

- `trusted-core` 身份只来自 `KernelStartupModuleManifest`。
- 该清单随应用源码或打包产物发布，并由测试覆盖。
- 插件 manifest、用户配置和运行时模块不能把自己追加为可信模块。

插件生命周期边界:

- 未来第三方插件的安装、移除、启用和禁用配置只能在应用启动前解析并生效。
- 应用进入 ready 状态后，当前 registry handler set 不可被第三方插件生命周期请求改变。
- 运行中禁用请求只能写入下次启动配置，或返回 `restart-required` / `unsupported-at-runtime`；不得在当前进程 unregister handler。

未来第三方插件只允许走五条受控通道:

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
- `PluginManifest` 数据结构，且 MVP manifest 的 `runtime` 必须为 `internal-module`。
- `CoreModuleRegistration` 类型边界。
- `PluginKernelFacade` 类型边界。
- 插件私有数据命名空间。
- API 版本字段。

明确不做:

- 第三方插件安装。
- 插件市场。
- 付费插件或商业插件市场。
- 第三方 JavaScript/TypeScript 包执行。
- 任意 JavaScript 执行。
- Lua 插件。
- Native 动态库插件。
- UI 面板插件。
- 运行中新增、移除、启用、禁用或热插拔第三方插件。

## 测试要求

- [ ] AC-009-01: 注册一个内部验证器后，验证结果能显示来源插件 ID。
- [ ] AC-009-02: 注册一个内部导出器后，导出菜单能发现该导出器。
- [ ] AC-009-03: 内部插件执行批量移调命令后，undo 能恢复执行前状态。
- [ ] AC-009-04: 打开含未知插件私有数据的文件后，保存不会丢失该数据。
- [ ] AC-009-05: 插件抛出异常时，主程序不崩溃，并记录插件错误。
- [ ] AC-009-06: MVP 拒绝 `runtime = "javascript-typescript"` 的第三方插件 manifest，并给出明确 unsupported 错误。
- [ ] AC-009-07: 插件通过 `PluginKernelFacade` 读取 snapshot 时不会获得可变 `ScoreDocument`。
- [ ] AC-009-08: 插件通过 `PluginKernelFacade` 提交写命令后，该命令进入 undo/redo 历史并带 plugin id 来源。
- [ ] AC-009-09: 内部模块通过 `CoreModuleRegistration` 直接注册贡献点时，不经过 Extension Host 代理，但仍触发 registry 校验、apiVersion 校验和 capability 校验。
- [ ] AC-009-10: 拥有 `command:register` 权限的模块不能因此自动执行写命令；执行写命令仍需要 `command:execute`。
- [ ] AC-009-11: 插件 manifest 即使包含 `trustLevel` 字段也会被忽略或拒绝；插件不能通过 manifest 自我声明为 `trusted-core`。
- [ ] AC-009-12: `external-plugin` 模块调用 `CoreModuleRegistration` 直接注册入口时返回 capability 或 trust-boundary 拒绝。
- [ ] AC-009-13: 只有出现在 `KernelStartupModuleManifest` 且匹配已绑定 `CoreModuleRegistrationEntryId` 的模块才能获得 `trusted-core` 身份。
- [ ] AC-009-14: 插件 manifest 尝试引用 `CoreModuleRegistrationEntryId`、文件路径或动态入口时，不能被当作可信核心模块加载。
- [ ] AC-009-15: 应用进入 ready 状态后，第三方插件新增、移除、启用、禁用或热插拔请求不会改变当前 registry handler set，并返回 `restart-required` 或 `unsupported-at-runtime`。
