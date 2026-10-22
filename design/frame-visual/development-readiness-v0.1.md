# 备份 UI：后续开发准入 v0.1

更新：2026-10-22。范围：正式4.0挂载包、固定启动集合和当前备份文档工作区。当前已接入只读staff/Tab呈现切换；Tab编辑仍待开发。同作品重开一致性修复及本轮准入依据见下方“2026-10-22修复验证”。

2026-10-11历史准入依据：正式边界60/60、备份边界146/146、相关布局64/64，生产/test类型及八组生成检查通过；当时相关源/资产在检查期间无变化。已复现的布局通知包装缺口已修复。当轮新增一项回归，未重跑整包或原生窗口；完整历史证据和范围见文末链接。

本页回答“现有基础能否继续开发”，不替代[完整资格标准](infrastructure-acceptance-v0.1.md)。收尾只处理已复现、会破坏公开合同或后续操作的问题；不追求提前完成所有功能和发布环境验收，也不承诺未来零修改或零重构。

## 当前可以依赖的基础

| 范围 | 后续开发使用的入口与约束 |
| --- | --- |
| 插件登记 | [4.0挂载合同](plugin-mount-contract-v4.md)、[作者指南](author-validation-guide-v4.md)。同一正式PluginPlatform；新包明确apiVersion 4.0、UI facet 1，声明自己的组件/命令/菜单/快捷键与权限 |
| 固定装配 | [装配合同](../../.trellis/spec/frontend/plugin-startup-assembly-contract.md)。可信应用通过startupEntries成对提供metadata/package；启动前恢复设置，运行集合不变，修改计划在完整新会话生效 |
| 执行与生命周期 | 同一个UI router、ComponentHost和资源scope。菜单/快捷键映射到同一命令；挂载失败回滚，移动/隐藏保持实例，释放阻止后续调用和迟到写回 |
| 布局组件 | [布局公开合同](workspace-layout-contract.md)。layout/contents/actions/view四个窄读端口由组合根注入；命令符号来自src/contracts/workspace-layout.js，不读取host私有对象或其他插件DOM |
| 谱面与视口 | [只读文档合同](../../.trellis/spec/frontend/readonly-score-document-contract.md)。原子文档身份/版本驱动投影；唯一StageViewport处理滚动和连续缩放，记谱渲染复用原共享模块 |
| 谱式交互 | [记谱策略合同](../../.trellis/spec/frontend/notation-interaction-package-contract.md)。纯规则归shared/notation，核心4.0包在唯一平台登记；同一view已支持staff/只读Tab切换，staff保留原编辑链，Tab禁用写入。Tab已有真实数字策略/原领域单音修改和共享绘制/同数字墨迹/多页几何，见[弦品](../../.trellis/spec/frontend/tablature-position-contract.md)和[绘制合同](../../.trellis/spec/frontend/tablature-rendering-contract.md)。[Native双谱合同](../../.trellis/spec/frontend/native-dual-notation-contract.md)已接固定调号＋吉他、同snapshot双谱读取及旧宿主兼容；[窄弦品写动作](../../.trellis/spec/frontend/score-fretted-position-contract.md)已接原文档/历史/文件链；Tab编辑交互和通用协调器仍待接入 |
| 启动中心与配置 | [产品合同](../../.trellis/spec/frontend/startup-center-product-contract.md)、[偏好合同](../../.trellis/spec/frontend/startup-appearance-contract.md)。最近/插件/设置共用原协调器；宿主拥有最近记录，插件计划和欢迎页偏好共用设置文档写队列 |

状态归属继续固定：正式平台拥有身份/激活/插件设置；工作区拥有四栏几何；composition拥有栏内配置；内容编辑会话只协调配置基线；文档会话拥有作品身份/版本；StageViewport拥有滚动投影。插件可以拥有自己的输入草稿和预览，不能把它们当作另一份已接受业务状态。

