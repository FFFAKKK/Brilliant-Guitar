# 内容样式与宿主边界

2026-10-02。总规划第 2 项的样式所有权基础已实施于 design/frame-visual。原 frame 和废弃 workbench 未由本批修改。计划见 style-boundaries-plan.md；当前文件描述已实现的代码，不代表真实浏览器视觉验收完成。

## 原问题与当前做法

原 base.css 的 button/input 重置、通用 focus 规则与 `* { animation/transition: none !important }`，scrollbars.css 的通配隐藏，以及 `.visual-shell button` 的悬停等规则，都会匹配后来装入的插件内部控件。只在外层加 .visual-shell 前缀不能解决后代控件被影响的问题。

现在逐节点区分样式所有权：内部 h 创建的框架节点带 data-frame-ui；组件宿主只标记外层 cell 与故障提示。普通插件通过原生 DOM 创建的私有子节点不带该标记。标记不继承、不递归传播，也不会在组件移动或恢复可见时补到其内部。

```text
框架侧栏/浮层/控件：data-frame-ui → 框架 reset 与皮肤
  └─ 宿主 component-cell：data-frame-ui → 承载几何与隐藏
       └─ 插件内容根：自己的命名空间
            ├─ 私有按钮/输入 → 自己的控件样式
            └─ 私有滚动容器 → 自己的 overflow 与阅读位置
```

通用重置、焦点圈、隐藏、动画关闭、滚动条隐藏和结构皮肤的通用 button/input 规则改用 :where([data-frame-ui]) 限定目标节点。:where 不增加原选择器 specificity，声明值与原 !important 保留。因此标记的框架控件沿用原样式，而普通插件控件不再被这些规则统一压平。框架私有类仍保留，插件应避免复用 frame/v- 等私有命名。

HTML/body 的窗口基线继续负责高度、margin、字体、颜色、color-scheme 与文档滚动条。#app 和 #overlay-root 只处理自身盒模型，不标记其子孙。纯静态 sidebar-review 目录使用 data-frame-document 显式保留文档盒模型 reset；运行入口没有此标记，不能把它放在承载插件的节点上。

## 内容作者合同

作者 CSS 必须限定在自己的命名空间根内。例如 .example-notes .notes-button，而不是全局 button、input、body、:root 或 *。目前平台没有 CSS 编译、自动前缀或任意样式的安全过滤；框架标记也不是权限边界。非遵约插件仍能主动修改同文档 CSS/DOM。本批不强制 Shadow DOM/iframe，不将所有权规则称为强隔离。

内容可使用以下稳定主题别名，原 frame token 值没有变化：

| 变量 | 用途 | 当前来源 |
| --- | --- | --- |
| --ui-font-family | 内容字体 | --font-ui |
| --ui-text-color | 主要文字 | --frame-ink |
| --ui-muted-color | 次要文字 | --frame-muted |
| --ui-surface-color | 内容表面 | --frame-surface |
| --ui-accent-color | 强调/选择 | --frame-selected |
| --ui-focus-color | 内容焦点 | --frame-focus |
| --ui-space-unit | 基础间距 | --gap |
| --ui-radius | 内容控件圆角 | --radius-s |

这些是可继承的样式变量，不是布局配置。字体、颜色与 color-scheme 的文档继承保持；插件可以在自己的根内覆盖。尺寸、页签、区域位置和排布仍由宿主与呈现层持有，不从 CSS 或标题猜测。普通插件直接创建的按钮采用浏览器默认控件样式，想融入主题时应主动使用上述变量。

```js
mount(element, ctx) {
  const content = document.createElement("div");
  content.className = "example-notes";
  const style = document.createElement("style");
  style.textContent = `
    .example-notes { color: var(--ui-text-color); font-family: var(--ui-font-family); }
    .example-notes .notes-button { padding: 8px 12px; border-radius: var(--ui-radius); background: var(--ui-accent-color); }
    .example-notes .notes-button:focus-visible { outline: 2px solid var(--ui-focus-color); }
    .example-notes .notes-scroll { overflow: auto; max-height: 120px; }
  `;
  ctx.onDispose(() => style.remove());
  const button = document.createElement("button");
  button.className = "notes-button";
  button.textContent = "检查";
  const click = () => ctx.execute("example.notes.inspect");
  button.addEventListener("click", click);
  ctx.onDispose(() => button.removeEventListener("click", click));
  content.append(style, button);
  element.append(content);
}
// example.notes.inspect 需由原声明贡献并授予此组件 permissions.commands。
```

