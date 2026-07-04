# SPEC-015 内核注册表与 Capability 契约

## 状态

- 状态: 已收敛；实现细节以本 spec 的强制规则、测试要求和 `implement.md` 为准。
- 映射需求: `REQ-007`, `REQ-010`, `REQ-015`, `REQ-016`, `REQ-018`。
- 目标: 定义 Core Kernel 的最小注册表、模块身份、contribution descriptor、capability 检查和 registry 只读查询契约。
- 非目标: 错误对象、diagnostic 和 report shell 由 `SPEC-016-kernel-errors-diagnostics-reports.md` 定义。

## 问题定义

微内核必须允许内部模块和未来插件把能力“挂进来”，例如命令、selector、验证器、技巧定义、迁移器、外部导入/导出贡献点和模板。但接入点必须稳定、可拒绝、可测试。没有统一注册表时，每个模块都会发明自己的入口；没有 capability 时，调用方能做什么会变成隐式约定。

导入/导出在本 spec 中只表示外部模块可声明的抽象贡献点，不表示 Core Kernel 拥有 PDF、PNG、Guitar Pro 或 `.bgp` 物理读写实现。Core Kernel 可以校验这些贡献点的元数据、capability 和 API version，但具体格式解析、生成、文件 IO、页面模型、字体嵌入和降级策略都属于外部服务模块。

本 spec 只解决:

- 模块如何声明身份。
- 模块如何注册贡献点。
- 内核如何判断贡献点是否可接受。
- 内核如何判断调用方是否有 capability。
- 外部模块如何读取只读 registry summary。

错误 code、diagnostic 和 report issue 的字段由 `SPEC-016` 统一定义。本 spec 可以返回 `KernelError`，但不拥有 `KernelError` 的结构。

## 设计结论

第一阶段采用 “Kernel Registry + Unified Startup Registration + Static Capability”。

- Registry: Core Kernel 维护最小注册表，只登记稳定 contribution descriptor 和 handler 引用。
- Registration: 所有官方模块和未来第三方模块最终都收敛到同一套 `KernelModuleIdentity + capability + contribution descriptor + handler` 注册协议。
- Capability: MVP 使用静态启动期 capability 授权；未来第三方插件也必须在应用启动前完成安装、校验、授权和 capability 分配。
- Origin: 模块来源与权限解耦；`official` 不天然拥有全部权限，`third-party` 未来也可以经启动前授权获得高权限。
- Runtime: MVP 只接受 `builtin` 和 `internal-module`。第三方 `javascript-typescript`、`lua` 和 `native` runtime 一律 unsupported。
- Boundary: 注册表不是插件市场、不是权限 UI、不是第三方沙箱、不是写入通道。

## 适用范围

本 spec 约束:

- `KernelRegistry`。
- `KernelContribution`。
- `KernelCapability`。
- `KernelModuleIdentity`。
- `ModuleOrigin`。
- registry summary 和 query。
- 内部模块注册、查询、拒绝和 capability 检查规则。

本 spec 不约束:

- `KernelError`、`KernelDiagnostic`、`KernelReport` 结构。
- 第三方插件包下载、安装、更新、签名和审核。
- 第三方 TypeScript 插件运行时、编译产物、Lua 或 native 沙箱实现。
- Tauri/Rust 原生权限。
- UI 面板插件生命周期。
- 网络权限、云服务权限和账号权限。

## 第一性原则