布局现有功能可以继续被使用和扩展。四栏开关/尺寸始终可用，内容启用/移动/排序才受编辑确认取消约束；取消不回退阅读缩放或普通尺寸。均衡/紧凑先局部预览、明确应用后再改变真实几何。动画只呈现已接受结果，不能成为业务提交或正确性的前提。

## 这轮收尾的退出条件

1. 公开字段、命令和状态所有者能对应正式消费者，已知架构阻塞已有修复或明确排除范围。
2. 原基础边界回归及相关布局回归通过，生成件与源一致；检查窗口内相关源变化必须记stale，不能借旧结果宣布当前通过。
3. 作者有一条明确文档入口，旧记录不再把已关闭问题当成当前阻塞；未来功能不伪装成现有API。

满足后结束本轮基础收尾，进入一个真实功能切片。一般功能新增不要求重新审计整个基础设施。

## 剩余工作如何处理

| 工作 | 何时处理、对当前开发的影响 |
| --- | --- |
| 内容直接拖放、落点和分组 | 做该功能时实现真实控制器；优先复用现有move/reorder/事务，确需新语义才扩展合同。当前按钮配置/排序可以继续使用 |
| 完整布局/快捷键/方案偏好 | 做持久化时捕获原所有者的稳定配置，用独立版本namespace及既有设置文档队列保存；不持久化DOM、像素投影或动画临时占位。欢迎页偏好已保存不等于这一项已实现 |
| 统一报告、反馈及恢复 | 通用notices尚未统一呈现，恢复报告含夹具；对应业务先提供真实结果/来源/授权恢复动作，反馈只负责呈现。当前已有局部失败/重试继续使用，不能新增全局反馈平台代替业务所有者 |
| 音符选择/输入、删除、属性、历史、保存、播放、六线谱 | [选择](../../.trellis/spec/frontend/score-selection-contract.md)、[输入](../../.trellis/spec/frontend/score-note-input-contract.md)、[单事件删除](../../.trellis/spec/frontend/score-delete-input-contract.md)、[属性](../../.trellis/spec/frontend/score-event-properties-contract.md)、[历史与保存](../../.trellis/spec/frontend/score-history-save-contract.md)已接原宿主；2026-10-10增加[同小节范围与剪贴板](../../.trellis/spec/frontend/score-range-clipboard-contract.md)及[小节增删/拍号](../../.trellis/spec/frontend/score-measure-structure-contract.md)，复用旧规则及真实Core事务/guarded文件链。Native 调号已接正式固定领域集合、同一integrated会话及读投影，删除调号小节沿一次事务清理；见[领域合同](../../.trellis/spec/frontend/native-notation-module-contract.md)。前端[调号控件](../../.trellis/spec/frontend/score-key-signature-controls-contract.md)已有有效值、显式自然调与继承、no-op、旧草稿及派发前取消保护；见[控件证据](evidence/score-key-signature-controls-20261010/verification.md)。[四种谱号](../../.trellis/spec/frontend/score-staff-clef-contract.md)接入同一会话/router/选择链与原 Core 谱表定义，Native 四谱号投影、音高保持、历史和物理文件往返沿原权威源验证；见[谱号证据](evidence/score-staff-clef-20261010/verification.md)。[作品信息](../../.trellis/spec/frontend/score-document-metadata-contract.md)已复用旧纯规则，接入完整作者的Native原子读取、原document事务/历史/受保护文件及无caret失败恢复；见[作品信息证据](evidence/score-document-metadata-20261011/verification.md)。跨小节范围/分配、复杂输入工具、播放及Tab编辑仍待开发；当前闭环不等于完整编辑器资格 |
| G1独立作者试验 | 作者包和参考检查已可用，独立作者资格仍pending；首批受控插件可继续，扩大为无需维护者协助的批量开发前补齐 |
| G6设备/真实绘制与长期容量 | Windows 4核/8GB是规划目标，实机资格仍pending；按目标规模做实测，容量超预算的功能扩量前处理，不阻塞现有范围的普通功能实现 |
| G7原生输入/系统缩放/IME、整体视觉批准 | 对应候选发布前及相关输入功能验收时完成。静态/DOM回归不能替代；原生操作继续暂停，本轮不为文档收尾重复构建EXE |