style 节点的位置不会自动限制 CSS；上面的根选择器才是限制范围的作者约定。每项资源获得后即登记 ctx.onDispose，mount 后续失败仍会清理。与 mount 同生命周期的宿主外节点、订阅和后台任务也需显式登记，宿主不会自动发现任意 document.body 节点。

## 宿主交互边界

ctx 仍只有 execute/notify/onDispose，不增加 router、layout store、完整服务定位器或新的菜单/弹窗管理器。执行沿用既有权限，快捷键也没有扩大授权。菜单/弹窗请求能力留到后续受限宿主接口，由宿主持有层级、焦点返回和释放。

宿主拥有外层 cell 的位置、variant、可见性和生命周期；插件拥有自己的控件、滚动区域与内容状态。允许的跨区域移动复用同一个 cell，隐藏不卸载，最终释放或 mount 失败才清理私有资源。内层滚动容器应自行设置 overflow 与高度约束；原生滚动条不再由框架通配规则强制隐藏。

原 viewport/stage 测量服务、Shell 几何、焦点恢复与可见性合同保持。没有引入新的尺寸测量 API、浮层实现或布局编辑政策；这些仍按后续批次处理。

## 验证与影响

本批新建 7 项测试；全副本 137 项通过，包含同期布局工作新增的 4 项用例。本批 6 个 JS/CJS 文件通过 node --check；副本没有配置 CSS lint、JS lint 或 TypeScript 检查。新源码基线捕获 110 个文件与 10 个拟编辑原稿，证据在 evidence/style-boundaries。

验证范围包括：框架节点与私有子孙的标记区别；浮层控件 opt-in；新旧 h 的结构、属性与监听比较；三份 CSS 全部原声明值保留；通用规则目标限定；八个主题别名；真实平台注册与宿主的私有按钮、输入、滚动、移动、隐藏、权限及失败清理；原有 Shell/布局/键盘回归。

```powershell
$styleBatchTests = @(rg --files design/frame-visual/tests -g '*.test.js')
node --test --test-isolation=none @styleBatchTests
node design/frame-visual/tools/audit-style-boundaries.cjs
```

本批未修改几何常量、布局方法、内置内容、默认 Shell 结构或视觉 fixture，也没有默认装入样例插件。源码审计单独记录同期变化，不回滚并发工作。CSS 选择器和不可见的节点标记确实发生了修改；保留样式声明值与通过结构回归不等于已验证浏览器画面完全一致。

当前仍没有真实浏览器计算样式、像素、系统输入法或原生焦点验收。已有 file:// 访问拒绝未通过换协议或浏览器绕过。静态 CSS 检查不模拟 cascade，DOM 替身不执行排版；这些验收项明确保持待完成。

## 后续维护：布局样式拆分后的验证

以上验证数字和限制是 2026-10-02 批次记录。此后布局组件样式已拆到
`styles/workspace-layout.css`，部分布局控件也已改版。当前外壳样式保留
158 条原规则；旧快照包含组件的 187 条规则，不能再逐文件比较全部声明。

当前测试保留 base／scrollbar 的声明与所有权检查，另验证外壳剩余规则的
选择器、顺序和声明完全一致，并检查布局样式的组件命名空间及两个入口
的实际加载。普通插件控件不自动标记的生命周期回归仍然执行。

运行当前检查用 `npm --prefix design/frame-visual test`。上方历史 audit
命令只适用于对应冻结批次，后续不能运行它们覆写原报告来更新验收结果。
后续完整测试已达 350/350；记录和源文件对照保存在
`evidence/style-contract-followup/`，本轮未修改任何布局 CSS。