- EXPLICIT-CONTRIBUTION: 所有扩展能力必须显式注册。
- STABLE-ID: 注册项 ID 是长期 API，不能随 UI 文案变化。
- LEAST-CAPABILITY: 模块只获得它声明并被授予的最小 capability。
- DENY-BY-DEFAULT: 未注册、未授权、不兼容或未知贡献点默认拒绝。
- SUMMARY-ONLY-READ: 外部模块只能读取 registry summary，不能拿到 handler 或可变对象。
- STARTUP-ONLY-PLUGIN-CHANGES: 第三方插件安装、移除、启用和禁用配置只能在应用启动前完成；运行中插件集合不得新增、移除、启用、禁用或热插拔。
- ORIGIN-NOT-PERMISSION: 模块来源只描述 provenance，不决定权限高低。
- CORE-SMALL: 插件发现、运行时、沙箱和市场不进入 Core Kernel。
- FORMAT-IMPLEMENTATION-OUTSIDE-KERNEL: PDF、PNG、Guitar Pro 和 `.bgp` 物理文件读写不进入 Core Kernel，内核只保留抽象贡献点、schema/迁移语义和报告契约。

## 强制规则

- KRC-001: 所有命令、selector、hard validator、technique definition、migration、外部 import/export descriptor 和 template descriptor 必须通过 `KernelRegistry` 注册。
- KRC-002: 注册项必须声明 `id`、`kind`、`sourceModuleId`、`apiVersion`、`requiredCapabilities`、`status` 和 `titleKey`。
- KRC-003: 注册项 ID 不得重复；重复注册必须返回 `registry-duplicate-id`，不得覆盖已有注册项。
- KRC-004: MVP 注册运行时只允许 `builtin` 和 `internal-module`；`javascript-typescript`、`lua` 和 `native` 第三方运行时必须返回 `runtime-unsupported`。
- KRC-005: 注册项 API version 必须与 Core Kernel 兼容；不兼容必须返回 `api-version-incompatible`。
- KRC-006: capability 检查必须在命令执行、selector 调用、注册贡献点和未来插件代理前执行。
- KRC-007: 缺失 capability 必须返回 `capability-denied`，不得静默降级为 unknown error。
- KRC-008: 注册表变化必须递增 `registryVersion` 并发布 `kernel.registry.changed`。
- KRC-009: 注册表只保存 descriptor 和 handler 引用，不保存 React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件句柄或可变 `ScoreDocument`。
- KRC-010: 注册表查询必须返回只读 summary，不得泄露 handler、可变内部对象或私有实现状态。
- KRC-011: 注册表不是写入通道；任何修改 `ScoreDocument` 的能力仍必须走语义命令、导入结果或迁移入口。
- KRC-012: 未来第三方插件不得直接访问 `KernelRegistry` 可变接口；后续插件平台必须先完成启动前安装、校验、授权和 capability 分配，再把第三方模块映射进同一套注册协议。
- KRC-013: 注册 capability 与执行 capability 必须分离；拥有 `command:register`、`validator:register` 或 `exporter:register` 不得隐式获得 `command:execute`、`score:read` 或文件权限。
- KRC-014: `origin`、`runtime`、`trustLevel` 和 capability 是独立概念；来源、运行时和信任级别都不自动获得权限，也不绕过 registry、apiVersion 或 capability 校验。
- KRC-015: `system-trusted` 只表示模块被启动前授权为系统级模块；未来第三方模块也可以成为 `system-trusted`，但仍必须通过 capability 和 registry 校验。
- KRC-016: Pure Core Kernel V1 的模块身份只能来自静态 `KernelStartupModuleManifest`；模块运行时、插件 manifest 或用户配置不得在运行中自我追加或提升权限。
- KRC-017: V1 `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不得引用任意文件路径、URL、脚本字符串或动态 import 表达式。
- KRC-018: 未来第三方插件的安装、移除、启用和禁用配置必须在应用启动前完成；后续插件平台只能在启动期发现、校验、授权并把第三方贡献点映射进统一注册协议，应用进入 ready 状态后不得新增、卸载、启用、禁用或热插拔第三方插件，运行中生命周期变更请求不得改变当前 registry handler set，相关变更只能写入下次启动配置或返回 `restart-required` / `unsupported-at-runtime`。
- KRC-019: `importer-descriptor` 和 `exporter-descriptor` 只能描述外部模块贡献点的元数据和能力要求。Pure Core Kernel V1 不得注册 PDF、PNG、Guitar Pro 或 `.bgp` 物理读写的具体 descriptor/handler，不得引入格式解析器、PDF/PNG 生成库、zip 文件 IO、字体嵌入或页面渲染依赖。

## 数据结构草案

本节是后续实现的编码输入。每个结构都必须保留注释，说明用途和边界。

```ts
/**
 * Core Kernel API version.
 *
 * 用途:
 * - 判断内部模块和未来插件是否兼容当前内核公开接口。
 * - 不等于应用版本，也不等于 `.bgp` schema version。
 */
