# REQ-018 内核注册表与能力边界

> **状态：K1-4 ACCEPTED / ARCHIVED（2026-07-20）。** K1-4 已在 `94766a0930c05e5339c44f667deaf02116af1c0c` 通过独立验收并归档，125/125 测试通过。K1-5 实现基线 `51fa2177cbd25dea53f1ebaf23bd8b8426471589` 已于 2026-07-21 在文档基线 `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` 通过独立验收，161/161 测试通过；K1-6 规划已解锁，生产实现尚未授权。

## 用户价值

`Brilliant Guitar` 需要让官方模块发现并调用现有命令和 selector，但不能靠模块随意注入主程序。K1-4 为此建立稳定身份、静态 capability 与确定性目录，同时保护 K1-2/K1-3 的事务、历史、读取和事件合同。用户最终感知到的是:

- 新增功能行为可预测，不会因为模块暗中接入导致谱面损坏。
- 内置模块具有清晰、可测试的接入边界。
- 不支持的贡献点会被明确拒绝，而不是沉默失败。
- 后续规划第三方插件时，可复用 API version、身份维度和能力边界，而不把第三方执行带入 K1-4。
- 毕业设计版本能够解释“模块化扩展不是随意调用，而是受内核契约治理”。

## 当前决策状态

- 状态: K1-4 已在 `94766a0930c05e5339c44f667deaf02116af1c0c` 通过独立验收并归档，125/125 测试通过。
- 批准方向: 启动期原子 frozen Registry、`command | selector` 两类贡献、七个互不蕴含的 capability、capability-scoped gateway、最小 summary 和 K1-4 本地失败合同。
- 对应 spec: `specs/SPEC-015-kernel-registry-capability.md`。
- 关联错误契约: K1-4 拥有封闭 startup/access failure union；已验收 K1-5 将其严格映射为 `KernelIssue`，未改名或改义。

## 规划审核视角

### 产品视角

这个模块解决“官方模块如何调用已验收 Core 能力但不获得隐式权限”的问题。用户不会直接操作注册表，但会从稳定、可预测的命令和查询行为中受益。

核心使用场景:

- 启动软件时一次性登记现有六个命令和六个 selector adapter。
- 获 `registry:read` 的官方模块读取最小 summary，知道当前有哪些已批准贡献。
- 内部模块调用内核 API 前先通过 capability 检查。
- trusted Core Host 可继续直接调用既有 `CommandBus` 和 selector。

MVP 真正必要的功能:

- 一次性静态 manifest 与 compiled registration binding。
- API version、identity 和 capability 检查。
- capability-scoped gateway。
- 确定排序、深冻结且隐私安全的只读 summary。
- 全异常边界和失败零状态变化。

### 业务逻辑视角

业务流程:

1. Core Host 提交完整静态 manifest。
2. factory 严格解码 manifest 并解析仅有的两个 compiled registration entry。
3. candidate 检查 module identity、API version、registration capability、contribution ID 与 handler/descriptor 匹配。
4. 全部成功后一次性返回 frozen ready Registry；任一失败不返回半成品。
5. Registry 为 manifest-declared module 创建 gateway。
6. gateway 解析 contribution、检查 caller capability，再委托现有 CommandBus/selector/read/subscribe。

业务规则:

- module/contribution id 必须稳定且唯一，结果排序不依赖 manifest 顺序；manifest 提供的 module/entry id 长度为 1–128，并匹配 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`。
- K1-4 只接受 manifest-bound `official + builtin/internal-module + system-trusted`。
- capability 互不蕴含；缺少任一 required capability 必须拒绝。
- registry 不是谱面写入口；所有写入仍走现有语义命令事务。
- ready Registry 不提供 register、unregister、replace、seal、enable、disable 或 hotplug。

边界条件和异常情况:

- 重复 ID。
- 非 `command | selector` contribution kind。
- unsupported runtime。
- API version 不兼容。
- compiled entry 不存在或 owner 不匹配。
- 注册项 descriptor 不完整或与 handler 不匹配。
- handler 存在但 summary 不得泄露 handler。

### 技术实现视角

模块边界:

- 属于 Core Kernel。
- K1-4 自有 closed startup/access failure；已验收 K1-5 已映射但未重定义。
- 不拥有通用 `KernelError`、diagnostic 生命周期或 report 生成规则。
- 不依赖 React、Tauri、VexFlow、Web Audio、文件系统或 UI 组件。

核心数据模型:

- `KernelRegistry`。
- `KernelModuleIdentity`。
- `KernelCapability`。
- `command | selector` contribution summary。
- `RegistrySummary`。
- `KernelModuleGateway`。

接口契约:

- `createKernelRegistry(manifest: unknown)`。
- `KernelRegistry.createGateway(moduleId, commandBus)`。
- gateway 的 `summary/read/select/submit/undo/redo/subscribe`。

可测试性:

- 原子 startup 与重复 ID 测试。
- unsupported runtime 测试。
- API version 不兼容测试。
- capability denied 测试。
- summary 冻结、确定排序和隐私测试。
- authorized parity、denied preservation 与无 Registry event 测试。

### 反过度设计视角

MVP 不需要把 registry 做成完整插件平台。当前阶段应避免:

- 第三方插件运行中动态安装。
- 插件市场。
- 远程插件下载。
- 插件签名审核。
- 权限 UI。
- 运行时热插拔、运行中启用/禁用或卸载。
- 多进程插件宿主。
- 复杂策略语言或权限 DSL。

推荐 MVP 保持最小机制: 内置模块显式注册、静态 capability、只读 summary、失败返回结构化错误。第三方插件运行时、启动前安装/移除/启用/禁用配置、沙箱和权限 UI 后置到 Extension Host 阶段；运行时动态卸载、热更新和热插拔不作为规划目标。

## 功能边界

本需求只解决两个问题:

- 谁可以把什么能力注册到 Core Kernel。
- 谁可以调用哪些 Core Kernel 能力。

本需求不解决:

- 错误对象、diagnostic、report shell 的字段设计；这些属于 `REQ-019`。
- hard validator、technique definition、migration、import/export descriptor 或 template descriptor 注册。
- Guitar Domain 命令、技巧 schema 或领域 payload 解释。
- 第三方插件安装、下载、市场、签名和审核。
- 第三方 TypeScript 插件运行时、编译产物、Lua 或 native 第三方运行时沙箱。
- Tauri/Rust 原生权限系统。
- UI 插件面板生命周期。

## MVP 必须满足

- Core Kernel 提供一次性 `createKernelRegistry(unknown)`，只登记现有六个 command 与六个 selector adapter。
- 每个 summary contribution 必须有稳定 `id`、`kind`、`sourceModuleId`、`apiVersion`、`requiredCapabilities` 和 `titleKey`；command 另有 `targetKind`，selector 另有 `inputKind`。
- K1-4 只接受 manifest-bound `official` + `builtin/internal-module` + `system-trusted`，拒绝第三方 TypeScript、Lua、native 或任意外部执行入口。
- 注册表拒绝畸形 manifest、重复 ID、非批准 kind、unsupported identity、不兼容 API version、缺失 capability、unknown/misowned binding 和 descriptor/handler mismatch；strict decoder 必须复制 own data descriptor 的稳定值，验证后不得执行 Proxy 普通属性读取。
- capability 检查必须发生在 summary、命令执行、selector 调用、读取和事件订阅之前。
- 注册权限必须与执行权限分离；例如拥有 `command:register` 不代表拥有 `command:execute`。
- MVP 采用来源与权限解耦模型: `origin`、`runtime`、`trustLevel` 和 capability 必须独立判断；任何一个字段都不能单独绕过另外几个检查。
- V1 的 `system-trusted` 内部模块只能来自静态 `KernelStartupModuleManifest` 与 compiled binding，不能由插件 manifest、用户配置或运行时模块自我声明。
- `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不能引用任意文件路径、URL、脚本字符串或动态 import。
- ready Registry 不可变，不定义 `registryVersion` 或 `kernel.registry.changed`，且不修改 K1-3 event union。
- 注册表 summary 只暴露批准白名单，确定排序、深冻结并脱离内部状态；不能泄露 granted capability、trust、handler、private index、Registry 或可变 `ScoreDocument`。
- 所有写能力仍必须通过现有语义命令，不允许通过注册表绕过命令事务。

## MVP 不做

- 不做第三方插件安装。
- 不做插件市场。
- 不做远程插件下载。
- 不做运行中新增、卸载、启用、禁用或热插拔第三方插件。
- 不做插件签名、审核和权限 UI。
- 不执行第三方 TypeScript 插件运行时、编译产物、Lua 或 native 插件代码。
- 不允许模块运行时随意注入 UI 面板、React 组件、VexFlow 对象、Web Audio 节点或 Tauri 文件对象。
- 不把 OS 文件权限、Tauri 权限或浏览器沙箱权限混入 Core Kernel capability。
- 不做 mutable Registry、query DSL、status 字段、runtime counter 或 Registry change event。
- 不把 moduleId 写入 command envelope、history、replay 或 K1-3 events。

