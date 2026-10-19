# 跨入口几何一致性复核（2026-10-06）

## 复核范围

本轮只检查备份视觉框架的三个入口：

- `runtime-preview.html`：可复用运行时外壳和核心谱面 view。
- `structure-preview.html`：完整结构场景与视觉状态夹具。
- `layout-collaboration-review.html`：布局协作审阅入口。

真实产品 `apps/workbench` 仍不在范围内，也没有被读取、参考或修改。

## 发现的底层风险

结构夹具和运行时外壳原先分别写入 `--left-w`、`--right-w`、`--top-h`、
`--voice-content` 等变量。当前数值相同，但这类重复实现会让后续窗口适配或成对尺寸修正只落在一个入口，重新产生滑条、区域高度和谱面工作区错位。

## 已完成修正

新增 `src/shell/workspace-shell-geometry.js`，由 `applyWorkspaceShellGeometry(shell, state)` 统一投影：

- 开合状态只决定可见宽度和可见上栏高度。
- `leftWidth/rightWidth` 与 `topHeight/voiceHeight` 始终作为已接受容量保留。
- 下侧栏内容高度统一由 `voiceHeight - voiceTitle` 计算。
- 结构夹具和运行时外壳共享同一实现。

三个入口继续加载同一套外壳和布局组件样式；页面级滚动由外壳入口统一隐藏，内部滚动仍由工作台或内容容器负责。

## 验收结果

- 新增共享几何投影测试：开合、容量保留、底部标题扣除和非法输入。
- 新增跨入口静态合同：三个入口的样式加载、两个外壳实现的共享几何投影、页面级滚动归属。
- 新增工作台视口回归：左/右宽度变化、上/下横带变化均通过原生滚动补偿保持谱面 `x/y/width/height`；测试夹具会扣除 `scrollLeft/scrollTop`，避免把内部滚动误判为谱面漂移。
- 布局组件去除局部 `transition` 声明，选中态由状态立即投影；新增四行区域控件合同，固定图标开关、滑条、数值输入、`px` 和恢复按钮的统一结构，并验证关闭区域时输入确实 disabled。
- `npm test --prefix design/frame-visual`：当前 `386` 项全部通过。
- 本轮没有宣称真实 Windows 100/125/150/200% 系统缩放或最终视觉批准快照已完成；这两项仍需独立验收。
