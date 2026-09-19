# Brilliant Guitar 插件平台方案 v1

日期：2026-09-18。

## 目标

把当前分散在 UI 插件目录、UI 宿主、诊断存储和工作台组合根中的插件逻辑，整理为一个应用级插件平台。插件平台负责发现、校验、排序、启动前配置、固定会话装配和诊断；具体组件只消费已经解析好的贡献，不再自行扫描插件。

第一阶段只支持编译进工作台的内部模块，不加载任意远程脚本，不修改 Rust 或内核，不引入插件市场。

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

插件等级固定为 `system`、`product` 和 `third-party`。Kernel 模块固定使用 `session-fixed` 生命周期；非系统插件可以在启动中心选择是否进入下一次会话，但进入会话后不能启停、替换或卸载。第三方 Kernel 模块只能声明 `wasm` runtime，不能伪装成受信任的内部模块。模块 ID 在整个平台内只能有一个所有者。

平台生成的 assembly plan 是排序、冻结且与调用方数据隔离的纯数据。可信宿主以后根据该计划绑定真实内部模块或经过验证的 Wasm 产物；UI Host 不导入 Kernel 实现，Kernel 也不读取 UI 清单、React 组件或插件设置。

可信绑定边界已经实现于 `plugins/plugin-kernel-adapter.ts`。它接收冻结会话计划和宿主提供的实现清单，在执行任何实现之前完成严格匹配：

- 每个计划模块必须恰好有一个实现。
- 缺失、额外和重复实现都会返回结构化启动失败。
- 插件 ID、插件版本、等级、模块 ID、API 版本、runtime 和固定激活语义必须全部一致。
- 传输计划会重新严格捕获并规范排序；访问器、稀疏数组、额外字段和原型伪装会被拒绝。
- 输出只包含冻结的绑定清单，不提供替换、重载或卸载入口，也不会执行或深度冻结宿主拥有的实现对象。

该适配器属于可信应用宿主，不属于插件作者 SDK。内部模块的真实 Catalog 编译和第三方 Wasm 的签名、摘要、字节边界校验继续由对应宿主负责；绑定适配器只保证“计划声明”和“交付实现”一一对应，避免把具体音乐模块耦合进平台。

当前基础合同已经完成，位于 `plugins/plugin-package-contract.ts`、`plugins/plugin-sdk.ts` 和 `plugins/plugin-platform.ts`。本切片没有适配任何吉他、调号或其他业务组件；它们在平台合同稳定后分别接入。

现在第一方业务组件可以并行开发。组件必须通过统一插件包声明应用贡献和 Kernel 模块，并把具体实现交给可信宿主绑定；组件不得直接写入平台目录、持有 Kernel Catalog 或自行实现启停生命周期。

## 安全原则：禁止热插拔

```text
configuring
  → restore desired plugin set
  → validate and create immutable session plan
  → running (locked until process restart)
```

所有应用组件和 Kernel 模块都遵循相同规则：注册、启用、停用、安装、卸载、升级和执行域变更只能发生在启动配置阶段。进入工作台后，当前会话的插件 ID 集合、UI 贡献拓扑和 Kernel assembly plan 全部冻结。运行中的启停请求只保存为下次启动配置，并明确标记 `restartRequired`；它不能卸载当前 View、Command、交互、服务或 Kernel 模块。

`always` 表示强制随产品装配，`user` 表示用户可以在启动前配置。`user` 不表示允许运行时激活。应用仍可修改普通业务设置，但设置不得借机改变组件拓扑或加载新的可执行代码。

未进入本次启动计划的 `user` 插件只保留经过校验的 Manifest、安装状态和下一次启动意图，不安装到应用宿主，不注册组件、View、Command、交互、服务、乐器描述或播放输出，也不进入 Kernel assembly plan。这样，禁用插件的可执行对象不会参与本次进程，也不会与已启用插件产生注册冲突。启动后的启用请求仍只改变下一次启动计划。

平台不再向应用代码暴露可变的 `UiPluginHost`、`UiPluginCatalog`、组件注册表、Projection 注册表或交互注册表。应用只能获得冻结的只读目录，无法绕过平台在运行中注册或删除贡献。

## 启动中心

软件启动后先进入一个由应用外壳拥有的轻量启动中心。启动中心本身不是插件，也不能被插件替换。它负责：

1. 新建乐谱。
2. 选择并打开已有文件。
3. 查看插件 ID、版本、来源、等级、兼容性和诊断。
4. 配置下一次工作台会话启用的用户插件。
5. 在装配失败时进入安全模式或恢复上一次可用配置。

```text
trusted application shell
  → manifest-only discovery and validation
  → launch center (new / open / plugin configuration)
  → PluginStartupController.prepare()
  → PluginStartupController.launch()
  → immutable PluginSessionPlanV1
       ├─ application contributions
       └─ kernel assembly plan
  → full workbench
```

启动中心只编排流程，不拥有插件运行机制。新建和打开文件仍由文件/工作区服务处理；插件配置仍由唯一的 `PluginPlatform` 处理。因此不会形成第二套插件生命周期。

