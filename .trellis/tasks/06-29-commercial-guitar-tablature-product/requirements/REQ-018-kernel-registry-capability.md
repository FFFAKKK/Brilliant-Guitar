# REQ-018 内核注册表与能力边界

> **状态：PLANNING INPUT / NOT EXECUTABLE。** K1-3 已在 `7369eeac60fecea66c2c9164c04439625c2d78b0` 验收，但 K1-4 合同尚未收敛。本文的 contribution kinds、`kernel.registry.changed`、错误名称、接口和验收项均为候选输入；只有未来经用户审核通过的 K1-4 PRD/design/implement 才能授权实现。

## 用户价值

`Brilliant Guitar` 需要长期扩展命令、selector、验证器、技巧、导入器、导出器、模板和未来插件能力，但这些能力不能靠模块随意注入主程序。用户最终感知到的是:

- 新增功能行为可预测，不会因为模块暗中接入导致谱面损坏。
- 内置模块和未来插件都有清晰的接入边界。
- 不支持的贡献点会被明确拒绝，而不是沉默失败。
- 后续开放第三方插件时，API version、能力声明和权限边界已有基础。
- 毕业设计版本能够解释“模块化扩展不是随意调用，而是受内核契约治理”。

## 当前决策状态

- 状态: 未收敛、不可执行；仅作为 K1-4 独立规划输入。
- 候选方向: 评估“注册表与 capability”是否应作为独立内核功能，以及它与 K1-5 错误/report 的最小边界；不得把本文件的旧结论视为批准结果。
- 对应 spec: `specs/SPEC-015-kernel-registry-capability.md`。
- 关联错误契约: 注册和 capability 失败是否复用 K1-5、由谁拥有具体错误 code，必须在 K1-4/K1-5 规划中重新决定。

## 规划审核视角

### 产品视角

这个模块解决“软件如何长期扩展但不失控”的问题。用户不会直接操作注册表，但会感受到命令、技巧、导入器、导出器、模板和未来插件都能稳定接入，不会因为某个模块暗中注入能力导致文件损坏或功能行为不一致。

核心使用场景:

- 启动软件时加载内置命令、selector、验证器、技巧定义和导入导出 descriptor。
- UI 或命令面板读取 registry summary，知道当前有哪些可用命令或导出能力。
- 内部模块调用内核 API 前先通过 capability 检查。
- 未来 Extension Host 在应用启动期代理第三方插件注册贡献点。

MVP 真正必要的功能:

- 内置贡献点显式注册。
- API version 检查。
- capability 检查。
- 只读 registry summary。
- 注册变化事件。

### 业务逻辑视角

业务流程:

1. Core Kernel 创建 registry。
2. 内置模块声明 `KernelModuleIdentity`。
3. 内置模块提交 contribution descriptor。
4. registry 检查 kind、ID、runtime、API version 和 capability。
5. 成功则登记贡献点并递增 `registryVersion`；失败则返回结构化错误。
6. 外部模块只能读取 summary，不能拿到 handler 或可变对象。

业务规则:

- contribution id 必须稳定且唯一。
- MVP 只允许 `builtin` 和 `internal-module`。
- 缺少 capability 时必须拒绝。
- registry 不是谱面写入口，任何写入仍走语义命令、导入入口或迁移入口。
- 未来第三方插件的安装、移除、启用和禁用配置必须在应用启动前完成；应用运行中不得新增、卸载、启用、禁用或热插拔第三方插件。

边界条件和异常情况:

- 重复 ID。
- 未知 contribution kind。
- unsupported runtime。
- API version 不兼容。
- contribution disabled。
- 注册项 descriptor 不完整。
- handler 存在但 summary 不得泄露 handler。

### 技术实现视角

模块边界:

- 属于 Core Kernel。
- 可以依赖 `SPEC-016` 的 `KernelError` 返回失败原因。
- 不拥有 `KernelError` 结构、diagnostic 生命周期或 report 生成规则。
- 不依赖 React、Tauri、VexFlow、Web Audio、文件系统或 UI 组件。

核心数据模型:

- `KernelRegistry`。
- `KernelModuleIdentity`。
- `KernelCapability`。
- `KernelContribution`。
- `RegistrySummary`。
- `registryVersion`。

接口契约:

- `register(identity, contribution)`。
- `getSummary(query)`。
- `requireCapability(identity, required)`。

可测试性:

- 重复注册测试。
- unsupported runtime 测试。
- API version 不兼容测试。
- capability denied 测试。
- summary 不泄露 handler 测试。
- registryVersion 和事件测试。

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
- 第三方插件安装、下载、市场、签名和审核。
- 第三方 TypeScript 插件运行时、编译产物、Lua 或 native 第三方运行时沙箱。
- Tauri/Rust 原生权限系统。
- UI 插件面板生命周期。

## MVP 必须满足