export type KernelApiVersion = string

/**
 * 模块 ID。
 *
 * 用途:
 * - 标识注册项来源。
 * - 用于 capability 检查、错误归因、report 归因和未来插件配置状态归因。
 */
export type ModuleId = string

/**
 * 内核模块身份。
 *
 * 用途:
 * - 描述一个调用方或贡献方是谁。
 * - MVP 只接受 `builtin` 和 `internal-module`。
 * - `origin` 只描述来源，不决定权限。
 */
export interface KernelModuleIdentity {
  moduleId: ModuleId
  displayNameKey: string
  origin: ModuleOrigin
  trustLevel: KernelModuleTrustLevel
  runtime: KernelModuleRuntime
  apiVersion: KernelApiVersion
}

/**
 * 模块来源。
 *
 * 用途:
 * - 区分模块由官方随应用发布，还是由第三方作者提供。
 * - 用于审计、诊断、插件管理 UI 和未来市场展示。
 *
 * 边界:
 * - 来源不等于权限。
 * - `third-party` 模块未来可以经启动前授权获得高权限。
 */
export type ModuleOrigin =
  | "official"
  | "third-party"

/**
 * 内核模块信任级别。
 *
 * 用途:
 * - 区分模块被启动前授权后的信任级别。
 * - 决定模块是否可以绑定高权限 contribution，例如 UI shell、renderer 或 exporter。
 * - trustLevel 由 Core Kernel 启动配置或未来插件平台分配，不允许插件 manifest 自行声明。
 *
 * 边界:
 * - 这不是用户授权 UI，也不是操作系统权限。
 * - 来源不决定 trustLevel；official 模块也要按 capability 授权，third-party 模块未来也可成为 `system-trusted`。
 */
export type KernelModuleTrustLevel =
  | "system-trusted"
  | "sandboxed"

/**
 * 内核启动模块清单。
 *
 * 用途:
 * - 作为 Pure Core Kernel V1 阶段模块身份和 capability grant 的唯一来源。
 * - 在 Core Kernel 启动时生成可信模块身份、capability grant 和注册顺序。
 * - 该清单随应用源码或打包产物发布，必须被版本控制和测试覆盖。
 *
 * 边界:
 * - 这不是第三方插件 manifest。
 * - 不允许用户安装的插件、外部文件或运行时模块自我追加到该清单。
 * - 未来第三方插件平台会在启动前完成安装、校验和授权，再映射到同一注册协议；这不属于 V1。
 */
export interface KernelStartupModuleManifest {
  schemaVersion: string
  modules: StartupModuleDeclaration[]
}

/**
 * 启动期模块声明。
 *
 * 用途:
 * - 声明一个 Pure Core Kernel V1 可加载的内置或内部模块。
 * - registrationEntryId 指向应用内已编译、已绑定的 `CoreModuleRegistration` 工厂。
 *
 * 边界:
 * - V1 的 `origin` 固定为 `official`。
 * - V1 的 `trustLevel` 固定为 `system-trusted` 或后续显式降低为 `sandboxed`。
 * - `runtime` 只能是 `builtin` 或 `internal-module`。
 * - registrationEntryId 不是文件路径、URL、脚本字符串或动态 import 表达式。
 */
export interface StartupModuleDeclaration {
  moduleId: ModuleId
  displayNameKey: string
  origin: "official"
  trustLevel: "system-trusted" | "sandboxed"
  runtime: "builtin" | "internal-module"
  apiVersion: KernelApiVersion
  capabilities: KernelCapability[]
  registrationEntryId: CoreModuleRegistrationEntryId
}

