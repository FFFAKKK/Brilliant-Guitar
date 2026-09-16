# 前端模块化与 UI 插件边界

日期：2026-09-13；运行时分层于 2026-09-16 收口。

功能是否常驻、折叠或按需出现，不由组件职责类型决定；当前分级和任务归属见 [第一版操作频率地图](frontend-v1-operation-frequency-map.md) 与 [第一版前端交付清单](frontend-v1-delivery-checklist.md)。

## 类型与呈现

UI 插件只使用四个核心职责类型：

- `view`：显示或编辑一种文档视图，例如五线谱、六线谱、波形。
- `tool`：发起输入或操作，例如音符输入、播放控制、MIDI 输入。
- `inspector`：查看或修改选中对象的属性。
- `status`：紧凑显示文档、编辑或设备状态，不拥有相关业务状态。

`inline`、`panel`、`popover`、`dialog` 是呈现方式，不是业务类型。浮层可以承载新建乐谱或快捷选择，但不因此产生一个“新建组件类型”。导航栏、工作台容器和文件入口由宿主提供；插件可以贡献命令和格式能力，但不能替换宿主的基础骨架。

组件能力独立于职责类型声明，包括是否可移动、缩放、停靠、接受键盘输入和提供选区。新增功能优先增加角色、能力或公开命令，不为每一个功能再增加新的类型。

每个组件同时声明一个可扩展的点分领域，例如 `notation.editing`、`editing.history`、`view.navigation`、`playback.transport`。领域用于组织和发现组件，不决定组件放在哪里，也不形成封闭枚举；插件可以在自己的命名空间下增加领域。`rendersPreview`、`mutatesDocument`、`selectionAware` 等能力标签用于表达跨类型特征，因此带音符预览的编辑工具仍然是 `tool`，无需创造“视觉编辑混合类型”。

## 层边界

```text
Core 音乐内核
  ↑
应用服务与文档命令
  ↑
宿主适配与文件服务
  ↑
UI 工作台与组件注册
  ↑
UI 插件
```

- Core 拥有乐谱、命令、历史和校验，不知道 React、CSS、文件选择器或插件 UI。
- 应用服务组合用户流程，例如创建、属性修改、保存和导出。
- 宿主适配负责 Native、文件系统、音频和 MIDI 设备。
- UI 工作台负责插槽、布局、生命周期、焦点、反馈和命令连接。
- UI 插件负责自己的显示和交互，只能读取公开状态并发出公开命令。

插件不直接修改 Core 对象，不创建第二份乐谱，不拥有独立撤销栈，不绕过应用服务写文件，也不通过 DOM 或内部变量调用其他插件。

### UI 工作台内部结构

“UI 工作台与组件注册”不是一个巨型 React 组件，正式拆为三个职责：

```text
WorkbenchRuntime（无固定外观）
  ├── commands：统一命令注册、启用状态和快捷键路由
  ├── operations：异步操作生命周期和恢复状态
  ├── feedback：结构化问题分发和内存诊断
  ├── focus：布局变化后的焦点恢复
  └── components：插件权限与生命周期隔离

WorkbenchShell（几何外壳）
  └── 导航位置、中央工作区、共享停靠区和分隔线

UIPluginHost（组件宿主）
  └── 读取逻辑定义与视图贡献，将组件挂载到允许的插槽
```

`WorkbenchApp` 只负责应用装配：创建应用服务、声明内置命令和把已注册贡献交给外壳。菜单、快捷键和组件按钮必须执行同一个命令 ID；组件不能再自行安装全局键盘监听来复制保存、历史或缩放能力。

### 启动期 UI 插件装配

分层固定的是宿主机制和依赖方向，不是功能清单。第一方功能也通过 `UiPluginManifest` 和 `UiPluginManager` 安装：

```text
WorkbenchCapabilityRegistry
  → UiPluginManager.install(manifest + compiled binding)
  → UiComponentRegistry
  → UiComponentHost / SharedDock
```

清单声明插件身份、API 版本、运行时、所需宿主能力以及贡献的组件、视图和命令。插件管理器在改变注册表之前完成能力、编译绑定、组件与命令唯一归属、视图声明校验，因此失败安装不会留下部分组件。编辑历史和谱面缩放的命令定义已经由各自插件贡献；`WorkbenchApp` 只合并宿主命令和经过校验的插件命令。当前只允许随应用编译发布的 `internal-module`，安装集合在工作台启动前确定；第三方代码加载、运行时热插拔、插件市场和授权界面后置。

组件通过两类接口接入：

- `UiComponentDefinition` 描述身份、职责、插槽、能力和权限，不携带具体视觉。
- `UiComponentViewContribution` 提供标签、图标和 React 呈现；它必须对应一个已安装的逻辑定义。

React 视图只能通过 `UiComponentHost` 暴露的宿主上下文请求布局、焦点和命令。`executeCommand` 会先核对 `UiComponentDefinition.permissions.commands`，再进入 `WorkbenchCommandRouter`；因此菜单、快捷键和组件按钮共享命令实现，同时保留组件权限边界。

应用服务可以接收收窄后的 `WorkbenchTaskRuntime`，使用统一异步状态与问题通道；它们不反向读取菜单、停靠区或组件 DOM。领域规则仍只通过 Core 公共契约执行。

## 最小接口

`src/ui/plugin-contract.ts` 定义 `UiComponentDefinition`、`UiComponentContext`、`UiCommandDispatcher` 和 `UiComponentInstance`。组件声明自己的 `slots`、`presentation`、`capabilities` 和 `permissions`；工作台通过 `UiComponentRegistry` 负责注册、查询、卸载和生命周期更新。

内置组件使用与外部插件相同的注册合同，工作台通过共享注册器查询后装配实际渲染器：

- `notation.staff-view` → `view` / `notation.score`
- `notation.note-input` → `tool` / `notation.editing`
- `notation.history-control` → `tool` / `editing.history`
- `notation.paper-zoom` → `tool` / `view.navigation`

文件操作使用独立的文档命令和宿主文件服务。UI 菜单或对话框只是这些命令的入口，文件格式插件则通过独立的格式提供者合同接入。

这份边界只定义 MVP 所需的稳定骨架，不提前实现插件市场、动态安装、主题编辑器或完整自由布局系统。

## 共享停靠区与空间适配

工作台固定提供上下左右四个共享停靠区；多个已审核、可停靠的组件可以在同一个区域按顺序登记，由工作台切换当前组件。两个明确声明左／右配对的小工具在空间充足的水平停靠区也可同时显示；空间不足或组合不满足条件时回到图标入口或切换。组件不因此变成各占一条侧栏的独立窗口；独立浮动窗口属于后续布局能力。

停靠区负责尺寸边界、展开与收起、区域内组件切换和焦点恢复。无样式组件宿主传递区域、呈现方式和实际尺寸；具体组件自己决定完整、换行与图标形态，保留命令与音符数据的既有权威来源。小窗口的自动窄栏可以通过组件图标打开完整操作，用户主动收起整个区域则通过区域开关恢复；两种状态不能混淆。

当前已把五线谱、音符控制、谱面缩放和编辑历史作为四个第一方 UI 插件装配。旧的重复音符属性检查器登记项已经移除；`inspector` 类型仍可供未来非音符对象的属性视图使用，具体实例须单独审核。

所有谱面 `view` 的记谱正确性优先于美化；五线谱、六线谱及其他谱表分别核对其适用规则，再复用纸张与视口公共逻辑。依据与当前参数见 [谱面组件的记谱与排版依据](notation-engraving-principles.md)。
