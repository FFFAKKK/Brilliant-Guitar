# 插件开发就绪度与 UI 组件审计

审计日期：2026-09-16

## 结论

当前软件可以继续插件业务开发，但应区分三件事：

1. **Rust Kernel/领域插件可以继续开发。** 现有事务、历史、模块装配、WASM 和回归基础足以支持第一方插件推进。
2. **现有四个第一方 UI 插件可以继续打磨。** 五线谱、音符控制、编辑历史和谱面缩放不需要推倒重写。
3. **不建议立即大量新增 UI 插件或发布第三方 UI SDK。** 当前布局、注册和命令所有权已经真实工作，但 React 视图和数据仍由 `WorkbenchApp` 集中组装，read 权限尚未成为真实的数据边界。

推荐“保留现有外观和业务能力，定点重构插件装配边界”，而不是重写整套 UI。

## 当前软件状态

- 桌面生产链已经是 `React -> Tauri invoke -> Rust application service -> Rust Kernel`。
- Tauri 已接管 Rust session、原生文件、原子保存、恢复、关闭流程、CSP 和 bundle 配置。
- Browser/Vite/Node 链路保留为开发和合同回归适配器，不再是桌面生产依赖。
- Workbench 113 项测试通过，TypeScript 检查和 Vite 生产构建通过。
- UI 已有命令路由、操作状态、结构化反馈、焦点恢复、布局持久化、错误边界和插件清单验证。
- 新 Rust 桌面应用服务已经打通，但 `apps/desktop/src-tauri/src/application/mod.rs` 约 1200 行；不阻塞当前插件开发，新增更多编辑用例前应按 session、edit、projection 和 document lifecycle 拆分。
- Rust Kernel 当前存在另一个工作者未提交的 classification cache/history 优化；插件工作不应覆盖或回退这些修改。
- 当前 shell 找不到 `cargo`，本轮没有重新运行 desktop crate 和 Rust workspace 测试。
- VexFlow/Bravura 构建 chunk 仍大于 500 kB；不阻塞插件开发，后续再做按需加载。

## UI 插件体系成熟度

### 值得保留的部分

- `UiPluginManifest` 校验身份、API 版本、宿主能力和贡献 ID。
- `UiPluginManager` 原子安装插件，防止组件、命令和视图归属冲突。
- `UiComponentDefinition` 控制 slot、presentation 和布局能力。
- `UiComponentHost` 提供尺寸、焦点、移动、隐藏和命令授权。
- 布局状态、共享 Dock 和错误边界不依赖具体业务组件。
- History 和 Paper Zoom 已通过统一命令路由执行操作。

这些工作台基础设施不应重写。

### 需要收口的问题

#### 1. 插件不是自包含模块

`FIRST_PARTY_UI_PLUGINS` 只注册定义和 manifest。React 视图由 `builtInViewContributions()` 在外部提供，`WorkbenchApp` 仍直接创建 `StaffView`、`NoteInputComponent` 和投影数据。

因此新增插件仍需修改中央 `WorkbenchApp`。

#### 2. Read 权限可以被 props 绕过

`permissions.reads` 只裁剪通用 `UiComponentContext`；实际 React 视图可由 composition root 接收任意 props。Staff 和 Note Input 的数据、controller 都由 `WorkbenchApp` 直接传入。

因此 read permission 目前更接近声明文档，而不是运行时能力边界。

#### 3. 存在两套 UI 生命周期

`UiComponentRuntime.mount/update/dispose()` 有完整测试，但生产应用没有调用；第一方定义全部使用空 `mount()`。实际生命周期由 React 和 `UiComponentHost` 管理。

应选择 React 作为内部 UI 插件的唯一生命周期模型，删除或隔离未使用的 imperative 模型。

#### 4. 命令权限仅部分生效

History 和 Paper Zoom 使用 `executeCommand()`。Note Input 直接调用 `useNoteOverview` controller；Staff View 通过传入 callback 完成选择和输入。它们 manifest 中声明的写命令尚未成为真实 command contribution。

#### 5. 插件读模型不可扩展

`UiComponentContext` 固定为 `session / selection / input`。吉他插件需要的弦、品位、调弦、演奏法和 availability 尚无类型安全的 projection provider。

## 能否继续插件开发

### Rust Kernel / 领域插件：可以

可以立即继续：

- 吉他领域 manifest、扩展 DTO、commands、effects、validate 和 classify。
- 通过 Module SDK、integrated session 和受限 WASM 建立真实业务闭环。
- 为插件缺失、版本不兼容、只读 availability 和无损数据保留增加回归。
- 提供面向 UI 的收窄 projection DTO，不把完整 Core 文档暴露给前端。

限制：

