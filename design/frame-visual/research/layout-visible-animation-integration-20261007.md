# 布局动画可见性修复与新增接线材料

日期：2026-10-07。接收对象为既有「布局插件正式化｜公开接口与动画宿主」会话，`01a1154a-5b73-72c2-a98c-7d965e781eaa`。用户已明确回复「允许发送这两项新增要求」；本材料与按钮/侧栏两项新增要求已经成功发送。原已授权的缩略图 shape 接线继续保留。

## 当前可见结果

用户指出真实 UI 缺少侧栏开合与均衡/紧凑选择动画。本轮确认：正式缩略图已接入五个 shape 目标，但排布时的容器尺寸变化会被强制 ResizeObserver 静态绘制打断；两个按钮本来只有即时选中态；真正侧栏仍直接 hidden。

本视觉会话已完成：

1. `src/shell/workspace-layout-preview.js`：指针接受后在下一帧测量已经更新的容器再播放；观察器也可作为首次布局后测量。相同几何观察不重复 place，不取消轨道；窗口 resize、尺寸直接输入、键盘/程序/异步、隐藏恢复和释放保留即时行为。没有延时补播或第二份业务状态。
2. `src/shell/workspace-layout-selection.js`：实际作者视图的可选选择窗口。一个 SVG rect 裁剪蓝色面与亮图标副本；副本无交互且 aria-hidden。原按钮 aria-pressed 先接受，视觉亮色随窗口移动。隐藏/resize/释放落地；旧完成/失败有记录门禁，绑定失败恢复静态。
3. `createWorkspaceLayoutVisual.attachMotion(bind,{shapeTransition:true,selectionTransition:true,onIssue})`：新的 selection 仅显式启用。默认 false；仅 shape 的正式登记继续五个目标，不擅自越权。绑定两个局部端口，同一实际布局 cell 下总计六个独占节点，不增加身份、注册器、命令或业务写入口。
4. 原 `animation-review.html?actualLayout=1`：消费同一实际视觉组件并用显式 review-only 执行器展示选择动画。不是第二个页面，也不代表正式接线完成。无参数原样稿保留。

## 第一项工程接线：实际排布选择

这是可直接审阅的最小增量，公共 selection-transition 已存在，不新增公共 intent。

布局声明引用两个作者对象：

```js
import { LAYOUT_PREVIEW_SHAPE, WORKSPACE_LAYOUT_ANIMATIONS } from "./workspace-layout-motion-recipes.js";

animations = { contractVersion: 1, definitions: {
  "shape-transition": LAYOUT_PREVIEW_SHAPE,
  "selection-transition": WORKSPACE_LAYOUT_ANIMATIONS["selection-transition"],
} };
permissions.animations = ["shape-transition", "selection-transition"];

// mount 中沿现有 ctx.motion，禁止 import fixture/coordinator/engine。
view.attachMotion(({ targets }) => ctx.motion.bind(targets), {
  shapeTransition: true, selectionTransition: true, onIssue,
});
```

新增目标只有 `arrangement:selection`，节点在当前 cell 内，intents 仅 selection-transition；请求只含 x/y。参数复用已认可选择 recipe：连续250ms、聚焦260ms、静稳即时。恢复默认是动作，窗口落到接受的 balanced，不增加第三个持续选中态。

需要补正式登记/空贡献/无 provider/权限拒绝/双实例/释放的集成测试，并在 ESM、classic file 与桌面生成入口确认六个目标及中间帧。生成与浏览器取证串行；不要手改 vendor。当前私有选择测试证明视觉边界，不能替代正式登记验收。

## 第二项工程工作：真正侧栏开合

此项属于框架所有者，不属于布局插件：布局组件只发原区域命令。`visual-workbench.js` 当前 render 直接修改四栏 hidden，`workspace-shell-geometry.js` 同步投影已接受几何，尚无框架呈现端口及退出保留流程。不能给布局 cell 外壳节点许可、绑定谱面或通过 CSS 绕过宿主。

视觉建议和验收要求：

- 先接受区域状态和最终几何，谱面四分量必须全帧固定；不动画化 grid track、宽高或缩放文字。尺寸拖动直接跟手。
- 框架从既有动画宿主取得自己的独占、受限局部目标和作者参数；四区域以各自边缘为方向，栏内内容进入约180ms、退出约120ms，位移不超过12px。背景保持低对比，无光效、白框或弹跳。
- 关闭立即失去交互、Tab 与可读性暴露；退出仅是框架呈现留存。最终 hidden/目标释放不能延后业务状态；快速反向接续当前呈现，不能重挂插件实例或复制插件输入内容。
- 有效工作台不能被保留的退出层遮挡。需由框架所有者确认安全的退出边界/保留策略；若现有几何无法保证，先缩减到边缘内局部淡出，不以全栏覆层凑效果。
- 可信输入来源与呈现上下文由宿主处理：从顶部命令、左右 rail、布局开关等路径发起的同一指针操作应表现一致；键盘、程序、异步、窗口/尺寸、隐藏恢复、减少/关闭即时。不能依赖布局插件访问外壳或另发动画命令。
- 权限与目标不得由低信任插件提供；无定义/无 provider 静态可用，故障回退和诊断沿原路径。公共边界方案及正式接线仍由工程会话设计和实施；本材料不宣称该项已经做完。

## 本轮验证

`evidence/layout-motion-visibility-20261007/verified-v3/report.json`：42项浏览器检查通过；三个视口/DPR，1024个绘制帧谱面位置/尺寸漂移0。包含真实正式页排布中间帧与反向、实际视觉样稿的选择窗口、亮图形同步、鼠标 hover 不复活第二个蓝底、键盘/关闭/系统减少。真正侧栏没有动画，不列为通过。

`tests/workspace-layout-preview.test.js`、`workspace-layout-selection.test.js`、`workspace-layout-motion.test.js`：24项通过。`verified/` 保留第一轮验证脚本等待方式/字段判断错误；`verified-v2/` 保留通过逻辑但截图发现 hover 旧底块复活的阶段；当前结果只用 v3。旧缩略图与 shape 接线封存不覆盖。

本轮直接整包测试552/552通过。生成资产与工程正式接线验收另行报告，不将直接Node测试当作生成入口验证。首次补跑旧动画页与改前探查期间遇到预览服务重启/连接拒绝，失败记录保留，不能当作代码回归或成功验收。

恢复预览服务后，原默认动画页在`evidence/layout-motion-visibility-20261007/original-review-v3/browser.json`通过28/28；startup/desktop生成检查也通过。工程已确认接下新增两项，选择与真实侧栏正式增量仍待其实现后联合验收。

视觉责任：上述作者 JS/CSS、原审阅页、视觉验收；工程责任：正式 plugin/page 声明接线、框架所有者端口/生命周期、公共宿主及生成链。未修改废弃真实产品 UI。
