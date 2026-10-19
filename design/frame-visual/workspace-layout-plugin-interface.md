# 工作区布局 UI 小插件接口（当前 v1）

日期：2026-10-05。状态：已在备份视觉框架运行时独立登记；不是正式 SDK 发布，也不代表真实产品 UI 已接入。

## 结论

“工作区布局”现在作为 UI 插件包中的独立小插件 `frame.layout` 注册。它拥有自己的页面贡献 `frame.layout.page`，与 `frame.builtin` 平级登记。它不是左栏普通模块，也不进入普通内容库；视觉上仍由框架承载，插件内部只负责布局设置页面的内容和受限协作。

正式运行时的装配顺序是：

```text
frame.builtin  →  frame.layout  →  外部功能插件
```

旧视觉夹具仍可通过 `createBuiltinPages(..., { includeLayout: true })` 生成 `frame.builtin.layout` 的可变兼容组合。这个组合只服务历史测试和旧基线比较，不是正式运行时的插件身份。

## 当前声明

```js
createWorkspaceLayoutPlugin(layout, contents, actions)
```

它内部使用当前 v1 的 `defineUiPlugin`：

```js
{
  namespace: "frame.layout",
  ui: [{
    id: "frame.layout.page",
    kind: "page",
    title: "工作区布局",
    icon: "layout",
    order: 3,
    slots: ["right"],
    permissions: {
      commands: [
        "frame.workspace.region.toggle",
        "frame.workspace.resize",
        "frame.workspace.arrange",
        "frame.workspace.layout.begin",
        "frame.workspace.layout.finish",
        // 目录存在时再加入侧栏内容管理命令
      ],
    },
    mount(element, ctx) { /* 由框架视觉页面挂载 */ },
  }],
}
```

布局插件的三个输入是宿主创建的受限只读端口：

| 端口 | 能读取什么 | 不能得到什么 |
| --- | --- | --- |
| `layout` | 四栏开合、尺寸、排布、当前页、调整状态、限制 | store 写方法、完整 router、谱面私有 DOM |
| `contents` | 稳定组件 id、允许位置、当前位置、启用状态、顺序和修改摘要 | 其他插件实例、mount、权限写方法、私有状态 |
| `actions` | 布局页获准命令的存在、可用、勾选、快捷键和拒绝原因 | `run`、注册能力、其他插件命令名单 |

布局页面发出的动作统一使用自己的 `ctx.execute(command, payload)`。宿主会再次检查权限、编辑会话、目标区域和容量；按钮被禁用不等于安全边界。

## 宿主与布局插件的责任边界

宿主负责：

- 唯一工作区状态、四栏几何、谱页居中和不遮挡；
- 内容编排的唯一写入者、实例复用、焦点和生命周期；
- 命令权限、编辑事务、容量预算、拒绝原因和释放；
- 普通模式与布局编辑模式的策略；
- 外部插件面板的挂载、移动、隐藏和恢复。

布局插件负责：

- 将宿主投影呈现为“工作区布局”页面；
- 读取内容目录和动作状态；
- 发起区域、尺寸、排布、进入/结束编辑、移动/启用/排序等受限请求；
- 在编辑中展示差异、容量和拒绝反馈；
- 在自身释放时停止端口订阅。

布局插件不负责具体插件按钮、图标、配色、谱面业务、内核事务、持久化或其他插件私有 DOM。区域开合、尺寸和整体排布仍可随时操作；内容排列、加入/移出和排序由布局组件内的统一编辑事务管理。

## 其他插件如何协作

其他插件不直接调用布局插件实例，也不写布局 store。它只需声明自己的稳定 UI 贡献，例如：

```js
defineUiPlugin({
  namespace: "example.notes",
  ui: [{
    id: "example.notes.panel",
    kind: "panel",
    title: "笔记",
    slots: ["left", "right"],
    defaultSlot: "right",
    defaultEnabled: true,
    mount(element, ctx) { /* 私有内容 */ },
  }],
});
```

宿主把它转换为 `contents` 的只读记录。布局插件看到的是稳定目录投影；用户在布局页面移动它时，宿主复用原实例，不重新 mount，不丢失输入、阅读位置或插件私有状态。其他插件若需要“请求布局调整”，应由宿主提供明确命令或领域端口；不能反向依赖 `frame.layout.page` 的 DOM 或私有函数。

## 与新版插件规划的关系

当前布局插件已经符合“独立装配、公开受限接口、独立生命周期”这三个独立小插件条件，并复用了现有平台，没有创建第二套插件系统。

但它仍使用 v1 字段 `namespace / ui / permissions / mount`。规划中的共同身份、插件版本、宿主兼容声明，以及可选的功能、输入、绘制、动画、设置、菜单和快捷键贡献矩阵，尚未开放到运行时。当前不能把本文件中的端口名称当作正式 SDK 稳定字段，也不能据此声称真实内核、持久化或跨进程协作已完成。

可选贡献缺失时，布局插件按空端口或空目录处理；宿主必备身份、页面 id、权限和挂载定义缺失则拒绝安装。正式共同声明的空值规则和版本迁移，待工程会话定版后再映射进 `defineUiPlugin`。

## 当前验证与剩余工作

已完成：

- 正式运行时独立注册 `frame.layout`；
- 旧兼容组合可变，避免历史夹具修改冻结定义；
- 布局页面的观察、权限和释放路径覆盖；
- 全套 `design/frame-visual` 测试 347 项通过。

仍待工程会话完成：

- 共同必填声明、版本/兼容字段和空值规范的正式实现；
- 受限读取端口的公开稳定合同、预算和修订号；
- 真实插件替换中性试点，以及内核、持久化、IPC 的接线；
- 真浏览器/Windows 系统缩放下的视觉容量、焦点和谱页几何验收。