`plugins/plugin-startup-controller.ts` 已提供启动中心所需的无界面控制器：先恢复持久化配置，再允许用户调整，最后只生成一次冻结的会话计划。具体启动中心窗口和桌面目录发现属于后续应用外壳工作。

控制器支持 `normal`、`safe` 和 `last-known-good` 三种启动模式。三种模式都只调用一次 `PluginPlatform.start()` 并生成同一种冻结会话计划：`safe` 在本次进程省略全部 `user` 插件，`last-known-good` 使用上一次稳定会话的插件集合。两者都不修改用户保存的下一次正常启动配置，也不允许运行时装载插件。

启动控制器在装配前持久化 `launching` 标记，完整工作台稳定后由应用外壳调用 `markStable()` 保存实际成功的正常会话插件集合。如果下一次启动仍看到 `launching`，说明前一次没有越过稳定点：有成功基线时默认恢复该基线，没有基线时默认安全启动。恢复会话稳定后仍保持 `recovery` 状态，避免下一次再次自动尝试原故障配置；用户调整插件或显式选择正常启动并成功后才清除恢复状态。安全会话不会覆盖成功基线。

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
  → 在启动前确定激活集合
  → 冻结会话计划
  → 根据固定集合解析 View / Command / Extension
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
- 用户插件在 `start()` 前配置；`start()` 后的启停只影响下次启动，不改变当前 View 和 Command。
- 扩展点或组件冲突只隔离失败插件，并产生结构化诊断报告码。
- 桌面诊断日志采用有界轮转文件；前端读取时重新校验记录字段、数量和标识符，不信任 IPC 泛型声明。
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
- 平台已提供 `restoreActivation()`，可以一次性从持久化配置恢复全部用户插件的启动配置；未知插件意图
  由持久化层保留，常驻插件不会被关闭。恢复发生在 `start()` 前时进入本次会话；恢复发生在 `start()` 后
  时只生成下次启动配置，不改变当前会话。
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
  启用意图；常驻插件仍由平台强制保持启用，存储端口不能关闭它们。运行期间修改该文档只会设置
  `restartRequired`。
- 浏览器开发宿主已提供该端口的 localStorage 适配器，损坏的 JSON 会隔离到 invalid 键；桌面端仍等待
  Tauri 配置合同确认后接入，浏览器适配器不会成为桌面配置来源。
- 新增 Manifest 预检目录，宿主可以在交给平台安装前验证 API 版本、能力、Projection 和重复 ID；预检只
  接受精确纯数据对象和密集数组，拒绝访问器与额外字段，并保存分层冻结的规范副本，不保留目录扫描方的
  可变对象。预检不加载或执行任何插件模块。
- 网页前端预览在 React 挂载前预检已打包的第一方 Manifest，并从 localStorage 恢复插件设置与启用状态。
  浏览器开发宿主已经持久化插件启用意图、插件设置和启动恢复状态，并把损坏的 JSON 隔离到独立键；网页端不会扫描目录或执行外部脚本。
- 播放输出已经成为 SDK 的功能型贡献。内置合成器由“播放输出”插件注册，播放器只消费本次会话计划中
  已启用插件提供的输出；输出插件未进入启动计划或装配失效时会回退到内置合成器。输出引擎只接收标准化 MIDI、开始时间和时长，
  不接触乐谱 Core、React 状态或 Tauri DTO。
- 乐器描述已经成为 SDK 的只读能力贡献。乐器插件可以声明稳定乐器 ID、名称、乐器族、支持的谱式、
  音符控制扩展和播放音色配置标识；平台负责清单一致性、重复 ID 隔离和启停解析。乐器描述不能覆盖
  内核提供的移调、绝对音高或乐谱事实。同一插件在下一次启动未启用时，它的乐器描述和高级音符控制会一起退出组合。

阶段验证结果：插件平台、SDK 与可信 Kernel 绑定定向测试 33 项、工作台完整测试 431 项全部通过，TypeScript 类型检查与生产构建通过。

### C：桌面插件发现

- Tauri 桌面端读取受控插件目录。
- 启动中心先只解析 manifest，确认兼容和用户选择后才装配模块。
- 将现有启动恢复端口接入桌面持久化，并由应用外壳在首个稳定工作台帧后调用 `markStable()`。
- 工作台运行期间不监视目录、不加载新模块、不卸载旧模块。

### D：隔离与发布

- 插件权限确认。
- 签名或可信来源校验。
- 插件升级、迁移和回滚。
- 插件市场或本地安装界面。

## 第一阶段验收

- 工作台仍能解析现有第一方插件。
- 用户插件未在启动计划中启用时不进入应用宿主，也不贡献组件、View、Command、交互、服务或扩展。
- 扩展点所有者总是先于贡献者安装。
- 插件冲突只产生结构化诊断，不阻塞其他插件。
- 组件不直接读取插件目录。
- 运行中的插件集合、组件拓扑和 Kernel assembly plan 不可变。
- 运行中的启停请求只能产生下一次启动配置和重启提示。
- 不修改 Rust、内核事务和现有布局格式。
