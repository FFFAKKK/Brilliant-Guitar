# 布局操作的稳定承载与开关反馈

日期：2026-10-07。细化用户已授权发送的按钮正式接线和框架侧栏开合两项；本轮用户又明确要求侧栏开关按钮有动画，排布不得带动整块设置页面。

## 已纠正的审阅承载错误

原`animation-review.html?actualLayout=1`的fixture将`root.style.width`绑定`accepted().rightWidth`，均衡260/紧凑230会使整块设置内容变窄、重新居中。这是演示层额外绑定，并非宿主动画需要。已删除该绑定：承载宽度由固定页面CSS决定，命令只更新接受状态、缩略图和控件。手动调整尺寸仍更新区域数值，不调整演示承载自身。

不借这个修复重写宿主区域尺寸命令。正式布局的真实区域宽度仍由已接受的几何拥有；不得为了制造动画而额外改变设置页容器、标题、控件位置或尺寸，也不得将这处错误的fixture绑定移植到正式页面。

## 私有布局开关动画已备好

`createWorkspaceLayoutVisual.attachMotion`新增独立可选`toggleTransition:false`。仅启用时，由`workspace-layout-toggle-motion.js`绑定4个按钮内部装饰节点：`toggle:top/left/right/voice`，intents仅`content-transition`，播放仅改变opacity；没有宽高、缩放、位移、引擎或新命令。

每个按钮的一层同时容纳蓝色面与亮图标：进入160ms、退出120ms（连续）；聚焦180/120ms，静稳100/80ms。参数独立导出`LAYOUT_TOGGLE_EMPHASIS`，不改原三项共享recipe对象。按钮语义与尺寸控件即时接受，亮度才渐变。静止时恢复精确图标呈现；反向/旧失败/隐藏/resize/释放有记录门禁。原tile接管时display:none，不让hover复活第二个蓝底。

正式工程最小增量：

```js
import { LAYOUT_TOGGLE_EMPHASIS } from "./workspace-layout-motion-recipes.js";
// 与已有shape/selection共同声明；不新增公共intent或身份。
definitions["content-transition"] = LAYOUT_TOGGLE_EMPHASIS;
permissions.animations = ["shape-transition", "selection-transition", "content-transition"];
view.attachMotion(({ targets }) => ctx.motion.bind(targets), {
  shapeTransition: true, selectionTransition: true, toggleTransition: true, onIssue,
});
```

布局cell共10个局部装饰目标（5+1+4），不是给布局插件外壳许可。框架顶部/rail的侧栏开关由框架所有者在自己的受限范围内提供同样的局部状态反馈；布局作者不绑定这些按钮。公共捕获、预算、生命周期和生成继续由既有工程会话负责。

## 稳定体验验收

- 排布改变时，审阅承载页、布局标题、缩略图外框、滑条/数值框、区域按钮和排布按钮的矩形逐帧固定；只缩略图内部形状、控件值与被操作的局部视觉变化。
- 开关蓝色与亮图标同步，不动画化输入值、disabled语义或点击命中范围；重复/反向不抖动、不重挂视图。
- 键盘/程序/异步与直接尺寸输入即时；窗口和隐藏/恢复不能补播旧动画；宿主关闭/减少策略优先。
- 手动resize可以调整受操作区域的容量，这是明确尺寸操作；不能为排布/点击反馈顺带改变无关设置内容的承载。
- 真正侧栏开合验收仍分开，保持工作台不遮挡、谱面四分量固定。样稿不冒充正式接线。

新证据使用`evidence/layout-control-stability-20261007/`，不覆盖上一轮v3。专项测试`workspace-layout-toggle-motion.test.js`4项通过；当前整包562/562通过，日志为`package-tests-current.log`。

原动画页实际视图的浏览器稳定性验收69/69通过，累计2,518个绘制帧。1440×900/DPR1、1280×720/DPR1.25、1920×1080/DPR2三个窗口中，24个设置/控件/工作区外框的x/y/width/height漂移全部为0；四开关有可观察的中间透明度，反向落到最新状态，键盘和关闭策略即时。记录为`verified/report.json`，截图为`verified/toggle-intermediate.png`与`verified/stable-settings.png`。

使用保存的旧fixture在当前环境重新复现：设置内容横向位移15px、宽度变化30px；缩略图外框高度变化12.859375px，并带动下方控件。失败保存在`before-reproduced/report.json`，不覆盖或改成通过。代码审查的Before/After/Why表格见`evidence/layout-control-stability-20261007/review.md`。

上述稳定承载与四开关记录来自原页`actualLayout=1`，不等同于正式入口已启用。工程会话已收到正式按钮与框架开合要求，并确认正在补齐四开关及顶部/rail反馈。正式页面另行联合验收。

默认无参数原动画页重新回归28/28通过，使用原`tools/motion-review-browser.cjs`，新记录为`default-animation-regression/browser.json`；没有覆盖历史28项结果。六个本轮源/测试/审阅脚本的Node语法检查通过，记录为`syntax-current.log`；`git diff --check`通过。