## 行为契约

- 启动契约: Core Host 一次提交完整 manifest；candidate 全部验证成功后才返回 frozen ready Registry，失败不得暴露部分状态。
- 贡献契约: 只有 compiled `core.commands.v1` 与 `core.selectors.v1` 可绑定现有十二个 adapter，禁止任意 handler 或 monkey patch。
- 命名契约: 内置能力使用 `core.*` 或 `core.<domain>.*` 命名空间；内部模块使用稳定 module id 命名空间。
- 能力契约: 调用方只获得自己声明并被授予的 capability；缺失 capability 必须被拒绝。
- 权限分离契约: summary、注册、执行命令、执行 selector、读取谱面、订阅事件使用七个固定 capability，不能互相隐式包含；report 不属于 K1-4。
- 版本契约: 注册项和调用方必须声明 API version；不兼容时拒绝注册或拒绝调用。
- 只读契约: registry summary 是目录，不是 handler 泄露口。
- 委托契约: 授权后原样返回既有 `CommandResult`、`ReadResult` 与订阅结果，不创建第二套事务、读取或事件语义。
- 写入契约: registry 不是写入通道；修改谱面仍必须走既有语义命令事务。
- 失败契约: K1-4 全入口收口异常，返回封闭隐私安全 failure；任何拒绝或内部异常都保持文档、版本、history、dirty、事件、订阅和 Registry 状态不变。

## 验收标准

- [x] AC-018-01: K1-4 PRD/design/implement 决策完整并于 2026-07-17 获用户批准。
- [ ] AC-018-02: 默认 manifest 精确登记六个 command 与六个 selector，无其他 kind 或 arbitrary handler。
- [ ] AC-018-03: manifest strict decode 快速拒绝 extra/missing field、accessor、sparse array、路径/URL/脚本和畸形有限值，不执行 Proxy 普通 `get` trap，且不抛异常。
- [ ] AC-018-04: startup duplicate/version/runtime/trust/capability/binding/handler failure 保持 all-or-nothing。
- [ ] AC-018-05: ready Registry 无 public register/unregister/replace/seal、runtime counter 或 Registry event。
- [ ] AC-018-06: summary 按批准规则确定排序、深冻结、脱离内部状态并满足隐私白名单。
- [ ] AC-018-07: gateway 的 submit/undo/redo/read/select/subscribe 权限矩阵正确，授权结果与 trusted-host 调用完全一致。
- [ ] AC-018-08: 拒绝与意外异常零状态变化，并转换为封闭隐私安全 failure。
- [ ] AC-018-09: `command:register` 不隐含 `command:execute`，任一 capability 都不隐含其他 capability。
- [ ] AC-018-10: history、replay、K1-3 events 无 module attribution，K1-3 event union 不变。
- [ ] AC-018-11: 公共导出无 handler、mutable Registry、patch、第二写入路径、第三方 runtime 或 K1-5 API。
- [ ] AC-018-12: typecheck、build、完整测试、forbidden dependency、diff check 与 Trellis validation 全部通过。

## 已确认决策

- DEC-018-01: “内核注册表与 capability”作为 Core Kernel 功能实现。
- DEC-018-02: 该功能独立规划和实现，不与错误、diagnostic、report 合并。
- DEC-018-03: K1-4 拥有本地 startup/access failure union，但不拥有通用 KernelError、diagnostic 生命周期或 report 生成规则；K1-5 只能映射。
- DEC-018-04: contribution kind 固定为 `command | selector`，只绑定既有六命令和六 selector。
- DEC-018-05: Registry 一次性原子创建且 ready 后冻结；没有 runtime version 或 change event。
- DEC-018-06: module identity 的 origin/runtime/trust/apiVersion/capability 独立，K1-4 仅接受 manifest-bound official trusted builtin/internal module。
- DEC-018-07: 七个 capability 固定且互不蕴含，模块调用通过 gateway，trusted Core Host direct API 保留。
- DEC-018-08: hard validator、technique、migration、import/export、template、Guitar Domain、K1-5 report 和第三方 runtime 均不进入 K1-4。

## 后续待规划问题

- 暂无。生产实现若要求改变 K1-1/K1-2/K1-3 合同，必须停止并重新规划。
