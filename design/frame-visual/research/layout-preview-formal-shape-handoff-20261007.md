# 已认可缩略图形变 · 正式工程接入

日期：2026-10-07。用户认可原动画页第一批，并询问应用到备份 UI。接收会话：**布局插件正式化｜公开接口与动画宿主**，`01a1154a-5b73-72c2-a98c-7d965e781eaa`，Local。用户随后明确授权“可以，那你发吧”；已将本接线材料和实施要求发送到该既有工程会话，正式形变尚待其实施与联合验收。

## 已应用与尚缺能力

- 实际 `createWorkspaceLayoutVisual()` 已使用新缩略图，四区域开合、尺寸、排布与宿主接受状态同步。原滑条的动态容量和独立偏好不变。
- 作者参数 `LAYOUT_PREVIEW_SHAPE` 和纯投影 `projectLayoutPreview()` 被实际视图及原审阅页共用。正式页面不依赖 fixture/coordinator/引擎。
- 正式 `ui-motion/1` 目前只支持 content-transition、selection-transition、drag-settle；from/to 没有矩形尺寸，driver/provider 未支持裁剪轨道。
- 当前正式页继续原四个 content-transition 目标，几何即时投影。**连续形变没有在正式页面启用**。不能直接把 review-only 合同/协调器复制进去或借 CSS 偷跑。

## 视觉提供的具体接口

`src/shell/workspace-layout-visual.js` 保留原调用，增加私有显式选择：

```js
// 只在工程完成正式 shape 许可并登记之后启用。
view.attachMotion(({ targets }) => ctx.motion.bind(targets), {
  shapeTransition: true,
  onIssue: reportPresentationIssue,
});
```

新分支只绑定 `shape:top/left/right/voice/stage` 五个组件内部节点，各自只许可 `shape-transition`；与旧四个 opacity ink 分支互斥，不绑定外壳、输入、谱面或其他组件。传入的作者 descriptor 包含 `{root, targets, animations: {"shape-transition": LAYOUT_PREVIEW_SHAPE}}`，它不是第二条登记链；正式 ctx 继续从已登记组件取得身份、权限、定义。

作者 recipe 位于 `src/features/workspace-layout-motion-recipes.js`：连续280ms、聚焦260ms、静稳140ms，沿已认可曲线。正式factory默认声明应引用这个对象，而非把时间常量再抄一份。原 `WORKSPACE_LAYOUT_ANIMATIONS` 对象与旧审阅贡献保持相同引用，不能为扩展几何改写其既有键集合。

`src/shell/workspace-layout-preview.js` 投影正式快照：`leftWidth/rightWidth/topHeight/voiceHeight` 及四个 `*Open`。它没有第二份业务状态或容量计算；只记住最后接受的只读快照，计算当前缩略图。`workspace-layout-preview-geometry.js` 的1240/900是示意比例，绝不能反向用于真实工作区。

## 工程修改范围

按既有分工，工程会话拥有公共合同/服务/driver/provider、plugin/page登记接线与生成链；视觉会话拥有上述私有模块/CSS/作者参数。请完成如下最小增量：

1. 在同一 `shared/ui-animation/contract.js` 和 `.d.ts` 源上增加受限局部矩形能力，保持单一版本策略和捕获路径。是否需要版本升级由正式兼容策略决定；旧/不支持的合同不能被静默当成有效形变。
2. `shape-transition` 只接受完整有限 `{x,y,width,height,opacity?}`：几何非负、`x+width` 与 `y+height` 不超过512、opacity为0–1；不接受spring、velocity、任意CSS/轨道/timing。原三intent仍拒绝width/height。
3. 所有校验先于中断/capture。沿用32目标/组件、128活动/服务、实际cell独占后代、超时、迟到门禁和失败诊断，不按布局名称特判。
4. driver的read/write通过intent识别shape；shape读取当前transform、clip-path矩形和opacity。捕获/释放须恢复原clipPath/transform/opacity。其他动作不能获得clip权限。
5. provider按已接受矩形合成完整 `translate3d(...)` 与 `clip-path: inset(0px right bottom 0px round 2px)`。五个无内容节点固定512×512；不动画化width/height/top/left，不scale文字或圆角。原生轨道cancel，反向从当前计算值采样。
6. 减少/关闭、键盘、隐藏、窗口与尺寸输入即时到**有意义的几何目的地**，不能按装饰位移规则把shape的x/y清零。无定义/无provider仍由同一合法宿主静态写入；非法已提供定义拒绝。
7. 正式布局声明新增shape权限并引用 `LAYOUT_PREVIEW_SHAPE`，页面用上述显式 `shapeTransition: true`。空动画贡献仍合法；绑定失败按现有启动回滚/诊断处理，不能把不支持许可的异常吞成成功。
8. 由原startup/desktop链生成合同及产物，检查经典与桌面入口，不能手改vendor。不要改外观/曲线或引入第二个注册器。

业务与原生控件先接受，指针同步开合/排布才可播放；异步接受、程序更新保守即时。尺寸滑条/数值直接跟手。ResizeObserver在隐藏恢复或窗口变化时静态重投影，不补播。播放结束只清理呈现记录，不写工作区命令。

## 现有验收与接线后的验收

视觉证据 `evidence/layout-preview-ui-20261007/`：整包533/533；真实正式页163/163，三窗口/DPR、1,409个采样帧的谱面四分量漂移0；原动画页28/28。另14/14是实际私有视图**注入review-only执行器**，验证形变、中间透明度同进度、反向、键盘、隐藏、恢复、resize、减少、两实例和原生释放，不能冒充正式shape登记已通过。

正式接线后须补公共层校验/原子拒绝、无provider/空定义/当前与迟到故障、两实例、预算/释放测试，并在真实 `runtime-preview.html` 复测五个已登记shape目标、中间轨道、所有策略、滑条动态容量、逐帧谱面固定和组件移动/关闭/释放。只通过review注入或测试数不算正式接入完成。

## 交接动作

跨会话消息需要用户直接授权。用户已于2026-10-07明确授权，接线要求已经发送；在既有工程会话继续此增量，不再创建新工程会话。工程结果应写到layout-preview-formal-shape-result-20261007.md并使用新证据目录。本视觉会话继续真实页面的美术和联合验收，不接管公共宿主文件。