- Core Kernel 提供统一 `KernelRegistry`，用于登记命令、selector、hard validator、technique definition、migration、importer/exporter descriptor 和 template descriptor。
- 每个注册项必须有稳定 `id`、`kind`、`sourceModuleId`、`apiVersion`、`requiredCapabilities`、`status` 和 `titleKey`。
- MVP 只接受 `builtin` 和 `internal-module` 来源，不接受第三方 TypeScript 插件运行时、编译产物、Lua 或 native 插件贡献点。
- 注册表拒绝重复 ID、未知 contribution kind、unsupported runtime、不兼容 API version 和缺失 capability。
- capability 检查必须发生在命令执行、selector 调用、注册贡献点和未来插件代理之前。
- 注册权限必须与执行权限分离；例如拥有 `command:register` 不代表拥有 `command:execute`。
- MVP 采用来源与权限解耦模型: `origin`、`runtime`、`trustLevel` 和 capability 必须独立判断；任何一个字段都不能单独绕过另外几个检查。
- V1 的 `system-trusted` 内部模块只能来自静态 `KernelStartupModuleManifest` 或应用打包清单，不能由插件 manifest、用户配置或运行时模块自我声明。
- `KernelStartupModuleManifest` 只能引用应用内已编译绑定的 `CoreModuleRegistrationEntryId`，不能引用任意文件路径、URL、脚本字符串或动态 import。
- 注册表变化必须递增 `registryVersion` 并发布 `kernel.registry.changed`。
- 注册表 summary 只能暴露只读 descriptor 摘要，不能泄露 handler、React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。
- 所有写能力仍必须通过语义命令、导入入口或迁移入口，不允许通过注册表绕过命令事务。

## MVP 不做

- 不做第三方插件安装。
- 不做插件市场。
- 不做远程插件下载。
- 不做运行中新增、卸载、启用、禁用或热插拔第三方插件。
- 不做插件签名、审核和权限 UI。
- 不执行第三方 TypeScript 插件运行时、编译产物、Lua 或 native 插件代码。
- 不允许模块运行时随意注入 UI 面板、React 组件、VexFlow 对象、Web Audio 节点或 Tauri 文件对象。
- 不把 OS 文件权限、Tauri 权限或浏览器沙箱权限混入 Core Kernel capability。

## 行为契约

- 注册契约: 所有贡献点必须通过 `KernelRegistry` 显式注册，禁止 monkey patch 主程序能力。
- 命名契约: 内置能力使用 `core.*` 或 `core.<domain>.*` 命名空间；内部模块使用稳定 module id 命名空间。
- 能力契约: 调用方只获得自己声明并被授予的 capability；缺失 capability 必须被拒绝。
- 权限分离契约: 注册贡献点、执行命令、读取谱面、订阅事件、创建 report 必须是不同 capability，不能互相隐式包含。
- 版本契约: 注册项和调用方必须声明 API version；不兼容时拒绝注册或拒绝调用。
- 只读契约: registry summary 是目录，不是 handler 泄露口。
- 写入契约: registry 不是写入通道；修改谱面仍必须走语义命令、导入结果或迁移结果。

## 验收标准

- [ ] AC-018-01: 注册重复 command id 时，注册表返回 `registry-duplicate-id`，原注册项不被覆盖。
- [ ] AC-018-02: 未声明 `command:execute` capability 的模块执行写命令时，返回 `capability-denied`。
- [ ] AC-018-03: 不兼容 API version 的内部模块注册贡献点时，返回 `api-version-incompatible`。
- [ ] AC-018-04: MVP 拒绝 `runtime = "javascript-typescript"` 的第三方插件贡献点注册。
- [ ] AC-018-05: 注册表变化会增加 `registryVersion` 并触发 `kernel.registry.changed`。
- [ ] AC-018-06: command、selector、validator、technique、importer/exporter descriptor 和 template descriptor 都能通过 registry summary 查询。
- [ ] AC-018-07: registry summary 不包含 handler、React 组件、SVG/VexFlow 对象、Web Audio 节点、Tauri 文件对象或可变 `ScoreDocument`。
- [ ] AC-018-08: 模块不能通过注册表直接修改 `ScoreDocument`；写入仍必须走语义命令、导入入口或迁移入口。
- [ ] AC-018-09: 拥有 `command:register` capability 的模块不能因此自动执行写命令；执行写命令仍需要 `command:execute`。
- [ ] AC-018-10: V1 `system-trusted` 内部模块可以在启动期走 `CoreModuleRegistration`，但 capability 不足、apiVersion 不兼容或重复注册时仍被拒绝。
- [ ] AC-018-11: 未来第三方模块不能调用 V1 内部模块直接注册入口，只能通过未来 `Extension Host` 或等价启动期适配层代理注册。
- [ ] AC-018-12: 不在 `KernelStartupModuleManifest` 或应用打包清单中的 V1 模块不能获得 `system-trusted` 身份。
- [ ] AC-018-13: `KernelStartupModuleManifest` 包含未知 `registrationEntryId`、文件路径、URL 或脚本字符串时，注册表初始化失败并返回稳定错误。
- [ ] AC-018-14: 应用进入 ready 状态后，第三方插件新增、卸载、启用、禁用或热插拔请求必须被拒绝或提示重启生效，不得改变当前 registry handler 集合。

## 已确认决策

- DEC-018-01: “内核注册表与 capability”作为 Core Kernel 功能实现。
- DEC-018-02: 该功能独立规划和实现，不与错误、diagnostic、report 合并。
- DEC-018-03: 该功能可以返回 `KernelError`，但不拥有错误结构、diagnostic 生命周期或 report 生成规则。
- DEC-018-04: 注册表生命周期采用稳定优先策略；可信内部模块在启动期静态注册，未来第三方插件也只能在应用启动前完成安装、移除、启用和禁用配置，由 `Extension Host` 在启动期发现、校验并代理注册，运行时插件集合变更需要重启后生效。

## 后续待规划问题

- 暂无。`OQ-018-02` 已由 `DEC-018-04` 收敛。
