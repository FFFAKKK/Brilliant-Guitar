# Brilliant Guitar 插件平台方案 v1

日期：2026-09-18。

## 目标

把当前分散在 UI 插件目录、UI 宿主、诊断存储和工作台组合根中的插件逻辑，整理为一个应用级插件平台。插件平台负责发现、校验、排序、安装、激活、停用和诊断；具体组件只消费已经解析好的贡献，不再自行扫描插件。

第一阶段保持现有行为：只支持编译进工作台的内部模块，不加载任意远程脚本，不修改 Rust 或内核，不引入插件市场。

## 分层

```text
插件包 / 内置模块
        ↓
Plugin SDK（稳定的对外合同，第二阶段）
        ↓
Plugin Platform（发现、校验、生命周期、权限、诊断）
        ↓
UI Plugin Host / Application Controllers
        ↓
Tauri / Rust Kernel
```

平台层和 UI 宿主层保持分工：

- `UiPluginCatalog` 负责编译模块的发现和扩展点依赖排序。
- `UiPluginHost` 负责 UI 组件、命令、交互、Projection 和扩展贡献的合同校验与解析。
- `PluginPlatform` 负责把目录、宿主、激活集合和运行状态统一起来。
- 组件只通过 Projection、命令和扩展点工作，不读取插件清单或插件目录。

## 统一插件包与两个执行域

项目只保留一个插件平台和一个插件包身份。一个插件包可以只贡献应用能力，也可以声明随内核 Session 固定装配的 Kernel 模块；平台统一管理插件 ID、版本、等级、清单和冲突，但不直接执行 Kernel 模块。

```text
PluginPackage
  ├─ Application contributions → UiPluginHost
  └─ kernelModules             → immutable assembly plan → trusted Kernel adapter
```

插件等级固定为 `system`、`product` 和 `third-party`。Kernel 模块固定使用 `session-fixed` 生命周期；包含 Kernel 模块的插件不能使用运行时用户启停。第三方 Kernel 模块只能声明 `wasm` runtime，不能伪装成受信任的内部模块。模块 ID 在整个平台内只能有一个所有者。

平台生成的 assembly plan 是排序、冻结且与调用方数据隔离的纯数据。可信宿主以后根据该计划绑定真实内部模块或经过验证的 Wasm 产物；UI Host 不导入 Kernel 实现，Kernel 也不读取 UI 清单、React 组件或插件设置。

当前基础合同已经完成，位于 `plugins/plugin-package-contract.ts`、`plugins/plugin-sdk.ts` 和 `plugins/plugin-platform.ts`。本切片没有适配任何吉他、调号或其他业务组件；它们在平台合同稳定后分别接入。

## 生命周期

```text
discovered → installed → active
                 └──────→ failed
                 ├──────→ disabled
```

`installed` 表示插件合同已经通过并进入宿主；`active` 表示它的 View、Command 或扩展贡献正在解析；`disabled` 表示插件仍已安装但暂时不参与组合。停用只改变组合结果，不删除插件身份、布局位置或持久化数据。

第一阶段由组合根提供激活集合。后续再接入用户设置和桌面插件目录。

## 贡献类型

平台最终统一管理以下贡献：

1. UI View、Dock 和工作台工具。
2. Command、快捷键和菜单项。
3. 音符控制器扩展，例如技巧、演奏法、力度和弦品。
4. 谱式交互规则，例如五线谱和六线谱输入适配器。
5. 乐器描述、播放输出和音源适配器。
6. 文件导入导出、设置页和诊断信息。

第一阶段先稳定 UI View、Command、Notation Interaction 和 Note Control Extension。其他领域沿用同样的注册模型，等应用控制器合同稳定后接入。

## 能力与权限

插件清单只声明它需要的能力；平台在安装前校验能力是否存在。插件不能直接调用 Tauri command、Rust DTO、文件系统或网络。需要修改乐谱时，插件通过应用层 Controller 提交命令或编辑意图，由应用层统一进入内核事务和历史。

插件失败时只隔离当前插件，记录结构化诊断报告码，工作台和其他插件继续运行。

## 启动顺序

```text
收集插件清单
  → 校验 manifest
  → 解析扩展点所有者依赖
  → 先安装提供扩展点的组件
  → 安装贡献高级控制的插件
  → 根据激活集合解析 View / Command / Extension
  → 将解析结果投影给工作台
```

这保证乐器插件不需要依赖数组顺序，也不需要复制音符控制组件。

## 对外 SDK 边界

第二阶段提供 `@brilliant-guitar/plugin-sdk` 风格的稳定入口。SDK 只公开：

- 插件清单和 API 版本。
- `definePlugin`、`defineNoteControlExtension` 等注册函数。
- 只读的应用事实上下文。
- 命令、设置、诊断和资源服务。

SDK 不公开 `UiPluginHost`、Projection Registry、React 内部宿主上下文或 Rust 数据结构。SDK 插件通过适配器转换为内部模块，内部合同变化不会直接破坏插件作者的代码。

## 实施切片

### A：平台内核（当前切片）

- 新增 `PluginPlatform` facade。
- 统一目录、UI 宿主、诊断和插件运行状态。
- 保留现有第一方插件行为。
- 增加启动排序、激活过滤和状态测试。

状态：已完成（2026-09-18）。

当前实现位于 `apps/workbench/src/plugins/plugin-platform.ts`。工作台组合根已经通过
`workbenchPluginPlatform` 读取组件、交互和 Projection，并通过平台 facade 解析命令与 View。
旧的 `workbenchPlugins` / `workbenchPluginCatalog` 兼容导出已经移除，`WorkbenchApp` 只通过平台 facade 装配插件。平台级测试覆盖：