export type CoreModuleRegistrationEntryId = string

/**
 * 模块运行时。
 *
 * 用途:
 * - 区分内置模块、内部模块和未来第三方插件运行时。
 * - MVP 只允许前两项注册贡献点。
 * - runtime 只描述模块如何加载或执行，不代表权限或信任级别。
 */
export type KernelModuleRuntime =
  | "builtin"
  | "internal-module"
  | "javascript-typescript"
  | "lua"
  | "native"

/**
 * 内核 capability。
 *
 * 用途:
 * - 声明模块可以访问哪些 Core Kernel API。
 * - 这不是 OS 权限，也不是 Tauri 权限，只约束谱面内核边界。
 */
export interface KernelCapability {
  id: KernelCapabilityId
  scope?: string
}

/**
 * 内核 capability ID。
 *
 * 用途:
 * - 作为测试和插件 manifest 可引用的稳定权限名。
 */
export type KernelCapabilityId =
  | "score:read"
  | "score:write"
  | "command:register"
  | "command:execute"
  | "selector:register"
  | "selector:execute"
  | "validator:register"
  | "technique:register"
  | "importer:register"
  | "exporter:register"
  | "template:register"
  | "migration:register"
  | "event:subscribe"
  | "diagnostic:create"
  | "report:create"
  | "registry:read"
  | "registry:register"

/**
 * capability 授权结果。
 *
 * 用途:
 * - 让调用方获得稳定拒绝原因。
 * - 供测试断言权限边界。
 *
 * 边界:
 * - `KernelError` 的字段结构由 SPEC-016 定义。
 */
export type CapabilityCheckResult =
  | { ok: true }
  | { ok: false; error: KernelError }

/**
 * 注册项 ID。
 *
 * 用途:
 * - 作为命令、selector、validator、technique、外部 import/export descriptor 等贡献点的稳定标识。
 */
export type ContributionId = string

/**
 * 注册项类型。
 *
 * 用途:
 * - 表示该贡献点属于哪类内核扩展。
 * - `importer-descriptor` 和 `exporter-descriptor` 只描述外部模块能力，
 *   不代表 Core Kernel 拥有具体格式解析或生成实现。
 */
export type ContributionKind =
  | "command"
  | "selector"
  | "hard-validator"
  | "technique-definition"
  | "migration"
  | "importer-descriptor"
  | "exporter-descriptor"
  | "template-descriptor"

/**
 * 注册项状态。
 *
 * 用途:
 * - 表示单个贡献点是否可用。
 * - MVP 可以只使用 `active` 和 `disabled`。
 * - `disabled` 只描述当前注册项状态，不表示运行中允许禁用、卸载或热插拔第三方插件。
 */
export type ContributionStatus =
  | "active"
  | "disabled"
  | "unsupported"
  | "incompatible"

/**
 * 内核注册项。
 *
 * 用途:
 * - 描述一个可被 Core Kernel 发现和检查的贡献点。
 * - descriptor 可被 UI、命令面板、外部导入导出菜单和测试读取。
 *
 * 边界:
 * - 不保存 React、SVG、VexFlow、Web Audio、Tauri 文件对象、格式解析器、PDF/PNG 生成器或可变 `ScoreDocument`。
 */
export interface KernelContribution<TDescriptor = unknown> {
  id: ContributionId
  kind: ContributionKind
  titleKey: string
  descriptionKey?: string
  sourceModuleId: ModuleId
  apiVersion: KernelApiVersion
  requiredCapabilities: KernelCapability[]
  status: ContributionStatus
  descriptor: TDescriptor
}

/**
 * 注册结果。
 *
 * 用途:
 * - 统一表达贡献点注册成功或失败。
 * - 成功时返回新的 registryVersion。
 *
 * 边界:
 * - 失败错误对象结构由 SPEC-016 定义。
 */