这里的后续接缝是实施方向，尚未支持的功能和未来端口不能由插件提前调用。最新布局画面及手感状态由[视觉状态表](current-visual-status-20261008.md)记录。

2026-10-11更新：上表的“完整输入工具”基础范围已接线，见[输入合同](../../.trellis/spec/frontend/score-note-input-contract.md)及[验收证据](evidence/score-input-tools-20261011/verification.md)。包括caret时值/附点/变音/休止、原指针hover/双击及最多32键连续输入，仍沿原文档/选择/历史链；938/938备份整包、原规则/类型/生成/候选构建通过。复杂符号、六线谱/吉他、播放/输出及集中体验打磨仍待继续，不能以本轮替代原生资格。

2026-10-11双谱更新：真实Native和Node宿主已固定安装原调号＋吉他领域，在一次原子读取中
返回五线谱与Tab。193条实际原TS领域回调差分、正式139/139、备份整包961/961、
Native领域6/6及guarded保存11/11通过；详见[证据](evidence/native-dual-notation-20261011/verification.md)。
在该日候选中UI仍为五线谱，新建为通用作品；无吉他初始化/缺指法时Tab明确unsupported。
已有指法的音高修改/删除不能破坏领域一致性，完整编辑须后续接领域写口和关系清理。
五种技巧虽能无损保留与校验，当前视图/播放未支持其表达。本轮未编译或启动EXE，
不授予原生输入、低配或完整六线谱编辑资格。

2026-10-11弦品更新：[原公开编辑入口](../../.trellis/spec/frontend/score-fretted-position-contract.md)
已接原领域、documentSession、真实范围、no-op、同一历史/文件与失败重读。
18步骤passed，正式147/147、备份整包961/961、Native弦品4/4和物理保存12/12；
详见[本轮证据](evidence/fret-position-edit-20261011/verification.md)。
弦品编辑及history按实际staff/Tab能力判断，高品位Tab不会被staff视图音域锁死。
该日完成了UI接入的写口前置工作；当时Tab实际view/输入、吉他新建初始化、
空拍插入、关系清理、技巧及原生资格仍待完成。

## 2026-10-22修复验证

当前的只读Tab呈现已在2026-10-21接入；上面的2026-10-11记录保留其历史候选含义。待开发的是Tab编辑、吉他新建初始化及完整技巧等能力，不再把“六线谱”整体列为未接入。

合并后审计发现同窗口重开同ID较早磁盘版本时，owner已接受替换，谱面却因旧版本检查停留在前一作品内容。修复沿原owner订阅携带本地替换代次，保持普通读的过期保护、原router与文件/历史权威。Workbench 876/876、备份UI 1025/1025、三组类型、桌面生成一致性及原复现通过；浏览器确认同窗口双谱同步与125.5%缩放保持，文件对话框/IO结果使用独立样本模拟。实现与本轮验证见[修复报告](evidence/document-reopen-20261022/verification.md)；原审计失败证据保留于本地`.trellis/tasks/archive/2026-10/10-22-post-merge-main-baseline-audit/`。修复保存在本地`codex/fix-document-reopen-projection`分支，尚未合并到main或推送。

## 防止基础审计无限重开

新插件按公开合同开发，在原真实宿主上验证一条正常流程及相关失败/释放路径；首次遇到没有公开能力时，先明确需要的最小端口及所有者。只有复现出合同不一致、被迫读取宿主私有状态、出现第二份业务权威、数据破坏/释放失效，或真实目标规模超预算，才重开对应基础边界。页面细节、动画节奏和普通新增功能进入各自迭代。

维护者交付复用[基础边界检查](foundation-boundary-regression.md)，并按实际改动补定向测试；不因文档或局部呈现修改机械重复全仓、全部原生和完整容量矩阵。

本轮实际结果及保留失败见[收尾验证](evidence/development-readiness-20261009/verification.md)。
