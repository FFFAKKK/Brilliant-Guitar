# 四侧栏动画统一：以右侧栏为基准

用户要求：所有侧栏动画统一成右侧栏效果。仅修改备份视觉框架，没有参考或改动废案产品UI。

| Before | After | Why |
| --- | --- | --- |
| 四栏时长已经相同，但动画目标覆盖范围不同 | 四栏统一完整表面合同v-frame-region-surface | 参数相同不代表画面同样呈现；背景必须跟随内容一起退出 |
| 上栏只动画内部slots，bar背景和12px内边距仍在静态外层 | 原上栏载体拥有全部slots、完整bar背景和内边距，外层只保留canvas底色及固定grip | 空上栏也有完整表面参与淡入/淡出，避免底色最后瞬间消失 |
| 下栏动画目标只有固定120px的占位内容 | 满区域载体包含原占位内容，背景属于载体 | 以后下栏承载内容也按完整区域动画，避免只动画几条线 |
| 左右已有完整面板目标，但没有同一表面约束 | 左仍用原.v-left-surface，右仍用原.v-page，共用满尺寸表面约束 | 保留右侧参考效果及原插件节点，不重建面板或改静态皮肤 |

统一右侧基准：展开280ms、收起260ms，ease-out(.23,1,.32,1)，同一opacity轨道及12px位移幅度。方向朝各自边缘：左−x、右+x、上−y、下+y。横栏原配色、四栏尺寸、最小值外24px手势、谱面保位、安全裁剪、反向取样、策略降级和生命周期沿原合同；不引入新的执行器或每栏专有时长。

## 修改范围

- src/shell/visual-workbench.js：统一四个surface标记；上侧原载体完整持有背景/内边距，下侧添加单一满区域载体；右侧仍是原page目标。
- styles/runtime-preview.css：四条静态表面规则，精确限定当前runtime及框架data-frame-ui；无新CSS动画或transform/opacity执行规则。
- tests/frame-region-unification.test.js：7项，实际正式运行壳检查四目标身份/完整表面/grip与谱面排除，CSS背景所有权，四向轨道设置与右侧逐项相同，无动画历史壳保持。

原frame-region-presentation、StageViewport、业务几何、动画服务、快捷键、结构样式指纹均未变化。原生成链更新21份桌面静态资产；未重编EXE。

## 验证结果

- 最初测试夹具的左/右矩形与stage不相接造成一项轨道失败，已先纠正夹具并保留最初日志。有效修复前基线7项为5失败/2通过，其中轨道参数一致原本就通过。
- 专项144/144；整包821/821。
- 最终检查窗口366份src/styles/tests/scripts/vendor/fixtures/tools输入逐字未变，差异与保护项见summary.json。
- 原生成链构建及21资产--check通过；真实5193的12项入口/模块/样式/生成资源200、no-store、逐字匹配源，当前efc65f73555028f1273d。
- 当前地址：http://127.0.0.1:5193/__preview/efc65f73555028f1273d/runtime-preview.html。

证据：evidence/sidebar-motion-unification-20261009/，包含源和生成件前像、初始/纠正后红灯、专项/完整日志、差异补丁、输入指纹和HTTP记录。未修改冻结历史快照或宽泛过滤当前DOM。

## Verdict

- **Feel-breaking regressions：** 四栏承载范围的结构性差异已修复；实际四栏观感仍待用户窗口复验。不能把轨道相同和DOM/CSS源检查视为像素批准。
- **Performance：** 沿用原受限transform/opacity轨道，外层静态裁剪，原两阶段保位；无整页动画、grid宽高动画或新动效引擎。
- **Accessibility & cohesion：** 原inert/焦点与静态降级保持，四栏同一配方且方向自然对应边缘；grip、常驻chrome和谱面不入轨。

原cua读取当前标签仍在kernel assets路径不存在处失败，未取得画面，也未换工具绕过。剩余为当前窗口四向开合/拉出/反向手感、原生WebView与系统缩放、18项整体验收及用户批准。整体任务保持in_progress，不提交/归档并发工作区。
