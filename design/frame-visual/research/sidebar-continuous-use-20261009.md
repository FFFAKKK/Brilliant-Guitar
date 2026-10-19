# 连续使用与版本刷新验收

日期：2026-10-09。范围是备份视觉框架的 `runtime-preview.html`，只检查连续使用时的视觉边界、谱面保位、内容编辑隔离和预览资源刷新；没有修改产品废案、Rust/Tauri 或外部插件。

## 结论

在本轮实际打开的版本中，展开中切页、收起中调整上侧栏、底部展开与左侧栏收起交错、排布预览切换、排布应用、内容移出取消、内容排序确认后再次编辑，都没有出现整页跟随、谱面漂移、旧裁切残留或动画结束后继续占用。最新刷新到 `c39c5fccce7543143117` 后，静态状态仍无可见底部常驻文字，页面没有滚动溢出，控制台没有 error/warn。

本轮没有新的生产源修改，因此没有把已经通过的动画实现重复改写。资源服务在验收期间又被其他会话更新过一次，早先动态证据保留在 `7eb100aa468ed46af843` 版本，不能直接转移为最新版本的全部动态签收；最新版本只做了快速状态复核。

## Before / After / Why

| Before | After | Why |
| --- | --- | --- |
| 连续开合只验证单次完成，容易遗漏切页、尺寸变化和交错操作的收尾问题 | 对动画中切页、动画中调整高度、上下与左右交错开合逐帧取样，结束后检查 native tracks、clip、inert/hidden 和 header 位移 | 用户看到的是一串连续操作，必须保证每次变化只影响相关区域 |
| 排布选择和内容编辑存在“整页跟着动”的历史风险 | 排布预览及应用保持设置容器、谱面矩形、输入节点身份不变；内容取消恢复临时成员，确认排序作为下一次基线 | 避免用户误以为切换预览或内容确认重建了工作区 |
| 资源版本在刷新时可能混用旧页面和新依赖 | 每次刷新从原入口读取新版本；发现并发版本变化后，将动态证据按版本隔离，旧资源返回 410 | 不把旧候选的视觉通过冒充当前候选 |

## 本轮实测

- **动画中切页**：下侧栏展开约 90ms 后切换到谱面属性。旧轨道完成清理，页面切换到新内容；谱面矩形保持 `x=290,y=174,w=487,h=688.75`（该版本基线）。
- **动画中调整尺寸**：下侧栏收起约 90ms 后改变上侧栏高度。结束后只保留新高度，voice clip、header transform 和 native animation 均清空。
- **交错操作**：下侧栏展开约 90ms 后收起左侧栏。最多同时观察到 6 条既有原生轨道，最终为 0；谱面矩形全程只有 1 个值；节点身份保持。
- **排布预览**：均衡/紧凑往返取样，设置面板、标题、排布行和谱面矩形没有变化；预览未提交前不改真实区域。
- **应用排布**：应用紧凑后，工作区字段更新而谱面节点、尺寸输入节点和滚动基线保持；随后恢复均衡并复原上侧栏高度。
- **内容编辑**：临时移出“谱面属性”后取消，成员和右侧页签恢复；排序后确认，再次进入编辑时以新顺序为基线；普通尺寸调整保留。
- **容量**：在 `1024×720` 临时视口下检查，文档无水平/垂直溢出，侧栏左右对称到约 232px 的容量上限；随后恢复默认浏览器视口。
- **最新刷新**：当前页面为 `http://127.0.0.1:5193/__preview/c39c5fccce7543143117/runtime-preview.html`，`Cache-Control: no-store`，控制台 error/warn 为空；下侧栏按钮没有可见“下侧栏”标签或蓝底块。随后按最新页面实际把手坐标做左侧栏展开/收起烟测：约90ms时存在3条既有轨道，最终0条，谱面矩形保持不变，无滚动溢出，左栏恢复收起。

## 证据

- `evidence/sidebar-continuous-use-20261009/verification.json`
- `evidence/sidebar-continuous-use-20261009/arrangement-preview.json`
- `evidence/sidebar-continuous-use-20261009/open-interrupted-by-page.json`
- `evidence/sidebar-continuous-use-20261009/close-interrupted-by-size.json`
- `evidence/sidebar-continuous-use-20261009/bottom-open-left-close-overlap.json`
- `evidence/sidebar-continuous-use-20261009/content-cancel.json`
- `evidence/sidebar-continuous-use-20261009/content-confirm-reenter.json`
- `evidence/sidebar-continuous-use-20261009/current-overlap.json`
- `evidence/sidebar-continuous-use-20261009/latest-browser-c39.jpg`
- `evidence/sidebar-continuous-use-20261009/latest-c39-left-smoke.json`
- `evidence/sidebar-continuous-use-20261009/latest-c39-final.jpg`

## 尚未签收

1. 最新并发版本的完整动态矩阵需要在源稳定后重做；本轮只对 `7eb100aa468ed46af843` 做了完整连续动态取样，对 `c39c5fccce7543143117` 做了刷新后的静态快速复核。
2. 真实 Windows EXE、系统 100/125/150/200% 缩放、真实鼠标/触控板/触屏、读屏、IME、高对比度和长期舒适度仍需工程与用户联合验收。
3. 18 项整体清单中的拖放/分组、正式报告错误链路、用户偏好持久化、外部插件闭环和同版原生构建仍由其他工程职责完成或联合验收。
4. 当前现场的 `top=120`、左侧栏收起等状态是刷新时的已有工作区状态，本轮未擅自重置用户状态；如需视觉签收，应由用户确认目标初始布局后再封存批准快照。

本轮仅新增报告和证据，没有修改 UI 源、样式、公共接口、快捷键模块或生成资产，也没有运行全包测试或重新编译 EXE。