- 常驻插件安装后进入 `active`，用户插件安装后保持 `installed`。
- 用户插件通过 `activate` / `deactivate` 控制 View 和 Command 贡献。
- 扩展点或组件冲突只隔离失败插件，并产生结构化诊断报告码。
- 启动后拒绝追加注册，保证组合根的确定性。

验证结果：平台专用测试 4 项全部通过；在后续并行的 Agent Provider 改动出现前，工作台完整测试套件 264 项全部通过。当前全局类型检查被 `src/agent/openai-provider.ts` 的两个隐式 `any` 阻塞，属于独立改动，不属于插件平台。

### B：稳定 SDK

- 定义 SDK manifest 与版本兼容规则。
- 为音符控制、命令和设置提供公开适配器。
- 为 SDK 输入建立结构化权限和错误报告。

状态：已完成（2026-09-18）。

已经新增稳定的插件作者入口和内部适配边界：

- `plugins/plugin-sdk.ts` 公开 `definePlugin()`、`definePluginProjection()` 和
  `defineNoteControlExtension()`。
- `plugins/plugin-sdk-adapter.ts` 是唯一把公开插件包转换为 `InternalUiPluginModule` 的位置。
- 公开合同不暴露 `UiPluginHost`、Projection Registry、Tauri command 或 Rust DTO。
- Manifest 中的 Projection、View、Command 和组件扩展清单由适配器生成，插件作者不再重复维护。
- History、Paper Zoom、Note Control、Playback Transport、Playback Output、Agent Assistant
  和 Staff View 已全部迁移为 SDK 插件包。
- SDK 已加入公共谱式交互协议。谱式插件注册自己的标准化输入翻译、组合输入、导航和编辑规则；
  工作台只按 `staff`、`tablature` 或 `numbered` 选择交互所有者，不需要知道具体谱式语法。
- 公共协议只包含标准化输入信号、抽象输入上下文和通用编辑意图，不暴露 React hook、编辑状态机、
  Tauri command 或 Rust DTO。五线谱专用上下文与结果类型仍留在五线谱插件内部。
- 平台已提供 `restoreActivation()`，可以一次性从持久化配置恢复全部用户插件的启用集合；未知插件和
  装配失败插件会被忽略，常驻插件不会被关闭。Agent 插件已通过这条统一路径恢复运行时启用状态，
  `WorkbenchApp` 不再为它单独调用 `activate()` / `deactivate()`。
- SDK 插件可以声明版本化设置结构、默认值和解析函数。平台按插件 ID 隔离设置，统一完成读写校验、
  默认值恢复以及持久化文档的序列化/恢复。当前只建立前端合同；接入桌面配置文件前仍需单独定义
  Tauri/Rust 配置边界。
- 前端已增加 `PluginSettingsStoragePort` 和持久化控制器。宿主以后只需要实现 `read/write`，不需要理解
  各插件的设置结构；控制器会串行写入，并保留当前未安装插件的命名空间，避免临时缺少插件时丢失配置。
- SDK 的 View、Command 和组件扩展现在会获得插件自身的设置句柄。句柄不接受插件 ID，因此插件无法借此
  查询其他插件的配置；写入和复位会自动经过已连接的持久化控制器。
- 设置恢复、写入或复位会发布平台快照，工作台因此重新解析受影响的 View 和 Command，不依赖其他界面
  状态变化来偶然刷新。
- 用户插件启用集合也已具备独立的版本化存储端口。恢复时会过滤非法 ID、去重并保留当前未安装插件的
  启用意图；常驻插件仍由平台强制保持启用，存储端口不能关闭它们。
- 浏览器开发宿主已提供该端口的 localStorage 适配器，损坏的 JSON 会隔离到 invalid 键；桌面端仍等待
  Tauri 配置合同确认后接入，浏览器适配器不会成为桌面配置来源。
- 新增 Manifest 预检目录，宿主可以在交给平台安装前验证 API 版本、能力、Projection 和重复 ID；预检只
  处理数据，不加载或执行任何插件模块。
- 网页前端预览在 React 挂载前预检已打包的第一方 Manifest，并从 localStorage 恢复插件设置与启用状态。
  浏览器存储失败只生成插件诊断，工作台仍继续渲染；网页端不会扫描目录或执行外部脚本。
- 播放输出已经成为 SDK 的功能型贡献。内置合成器由“播放输出”插件注册，播放器只消费平台当前激活插件
  提供的输出；输出插件停用或失效时会回退到内置合成器。输出引擎只接收标准化 MIDI、开始时间和时长，
  不接触乐谱 Core、React 状态或 Tauri DTO。
- 乐器描述已经成为 SDK 的只读能力贡献。乐器插件可以声明稳定乐器 ID、名称、乐器族、支持的谱式、
  音符控制扩展和播放音色配置标识；平台负责清单一致性、重复 ID 隔离和启停解析。乐器描述不能覆盖
  内核提供的移调、绝对音高或乐谱事实。同一插件停用后，它的乐器描述和高级音符控制会一起退出组合。

阶段验证结果：工作台完整测试 310 项全部通过，TypeScript 类型检查与生产构建通过。

### C：桌面插件发现

- Tauri 桌面端读取受控插件目录。
- 只解析 manifest，确认兼容后再加载模块。
- 增加启用、停用和恢复状态持久化。

### D：隔离与发布

- 插件权限确认。
- 签名或可信来源校验。
- 插件升级、迁移和回滚。
- 插件市场或本地安装界面。

## 第一阶段验收

- 工作台仍能解析现有第一方插件。
- 用户插件未激活时不贡献 View、Command 或扩展。
- 扩展点所有者总是先于贡献者安装。
- 插件冲突只产生结构化诊断，不阻塞其他插件。
- 组件不直接读取插件目录。
- 不修改 Rust、内核事务和现有布局格式。
