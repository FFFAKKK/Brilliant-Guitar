# 正式缩略图 shape-transition 工程结果

日期：2026-10-07。工程接线与验收通过；本报告封存五个 shape 目标阶段。随后获授权的选择动画和框架四栏动画在新的增量报告与证据目录继续，不覆盖本阶段记录。

同一 ui-motion/1 / contractVersion1 严格新增 shape-transition，旧三动作不扩大字段语义，旧捕获器明确拒绝未知 shape。共享源与 TypeScript 类型接受完整有限非负矩形，右/下界不超过512，可选 opacity 为0–1，拒绝 spring、velocity 和任意 CSS/轨道/timing。全量输入和当前矩形先校验，再中断；节点批次先校验/capture再占用，沿用32目标/组件、128活动/服务。

驱动按 intent 读取真实 translation、inset 裁剪和 opacity，shape 释放恢复 clipPath/transform/opacity，普通动作没有裁剪权限。提供者在固定512平面通过同次 Motion 调用执行 translate3d、圆角2px的 inset 和 opacity；实测三个原生属性轨道共用 startTime、duration、ease，多分量进度一致，无 width/height/top/left 或内容 scale 动画。

正式布局在同一次登记声明 shape 权限与作者 LAYOUT_PREVIEW_SHAPE，页面只转交 targets 并显式 shapeTransition:true；五个目标为 shape:top/left/right/voice/stage，无旧四 ink。continuous/focused/quiet 消费作者280/260/140ms与原曲线。减少/关闭、键盘/程序、尺寸/resize、隐藏/恢复保持有意义矩形即时落地；故障、迟到、替换、移动及最终释放均按实际服务验证。

| 验证 | 结果 |
| --- | --- |
| frame-visual全量 | 552/552 |
| 正式workbench挂载 | 8/8 |
| workbench TypeScript及shape正/负类型fixture | 通过 |
| 动画合同、Motion、startup、desktop生成check | 通过 |
| 实际ESM、classic file、生成桌面静态入口 | 289/289 |
| 谱面四分量逐帧漂移 | 2817个采样，最大0 |
| 局部矩形多属性进度 | 5220次采样，最大进度差9.63235452830502E-05 |

实际浏览器覆盖反向、作者变体、键盘/系统减少/none、当前与迟到故障、provider移除、页面/工作区隐藏恢复、持久cell移动/区域关闭、两个完整runtime及原生释放；三窗口/DPR覆盖四区域尺寸、动态容量、原生滑条拖动和数值输入。每次业务动作接受后先记录宿主几何基线，再采样局部动画，不把合法宿主变化记为动画漂移。

证据：[最终检查](../evidence/layout-preview-formal-shape-20261007/final-verification.json)、[浏览器](../evidence/layout-preview-formal-shape-20261007/formal-shape-browser.json)。重放工具为 tools/layout-formal-shape-browser.cjs 与 tools/layout-formal-shape-verify.cjs；新增六目标/框架接线后，这些五目标断言属于本阶段基线。

并发视觉的下一帧测量/ResizeObserver与CSS更新全部保留，本工程未编辑父视觉文件。实际生成后加载浏览器，最终源哈希与生成一致性已检查。历史工程/视觉封存未覆盖，代码未提交、未stage或归档。仅验收Chrome与生成桌面静态资产；原生WebView及父视觉美术联合验收独立，不声称本轮已完成原生/内核验收。