export type RegistryResult =
  | { ok: true; contributionId: ContributionId; registryVersion: number }
  | { ok: false; error: KernelError }

/**
 * 注册表查询。
 *
 * 用途:
 * - 让模块按 kind、来源或状态读取只读摘要。
 */
export interface RegistryQuery {
  kind?: ContributionKind
  sourceModuleId?: ModuleId
  status?: ContributionStatus
}

/**
 * 注册表摘要。
 *
 * 用途:
 * - 给 UI、未来插件平台和测试读取贡献点目录。
 * - 不泄露 handler 或可变内部对象。
 */
export interface RegistrySummary {
  registryVersion: number
  contributions: KernelContributionSummary[]
}

/**
 * 注册项摘要。
 *
 * 用途:
 * - 作为 registry summary 中可公开读取的最小 contribution 信息。
 */
export interface KernelContributionSummary {
  id: ContributionId
  kind: ContributionKind
  titleKey: string
  sourceModuleId: ModuleId
  apiVersion: KernelApiVersion
  status: ContributionStatus
}

/**
 * Core Kernel 注册表。
 *
 * 用途:
 * - 管理内核可发现贡献点。
 * - 提供显式注册、只读查询和 capability 检查入口。
 */
export interface KernelRegistry {
  register<TDescriptor>(
    identity: KernelModuleIdentity,
    contribution: KernelContribution<TDescriptor>
  ): RegistryResult
  getSummary(query?: RegistryQuery): RegistrySummary
  requireCapability(
    identity: KernelModuleIdentity,
    required: KernelCapability[]
  ): CapabilityCheckResult
}
```

## MVP 注册项集合

MVP 必须至少通过 registry 管理以下贡献点:

- `core.commands`: `core.createScore`、`core.insertNote`、`core.setFret`、`core.addTechnique` 等命令定义。
- `core.selectors`: `selectDocumentMetadata`、`selectSerializableScore`、`selectMeasureRange` 等 selector。
- `core.hard-validators`: schema、ID、引用、duration、tuning、single-note MVP 限制等 hard validator。
- `core.guitar-techniques`: `slide`、`bend`、`vibrato` technique definition。
- `core.migrations`: `.bgp` schema migration entries。
- `core.templates`: 标准 6 弦 4/4 吉他谱模板 descriptor。

MVP registry 可以定义 `importer-descriptor` 和 `exporter-descriptor` 这两类抽象 contribution kind，但 Pure Core Kernel V1 不要求、也不允许注册具体格式条目。原生 `.bgp` 打开/保存和自动恢复属于后续 `Persistence Service`，PDF/PNG 属于后续 `Export Service`，Guitar Pro 属于后续 `Import Service`。

MVP 不允许以下注册项来源:

- 第三方 TypeScript 插件运行时或其编译产物。
- Lua 插件。
- Native 动态库插件。
- 运行时下载的远程插件。
- 未声明 module identity 的匿名贡献点。

## 边界行为

- Duplicate contribution: 返回 `registry-duplicate-id`，保持原注册项不变。
- Unsupported runtime: 返回 `runtime-unsupported`，不得执行入口代码。
- Capability denied: 返回 `capability-denied`，不得继续执行 handler。
- API incompatible: 返回 `api-version-incompatible`，不得注册贡献点。
- Disabled contribution: 返回 `contribution-disabled`，不得静默跳过；该状态不得作为运行中卸载 handler 或热插拔第三方插件的入口。
- Unknown contribution: 返回对应 unknown/unsupported 错误，不得猜测替代贡献点。

## 与其它 spec 的关系

- `SPEC-003-command-system.md`: CommandDefinition 必须通过 registry 注册，命令执行前做 capability 检查。
- `SPEC-005-guitar-techniques.md`: `TechniqueDefinition` 通过 registry 注册，持久化技巧数据保存为 `TechniqueData` 并通过 `definitionId` 引用已注册定义。
- `SPEC-009-extension-api.md`: 未来插件平台在应用启动期读取插件 manifest、完成授权后，把第三方模块映射进同一套 registry 注册协议；MVP 只允许 `builtin` 和 `internal-module`。
- `SPEC-011-internationalization.md`: 注册项标题和描述必须使用 i18n key。
- `SPEC-014-kernel-snapshot-events.md`: 注册表变化必须发布 `kernel.registry.changed`。
- `SPEC-016-kernel-errors-diagnostics-reports.md`: 注册和 capability 失败时的错误对象由该 spec 定义。

## MVP 必须做

- 定义 `KernelRegistry`。
- 定义 `KernelCapability`。
- 定义 `KernelModuleIdentity`。
- 定义 `ModuleOrigin`。
- 定义 `KernelStartupModuleManifest` 和 `CoreModuleRegistration`。
- 为命令、selector、hard validator、technique、migration、外部 import/export descriptor 和 template descriptor 建立注册入口。
- 拒绝重复注册、未知 kind、unsupported runtime、api version 不兼容和 capability 不足。
- 注册表变化后更新 `registryVersion` 并发布事件。
- registry summary 不泄露 handler、React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。
- Pure Core Kernel V1 不注册 PDF、PNG、Guitar Pro 或 `.bgp` 物理读写的具体 descriptor/handler，只验证抽象 descriptor 的注册、拒绝、summary 和 capability 行为。

## MVP 不做

- 不做第三方插件安装。
- 不做插件市场。
- 不做远程插件下载。
- 不做插件签名审核。
- 不做第三方 TypeScript 插件运行时、编译产物执行、Lua 或 native 插件运行。
- 不做运行中新增、卸载、启用、禁用或热插拔第三方插件；运行中生命周期变更请求不得改变当前 registry handler set。
- 不做 UI 面板插件注册。
- 不做 PDF/PNG 真实导出、Guitar Pro 导入或 `.bgp` 物理文件 IO 的具体注册项和 handler。
- 不引入 PDF/PNG、Guitar Pro、zip 文件 IO、字体嵌入或页面渲染依赖。
- 不做网络权限。
- 不把 Tauri/Rust 权限合并到 Core Kernel capability。

## 测试要求

- [ ] AC-015-01: 重复注册同一 command id 返回 `registry-duplicate-id`。
- [ ] AC-015-02: 注册 unsupported runtime 的贡献点返回 `runtime-unsupported`。
- [ ] AC-015-03: api version 不兼容时返回 `api-version-incompatible`。
- [ ] AC-015-04: capability 不足时返回 `capability-denied`，handler 不执行。
- [ ] AC-015-05: 注册表变化后 `registryVersion` 递增，并发布 `kernel.registry.changed`。
- [ ] AC-015-06: registry summary 不包含 handler、React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。
- [ ] AC-015-07: 拥有 `command:register` 的模块不能因此执行写命令；执行写命令仍需要 `command:execute`。
- [ ] AC-015-08: `KernelModuleIdentity.trustLevel = "system-trusted"` 的模块可以在启动期使用 `CoreModuleRegistration`，但重复注册、apiVersion 不兼容或 capability 不足时仍被拒绝。
- [ ] AC-015-09: `origin = "official"` 不自动获得 capability；缺失 capability 的官方模块注册或执行仍会被拒绝。
- [ ] AC-015-10: 不在 `KernelStartupModuleManifest` 中的模块即使 runtime 为 `internal-module`，也不能进入 V1 注册流程。
- [ ] AC-015-11: `KernelStartupModuleManifest` 中包含文件路径、URL、脚本字符串或未知 `registrationEntryId` 时，内核启动必须失败并返回稳定 registry/module 错误。
- [ ] AC-015-12: 应用进入 ready 状态后，第三方插件新增、卸载、启用、禁用或热插拔请求不会改变当前 registry handler set，并返回 `unsupported-at-runtime` 或 `restart-required` 类稳定错误。