- 不覆盖当前工作区正在进行的 integrated engine 优化。
- 插件写入必须经过公开 command/effect/validation 路径。
- 当前定位仍是第一方、随应用构建的插件；第三方市场、签名和热加载尚未成熟。

### UI 插件：有限度继续

可以立即做：

- 修复现有插件问题，改善视觉、响应式和可访问性。
- 在稳定应用命令之上扩展现有插件功能。
- 开发一个新内部试点插件，验证新合同。

暂不建议：

- 一次新增大量 UI 插件。
- 宣布当前 API 是稳定第三方 SDK。
- 支持运行时下载和执行任意 React/JS 插件。
- 继续把每个插件的 hook、投影和 React 元素堆入 `WorkbenchApp`。

## 推荐重构

### P1：形成自包含 React 插件模块

内部插件应一次贡献 manifest、components、views、commands 和 projections：

```ts
interface InternalUiPluginModuleV2 {
  manifest: UiPluginManifest;
  components: readonly UiComponentDefinition[];
  views: readonly UiComponentViewContributionFactory[];
  commands: readonly UiCommandContributionFactory[];
  projections: readonly UiProjectionContribution[];
}
```

### P1：建立类型化 Projection Registry

建议按 ID 提供收窄读模型：

```text
notation.staff-view  -> notation.staff.read-v1
notation.note-input  -> notation.input.read-v1
editing.history      -> editing.history.read-v1
view.paper-zoom      -> view.paper-zoom.read-v1
guitar.fretboard     -> guitar.fretboard.read-v1
```

宿主按 manifest 授权并提供对应类型的只读投影，让 `permissions.reads` 成为真实边界。

### P1：所有写操作统一为命令

- Note Input 的追加、属性修改、删除应走稳定应用命令。
- Staff 的选择、定位和输入请求应走选择/编辑服务端口。
- 菜单、快捷键和组件按钮继续执行相同 command ID。

### P1：缩小 WorkbenchApp

`WorkbenchApp` 最终只负责创建宿主服务、安装插件、提供 Shell/Dock/Overlay 和挂载贡献，不再直接 import 每个插件组件或构造插件 props。

建议提取 `ScoreWorkbenchController`、`PluginComposition` 和 `WorkbenchNavigationComposition`。

## 现有组件建议

### 保持，仅做小改

- **HistoryControlComponent**：职责小、props 稳定，是当前最接近目标插件形态的组件。
- **PaperZoomControl**：边界清楚，适合作为插件 V2 第一个样板。
- **SharedDock / DockLayout / UiComponentHost**：测试充分，不应随插件重构重写。

### 定点重构

- **NoteInputComponent**：不要继续使用 `ReturnType<typeof useNoteOverview>` 作为 props；改为稳定的 `NoteInputViewModel` 与 `NoteInputActions`。`NoteInputPanel` 本身可保留。
- **StaffView**：拆成 `StaffDocumentView`、`StaffInteractionLayer` 和 `StaffPluginAdapter`；保留 VexFlow renderer 与纸张布局算法。
- **useScoreInput / useNoteOverview**：把提交队列、冲突、重试和 command 构造移到应用 controller；React hook 只订阅状态和转发意图。
- **WorkbenchHostBridge**：后续可拆为 contract、browser adapter、tauri adapter，优先级低于插件装配。

## 推荐执行顺序

1. 保持当前 113 项 Workbench 测试和双宿主合同测试通过。
2. 用 Paper Zoom 做自包含插件 V2 样板。
3. 迁移 History，验证动态 enabled state 和 activity projection。
4. 引入类型化 projection registry。
5. 迁移 Note Input，建立稳定 view model/actions 并统一写命令。
6. 迁移 Staff View，分离渲染和交互层。
7. 缩小 `WorkbenchApp`，让它只做宿主装配。
8. 再开始正式 Guitar UI Plugin。

## 完成标准

- 新增内部 UI 插件不需要修改 `WorkbenchApp`。
- 插件模块同时拥有 manifest、view、commands 和 projection 声明。
- 插件不能读取未声明 projection，也不能执行未声明 command。
- 生产代码只有一套 UI 生命周期模型。
- Note Input 和 Staff 不再接收内部 hook 的完整返回值。
- 现有组件 ID、布局持久化和界面行为兼容。
- Browser 与 Tauri 两条宿主合同测试继续通过。
- 不改变 Rust Kernel 的事务、历史和插件语义。

## 最终判断

当前不是“必须重构完才能继续开发”，而是适合并行推进：Kernel 插件业务继续，现有 UI 继续迭代，同时先用 Paper Zoom/History 做小范围插件 V2 收口。完成样板后，再批量开发吉他 UI 插件会更稳，也会显著减少后续返工。
