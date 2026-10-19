# 框架视觉副本

当前入口、主线整合范围和未完成验收见[主线整合状态](MAIN_INTEGRATION_STATUS.md)。
下方是按日期保留的阶段记录；其中的测试数、只读范围和 EXE 验收只对应当时版本。
历史视觉工作安排见[状态与剩余顺序（2026-10-08）](current-visual-status-20261008.md)。

2026-10-08预览更新续修：用户截图仍显示旧命令栏，原服务的页面rev没有覆盖依赖脚本/样式。
当前`npm run serve`使用固定备份根的版本路径服务；打开原页面会自动进入同一内容版本的资源树，所有响应no-store。
新增两个真实HTTP回归，最新整包606/606通过；实际嵌入窗口渲染仍与网络资源验证分别报告。
详见[资源新鲜度排查](research/preview-resource-freshness-20261008.md)。

2026-10-08命令栏清理：当前运行/结构/经典/桌面备份入口只保留基础菜单，移除顶部四栏快捷开关、验证文字和模拟窗口按钮。
四栏操作保留在视图菜单、工作区布局与本地入口；下侧栏高亮仅作用于箭头，文字保持原色。
真实作品身份保留在谱面辅助名称与底部状态图形，速度/小节数继续同步。最新备份604/604与18桌面资源一致性通过；
本轮尚未重新编译既有EXE，浏览器工具受安全策略阻断，当前渲染及原生窗口需另行验收。
细节见[本轮修复报告](research/command-chrome-cleanup-20261008.md)，历史记录继续保留。

2026-10-07 收尾复核：当前布局追加正式矩形形变，最新工作树尚未共同收尾。初测530/533与桌面资产过期已在工程更新后复测恢复：备份547/547、17资源一致性通过；正式700/700与生产类型通过。仍须关闭新形变真实轨道/联合视觉及同版EXE原生验收缺口，再推进音符输入。详情见[模块收尾复核](research/ui-module-closeout-20261007.md)。下文原生窗口结果属于此前已验收EXE，不表示新增形变已经验收。

## 当前接线：真实桌面作品只读显示（2026-10-07）

备份桌面首次进入工作区时复用正式 WorkbenchClient/Tauri 源，核心五线谱消费同一原子作品结果。
文件菜单及 Mod+N/Mod+O 已贡献新建/打开，另有重读；无作品才初始化真实一小节空谱。
真实标题和保存图形同步，源失败有图形重读且不会回到演示；未保存的恢复作品拒绝被替换。
桌面返回配置再进入保留原作品源。普通 file/HTTP 预览仍是明确的 fixture。

同日原生窗口续验已实跑空谱、取消打开、A/B作品切换、返回配置保留作品、坏文件保留成功谱面及真实重读；125.5%连续数值缩放、配置保存后关闭/重开和正式平台捕获可选贡献已观察。
正式700/700、备份533/533、生产类型与资源一致性通过；底部小节数/速度已统一接真实documentRead，固定谱页编号隐藏，白色谱纸重试控件使用局部谱纸颜色。
最终EXE另实跑“坏文件→图形重读→不再点击直接Ctrl+N”成功；移除重试控件后恢复同一view的焦点，保持原router的工作区/输入边界。验收计划已恢复并重启确认。
系统100/150/200%缩放、原生Ctrl+滚轮及IME尚未验收；音符编辑、保存、历史、播放和六线谱另行推进。此次证据见 [桌面窗口续验](evidence/desktop-readonly-window-20261007/verification.md)。
使用见 [桌面入口](desktop-entry-v0.1.md)，行为见 [真实文档合同](../../.trellis/spec/frontend/readonly-score-document-contract.md)，证据见 [本轮验证](evidence/real-document-readonly-20261007/verification.md)。下方按日期保留的切片记录不替代本节当前状态。

## 当前协议：正式平台与公共挂载包（2026-10-07）

runtime-preview 和备份桌面启动入口已统一复用正式 PluginPlatform，采用明确的 4.0 包合同与 UI facet v1。
原四栏、紧凑插件管理列表、命令/快捷键/菜单和共享谱面绘制保持原承载。
作者入口与兼容边界见 [当前公共挂载合同](./plugin-mount-contract-v4.md)。桌面返回配置会保留原会话，
新配置在下次进程启动生效；file 预览才允许释放完整会话再创建。历史切片中的 v1 平台说明不再代表当前真实入口。

## 当前补充：可运行的备份桌面入口（2026-10-07）

已用现有Tauri/Rust宿主编译出独立备份EXE，嵌入当前插件启动配置和四栏工作区资产，可直接运行。
运行说明、独立配置目录与插件协议边界见 [桌面入口](desktop-entry-v0.1.md)；原file页面仍使用浏览器存储。
首次入口切片全量452/452、Rust磁盘存储5/5与原生编译通过；同日原生窗口续验已完成本文顶部所列只读交互与配置保存重启。系统缩放、IME及完整打谱业务仍需验收。

## 当前补充：插件启动配置的存储接线（2026-10-07）

直接打开 `plugin-startup-config-static-preview.html` 可用实际备份目录编辑启停和参数、保存并启动固定工作区。
同一管理视图在普通文件中使用浏览器存储，在真实 Tauri 环境选择已有桌面设置服务的异步适配。
读取/保存期间锁定重复操作，保存成功才建立新基线，返回配置先释放工作区；列表布局与四栏视觉保持。

接入边界见 [插件启动管理](plugin-startup-management-v0.1.md)，本轮 [验证记录](evidence/plugin-startup-desktop-20261007/verification.md)
为新增20项专项与全量444/444。正式桌面包装入口尚未接通，因此当前文件页面仍使用浏览器配置；
未实跑桌面磁盘或浏览器视觉验收。旧真实 UI 页面没有本轮修改。

## 当前接口补充：工作区布局是独立 UI 小插件

工作区布局已在正式备份框架运行时以 `frame.layout` 平级插件注册，页面 id 为 `frame.layout.page`。它消费宿主提供的 `layout`、`contents`、`actions` 受限只读端口，通过已有 `defineUiPlugin` 和 `ctx.execute` 与宿主协作。详细的声明、责任边界、其他插件接入方式和未完成项见 [工作区布局 UI 小插件接口](workspace-layout-plugin-interface.md)。旧 `frame.builtin.layout` 只保留在历史视觉夹具兼容层，不是正式运行时身份。

## 当前补充：布局协作审阅与第八批交接

新增 `layout-collaboration-review.html` 是独立视觉审阅入口，默认只显示框架本身。中性“移动试点”仅在显式打开 `layout-collaboration-review.html?fixture=movable` 时装配；布局组件的第一个协作试点使用 `layout-collaboration-review.html?fixture=layout-pilot`，只更换面板名称，复用同一宿主路径。`structure-preview.html`、`runtime-preview.html` 和无参数的协作审阅页都不加载这些工程测试夹具。它复用当前作者合同、现有布局页面、组件宿主和单一配置事务，用来验证目录发现、移动、确认/取消、输入与实例保留以及权限拒绝。

浏览器证据见 `evidence/layout-collaboration-review-20261005/review.md`；当前可用接口、候选接口与后续工程接入顺序见 [第八批交接索引](eighth-batch-handoff-20261004.md)。上一轮候选新 SDK 仍未发布，真实业务插件、内核接线和插件内部美术由对应工程会话负责。

第八批当前状态、三个视觉入口、状态所有者和未开放工程闸门见
[状态索引](eighth-batch-status-index-20261006.md)。结构预览与运行时外壳共用
`src/shell/workspace-shell-geometry.js`，避免入口之间重复维护区域几何。

属于其他工程、插件和内核会话的未完成事项见[外部会话交接](external-handoff-20261006.md)；本视觉会话当前只继续处理真实视觉验收和框架动画方向。动画仍处于规范阶段，候选场景和硬限制见[框架动画方向](research/animation-direction-20261006.md)。

`animation-review.html` 是独立动画方向对比页，不代表已经选定动画风格。页面对比流体空间连续、层次纵深、编辑节奏、柔性响应、环境过渡五种方向，每种都有中英文名称、用途说明和对应演示动作，并支持慢放、减少动效与关闭。它只改变固定右栏中的审阅样稿，不接入默认框架，不影响谱面或外壳几何。研究依据见[动画市场调研与方向报告](research/animation-direction-20261006.md)。

2026-10-05 修正：工程测试夹具“移动试点”从无参数审阅页移除，只有显式 `?fixture=movable` 才会出现；布局试点也只有显式 `?fixture=layout-pilot` 才会出现。它们都不属于正式框架视觉。

## 当前补充：插件边界复核（2026-10-04）

后续框架工作以[插件设计主稿](plugin-design-v0.1.md)为约束；有独立装配／替换需求的能力按同一平台登记，宿主基础模块的状态与权限责任保持清楚。本轮[边界复核](plugin-boundary-review-20261004.md)逐项列明已有实现、视觉fixture及未开放接口，并修复公共焦点工具写死布局按钮ID和头部class的依赖，改由框架组件本地声明。

本轮验证与范围见[局部验收](evidence/plugin-boundary-review-20261004/review.md)。下方revision-15的317测试、158源及封存记录属于当时交付，当前源码的新增和局部修改单独记录，不覆盖历史结果。新版共同元数据、可选null规范化、反馈提供者和真实业务接线仍待工程；第八批交接先复核责任、公开依赖、生命周期和替换验收。具体插件由对应会话制作，整体任务保持in_progress。

## 当前视觉修订：键盘、焦点与可读性 revision-15（2026-10-04）

第七批核心视觉复核已交付：框架阅读区按溢出容量提供有名称的Tab入口，方向键／PageUp／PageDown／Home／End浏览；重绘、收栏、布局编辑确认／取消和菜单／详情退出恢复可见焦点。两入口的右侧页签组有名称、角色和唯一当前Tab入口。只对框架显式拥有的节点生效，插件私有操作与美术继续自主。

打开`accessibility-review.html`查看审阅目录；[视觉合同](accessibility-visual.md)集中记录内部函数与边界，[本轮验收](evidence/revision-15/review.md)列明分阶段证据与未实测项。原96场景、四窗口十状态容量、连续Tab、长内容首尾及谱页几何均有保存记录；317项单进程测试、127份JS语法通过。说明文字改用既有辅助色，未增加装饰白边、可见滚动条或默认动画。

真实读屏器、IME、系统高对比度与Windows系统缩放仍需专项实测。下一步第八批统一状态索引、规格、责任清单和最终交接；新批准快照需用户认可。整体任务仍`in_progress`，未提交或归档。正式反馈、业务接线与具体外部插件继续由对应会话承担。

## 历史：原位反馈与布局方案 revision-14（2026-10-04）

第六批核心视觉样稿已交付：方案在布局组件内另存/重命名/切换/删除；名称校验、处理中、明确失败、结果待核对、配置回退、隐藏来源与基础呈现回退。重要问题沿用标题状态入口，主动展开详情，关闭不等于解决。所有操作仅预览内存，内容及方案沿用统一布局事务，工作区调整保留。

打开`feedback-review.html`查看八个状态，或`structure-preview.html?feedbackReview=1`操作完整流程。[可执行视觉合同](feedback-visual.md)说明实际函数、状态、边界与工程交接；[本轮证据](evidence/revision-14/review.md)区分浏览器、状态测试与未实施能力。默认两个入口不装新样稿，原件与工程实现保留。

第六批正式报告/消费及业务接线仍交工程；无原位空间的不可恢复决策策略未定。第七批全框架可访问性、第八批最终交接及真实Windows缩放继续；整体任务in_progress，未提交或归档。

## 历史：上下侧栏槽位 revision-13（2026-10-03）

2026-10-03追加修正：无溢出时错误显示的`null`已移除，可选更多节点不再以空值传给原生`replaceChildren()`。144次渲染回归、15条浏览器检查和当前290项整包测试通过；当前证据见`evidence/revision-13/null-text-fix-20261003/review.md`。下文212条记录与267测试及其封存工具是修复前历史，不能代替本次修复验证；当前可用`node --test --test-isolation=none design/frame-visual/tests/horizontal-slots-visual.test.js`复核。

2026-10-03追加修正：无溢出时错误显示的`null`已移除，可选更多节点不再以空值传给原生`replaceChildren()`。144次渲染回归、15条浏览器检查和当前290项整包测试通过；当前证据见`evidence/revision-13/null-text-fix-20261003/review.md`。下文212条记录与267测试及其封存工具是修复前历史，不能代替本次修复验证；当前可用`node --test --test-isolation=none design/frame-visual/tests/horizontal-slots-visual.test.js`复核。

第五批上下侧栏槽位已完成。`horizontal-slots-review.html` 提供12个显式中性状态，`structure-preview.html?slotReview=1&slotSample=dense`可查看密集三槽与更多入口。

顶部按整个区域使用一个末端“更多”，合并栏按播放器、节拍器/速度、谱面信息三个槽分别使用末端“更多”；贡献的最小宽度和优先级只用于本批容量视觉验证，模式名称、说明、确认/取消始终保留。空槽保持连续表面，暂不可用显示原因，长名称可省略并保留完整提示。下侧容器分离标题、可浏览内容和固定区，长内容与固定区都能在隐藏滚动条下到达末尾。

本批212条浏览器记录（46流程/48容量/22默认入口与resize/96原场景）、8步真实Tab、267项测试、116份脚本语法通过；观察源码114项前后稳定，所有容量槽位横向溢出为0，默认入口不装中性样稿。证据见`evidence/revision-13/review.md`，复核命令为`node design/frame-visual/tools/horizontal-slots-contract.cjs`。真实插件内部视觉与工程调度/实例/持久化保持分工；真实Windows系统缩放仍待。

## 历史：内容承载与管理 revision-12（2026-10-03）

第四批视觉完成。`content-hosting-review.html`提供多页面、单页、空页、全部图标隐藏、搜索无结果、长内容、固定区过高、半行宽度不足、缺失插件与暂不可用目录。`structure-preview.html?contentReview=1`只在显式入口提供中性内存样稿；默认结构与runtime保持原内容集合。

左右各有独立页面，可各自使用页签、列表、网格或mixed；内容加入/移出、占宽、区内顺序、图标与跨页面/跨侧栏移动在现有布局事务内统一确认取消。输入、阅读、折叠和工作区调整保留。内容库分别显示来源、当前位置、已加入、正在查看与图标隐藏；固定/不可用/最小宽限制有原因。独立页签导航在滚动内容外，避免长内容切换时浏览位置被鼠标定位改变。

本轮209条浏览器记录（57流程、40容量、16两入口/resize、96原场景）及8步真实Tab；233测试、106脚本语法、105观察源稳定，原件/批准谱面/结构文档保持。4份现有并发工程与4份工程新增保留。真实鼠标验证网格排序及同项无效落点；跨分区权限由行为测试覆盖，两个无变化的跨分区鼠标尝试单独记录、不算通过。

规格见[content-hosting.md](content-hosting.md)，证据见`evidence/revision-12/review.md`，保存结果用`node design/frame-visual/tools/content-hosting-contract.cjs`复核。实际实例复用、热恢复、多页面真实呈现与持久化由工程会话接入；插件内部控件和图形保持自主。第五至第八批及真实Windows缩放仍待完成，整体任务in_progress，未提交归档。

## 历史：框架控件与承载 revision-11（2026-10-03）

第三批只统一框架实际使用的控件与承载规则，插件内部按钮、图标、色彩和排版保持自主。`controls-review.html`提供四组可交互状态：操作与反馈、输入与限制、选择与导航、承载与自主视觉。200/260/360px侧栏与40/64/96px横栏组合用于容量审阅；私有样式探针是中性验收例，不定义外部组件设计。

独立`framework-controls.css`已接入结构和集成入口，补主要按钮hover/按下、禁用、只读、错误文字、数值容器焦点及关闭状态下拉箭头；冻结的base/structure/tokens声明与工程接口保持。常态边缘透明、键盘蓝色焦点、无动画、隐藏滚动条及固定谱页规则继续沿用。框架规则只处理显式data-frame-ui节点，不递归到插件内容。

规格见[framework-controls.md](framework-controls.md)，本轮证据见`evidence/revision-11/review.md`，整包复核入口为`tools/framework-controls-contract.cjs`。真实Windows系统缩放仍待实测；后续是第四批多页面/跨区域/缺失内容。整体任务继续in_progress，外部组件及工程维持分工。

## 历史：工作区布局组件 revision-10（2026-10-02）

第二批视觉与中性状态样稿完成。用户确认采用并发新规则：区域开合、尺寸与整体排布随时可用，布局编辑只管理栏内内容配置。内容呈现、占宽、排序、加入/移出、图标和方案共用确认/取消；取消保留编辑期间的工作区调整及普通输入。以下 revision-08/09 的几何锁定和取消恢复几何属于历史规则。

右侧特殊布局组件按区域、尺寸、整体排布、承载页面、选中内容、方案组织。完整单行区域名称适配230px侧栏；88px区域示意、44px固定编辑头部、实际差异明细与四项尺寸的px单位/范围/限制原因/单项恢复已补齐。普通模式提供编辑入口，编辑中在固定头部显示确认/取消。

结构与集成入口共用工作区设置视觉，消费既有快照与 C.region / C.resize / C.arrange，不重写工程。集成入口共用几何区，完整内容与方案演示在结构样稿。`layout-review.html`提供未选中、空内容、固定、仅半行、容量不足、区域许可、无网格区及左右混用。容量反馈原位更新，保留输入节点和下一次点击目标；普通进入不自动选中。

新规则重新验收164条浏览器记录：16工作区操作、25内容/方案状态、10窗口状态、11集成操作、96原场景和6浏览检查。真实15步Tab到方案入口；165项整包测试及91份脚本语法通过。采集前后80份源码/样式/测试哈希一致；原33基线、批准谱面及结构文档哈希保持。14份责任源及证据的封存由下方工具生成和复核，具体边界见`evidence/revision-10/review.md`。旧规则160记录另存`before-rule-split/`，未封存，不能证明当前源。

保留透明常态边缘、蓝色选中/焦点、隐藏滚动条、无动画，以及普通操作固定谱页、resize保留宽/Y且水平居中、区域不相交规则。预览已恢复自然1280×720、DPR1.25、普通S01，无debug或中性示例；左栏临时打开供审阅。该DPR读数不代表真实Windows系统缩放实测。

下一批是共用控件完整状态页和尺寸/字号/间距规格。八批进度见当前任务`research/remaining-visual-roadmap-20261002.md`；整体仍in_progress，未提交归档。第三至第八批继续推进，具体外部组件、真实内容编排及持久化由对应会话负责。

```powershell
node design/frame-visual/tools/layout-component-contract.cjs
```

整包测试从`design/frame-visual`目录执行：

```powershell
$taskTestFiles = @(rg --files tests -g '*.test.js')
node --test --test-isolation=none @taskTestFiles
```

## 历史：窗口适配 revision-09（2026-10-02）

外壳使用真实视口，不再用1024px最小画布撑开紧凑宿主。800×600、922×720下保留完整菜单、区域开关、窗口按钮和两条图标列；默认两侧同时约束为230px，1024宽为232px，正常宽窗为260px。共享标题适配用于结构和集成两入口：长文档名中间省略、完整名称保留提示，次要状态按空间截断。低高度窗口的工作台使用剩余空间，避免挤入常驻底栏。

普通操作继续保持谱页X/Y/宽高；连续resize保留纸宽和Y并按窗口水平居中。侧栏和工作台仍分区，容量不足只在工作台内部裁切和浏览，不自动缩小谱页或收起侧栏。所有滚动条隐藏，布局尺寸仍只能在工作区布局组件开启编辑后修改。默认不装入中性示例，具体外部组件由其他会话负责。

本轮证据在 `evidence/revision-09/`：96原场景、21标题/连续窗口记录、8小窗口侧栏呈现、40开合与编辑记录、4次模拟像素密度、2低容量边界和5滚动检查。当前整包130项测试通过，包含另一会话的既有工程测试。原文正式产品最小1280×720不变；800×600和922×720是本视觉副本的紧凑审阅范围，640×480仅压力检查。真实Windows系统缩放尚未实测，浏览器DPR模拟不替代该项。详见本轮review；整体任务仍in_progress。

复核本轮已保存数据及责任源码（从仓库根运行）：

```powershell
node design/frame-visual/tools/window-adaptation-contract.cjs
node --test --test-isolation=none design/frame-visual/tests/*.test.js
```

旧修订的源码哈希只对应当时快照，不作为当前源码验收命令。

## 历史：唯一布局编辑入口与页面组合 revision-08（2026-10-02）

本会话只处理框架、共用控件和内容管理视觉，具体外部组件交由其他会话。`sidebar-review.html` 提供页签、列表、网格与分区组合的左右样稿，以及空态、不可用、长内容、内容库和统一布局编辑状态。示例字段只用于视觉检查，不定义音乐功能。

“工作区布局”组件内的“编辑布局”是唯一模式入口。正常使用可浏览、输入、搜索和临时收放侧栏；几何尺寸、排列、占宽、呈现、内容加入/移出及图标设置均锁定。开启编辑后所有修改共用一次内存事务；确认保留，取消/Esc撤回全部布局修改，内容输入、选择和阅读记忆保留。编辑时网格仅提供蓝色选中和拖动反馈，占宽/移动/移出控制集中在布局组件内。工作区布局不进入普通内容库。

样稿只在显式查询 `presentation=grid|list|tabs|mixed&contentSide=left|right` 中启用；默认结构入口与runtime不填入示例。mixed在同一页面的不同内容区采用不同呈现，每项内容身份唯一；网格排序只作用于所属区。runtime布局页和Shell的视觉交互同样消费现有adjusting状态，禁用模式外配置与尺寸操作；命令策略、注册/编排和生命周期工程继续由对应工程维护。普通操作保留谱页矩形，窗口变化保持宽/Y并居中，滚动条隐藏。本轮证据位于evidence/revision-08；revision-07属于旧独立编辑规则的历史记录，其源码哈希不适用于本轮。任务仍in_progress。

## 历史：可调整上栏 revision-06（2026-10-02）

上栏默认/最小40px，可拖动下边缘短标记调整，方向键微调、双击恢复；右侧布局页有“上栏高度”输入。最高160px，实际上限与底部已存高度共同约束，保留300px工作台。关闭记住高度，布局取消还原、确认保留。声部标题32px、控制行40px；两条图标列40px、按钮32px、图形16px。两侧默认260px、1024画布等宽232px。

普通操作保留谱页屏幕矩形，窗口resize保留纸宽/Y并居中；上下展开压缩两侧高度，所有滚动条隐藏。当前证据为evidence/revision-06，任务仍in_progress。以下revision-04尺寸为历史。

插件作者适配器和目录见plugin-authoring.md。另一会话的统一panel声明及侧栏编排状态已经进入代码；集成预览当前仍实际承载四个右页，左侧及上下内容容器/管理流程尚未接入。后续承载方案见sidebar-composition-plan.md；本次仅补上栏几何，保留并发接口改动。

本轮视觉验收见evidence/revision-06/review.md。完整矩阵与最新插件工程处于两个记录快照，复核视觉几何及并发更新后的预览使用 `node design/frame-visual/evidence/revision-06/verify-visual-evidence.mjs`。最新整包58项测试通过；历史验收命令和结果保留其原版本含义。


## 历史：revision-04 上下薄栏（2026-10-02）

上下区域横贯框架，上栏28px默认可见，声部标题24px与合并控制条28px常驻。声部内容展开或顶部开合会改变左右栏和两条rail的共同高度；左右默认与均衡均260px，紧凑均230px，1024画布下同步收窄为230px。两侧手调宽度可独立修改；右栏最小230px。

上下使用#202125薄条，与两侧#242529页面承载面区分，无装饰描线。纸页保留屏幕坐标和大小，窗口resize保留Y与纸宽并水平居中；滚动条仍隐藏。下方revision-03的独立区域规则属于历史。

当前证据在evidence/revision-04；使用以下命令复核，旧证据不代表当前源码：

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/horizontal-bands-contract.js
node design/frame-visual/tools/audit-copy.cjs evidence/revision-04/scope-audit.json
node design/frame-visual/tools/audit-runtime.cjs evidence/revision-04/review.json evidence/revision-04/runtime-scope
```

框架任务继续in_progress，仅视觉副本。窗口增长造成原生滚动钳制的fixture位置跳动已修复，解耦入口仍复用原视图控制器。

## 历史：revision-03 独立区域（2026-10-02）

完整结构稿与解耦集成入口共用独立区域几何：左右栏保持标题下方至合并栏上方的完整高度，上下区域位于固定中央宽度内；顶部保留36px工具槽，开关只隐藏槽内内容。底部展开占中央空间，谱页保持屏幕位置与大小，可在工作台内滚动。关闭一栏不重新分配其他栏的尺寸容量；四栏与工作台矩形不重叠。

`styles/scrollbars.css`覆盖谱面、侧栏、模块、图标栏、页签、浮层和状态目录；原生滚动条及空槽均隐藏，保留滚轮、触控板和键盘浏览。两个软件入口通过base.css消费同一规则。

当前验证保存于 `evidence/revision-03/`：96种状态的布局与滚动条检查、四种窗口尺寸下两个入口的150次开合、10项实际滚动检查、滚动后resize及输入保留。13项Node测试通过。支持画布下限仍为1024×720；Windows实际系统缩放未实测。上一轮revision-02及第一批runtime-integration结果为历史证据，下面历史命令不能用于证明本轮源码通过。

当前复核命令（从仓库根执行）：

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/independent-regions-contract.js
node design/frame-visual/tools/audit-copy.cjs evidence/revision-03/scope-audit.json
node design/frame-visual/tools/audit-runtime.cjs evidence/revision-03/review.json evidence/revision-03/runtime-scope
```

本轮只在视觉副本与当前任务中修改；重构后的唯一前端路由、插件声明、组件宿主和谱页控制器保持既有边界。整体视觉框架继续 `in_progress`。


## 历史：revision-03 独立区域（2026-10-02）

完整结构稿与解耦集成入口共用独立区域几何：左右栏保持标题下方至合并栏上方的完整高度，上下区域位于固定中央宽度内；顶部保留36px工具槽，开关只隐藏槽内内容。底部展开占中央空间，谱页保持屏幕位置与大小，可在工作台内滚动。关闭一栏不重新分配其他栏的尺寸容量；四栏与工作台矩形不重叠。

`styles/scrollbars.css`覆盖谱面、侧栏、模块、图标栏、页签、浮层和状态目录；原生滚动条及空槽均隐藏，保留滚轮、触控板和键盘浏览。两个软件入口通过base.css消费同一规则。

当前验证保存于 `evidence/revision-03/`：96种状态的布局与滚动条检查、四种窗口尺寸下两个入口的150次开合、10项实际滚动检查、滚动后resize及输入保留。13项Node测试通过。支持画布下限仍为1024×720；Windows实际系统缩放未实测。上一轮revision-02及第一批runtime-integration结果为历史证据，下面历史命令不能用于证明本轮源码通过。

当前复核命令（从仓库根执行）：

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/independent-regions-contract.js
node design/frame-visual/tools/audit-copy.cjs evidence/revision-03/scope-audit.json
node design/frame-visual/tools/audit-runtime.cjs evidence/revision-03/review.json evidence/revision-03/runtime-scope
```

本轮只在视觉副本与当前任务中修改；重构后的唯一前端路由、插件声明、组件宿主和谱页控制器保持既有边界。整体视觉框架继续 `in_progress`。


2026-10-01 从 `design/frame` 原样复制后优化。原框架33个文件的复制前 SHA256 保存在 `copy-provenance.json`；原件保持只读。结构覆盖《吉他打谱软件 · 界面框架方案（结构与布局）》全部17章的视觉规划，颜色与静态谱页来自用户指定的 approved frame 母版。用户第二轮现场意见是当前视觉规则：删除白色/浅灰线框，组件常态边缘透明，仅编辑选中时出现蓝色描边；布局组件作为右侧栏的完整页面，左右面板样式统一，组件操作保持谱页大小。完整规划及修订记录保存在 `.trellis/tasks/10-01-backup-frame-visual-polish/`。

## 查看

从仓库根目录启动：

```powershell
npm run serve --prefix design/frame-visual
```

服务绑定 `127.0.0.1:5193`。建议窗口1280×720以上；紧凑审阅覆盖800×600与922×720。当前两条图标列各40px、正常两侧各260px；1024宽下默认各232px，可保留480px工作台。更窄窗口的工作台按剩余空间分配，纸页尺寸保持、内部浏览。

- `structure-preview.html`：当前八区域结构视觉稿。默认在右侧页本显示工作区布局组件，普通模块区按需打开，声部内容收起。默认不装入占位模块。支持四区域开关、工作区统一排布、模块布局编辑、页签与翻页、设置内的布局方案、菜单与浮层、调整边缘及键盘操作。
- `review.html`：S01–S32，共96种视觉变体的目录；每个链接可单独复现状态。
- `index.html`：副本原有四 dock 运行时入口，用于插件与皮肤兼容检查。
- `runtime-preview.html`：2026-10-02 第一批解耦集成入口。沿用结构视觉稿的皮肤和谱页，接入同一命令路由、宿主布局状态、插件页面声明与持久组件实例。具体架构、验证和后续范围见 `runtime-integration.md`。

单一状态通过查询参数选择，例如 `structure-preview.html?scene=S09&variant=entered`。调试测量对象仅在查询参数有 `debug` 时提供，不在最终外壳内添加开发控制。

## 实现边界

2026-10-02 侧栏调整标记修正：左右8px透明拖动热区对齐可见面板边缘，2×20px短标记居中；悬停、拖动和键盘焦点仅改变短标记颜色，不再显示全高长条底色或描边。复用16px面板内缩，保持原鼠标/键盘调整和谱页位置规则。

完整视觉稿只使用原生 JS/CSS 和内存 fixture，不接入布局持久化、业务引擎或真实产品。谱面来自母版已经生成的静态 SVG，两个字体内嵌；几何与字体声明均可与母版核对，没有运行母版旧构建脚本。源文件、资产哈希与提取步骤见 `fixtures/score-provenance.json`。

本副本已提供标题、按需上侧、图标栏、模块网格、白纸舞台、右侧页本、最右页签和底部两行。特殊布局页面标题为“工作区布局”，从最右页签打开并占满右页内容区；它不注册为普通模块，不出现在模块库内，不承载 A/B/C 谱面块、组件组合或接合。页面包括区域示意、顶部/左栏/右栏/底部显隐、左右栏宽度、底部高度与整体排布。均衡排布统一设置左240/右300/底120px；紧凑排布统一设置左200/右260/底80px；恢复默认恢复默认显隐和尺寸。左栏模块编辑立即生效、完成退出；工作区布局调整使用上侧取消/确认，取消恢复进入前区域状态、尺寸和排布。预设通过“设置 → 工作区布局…”访问，主界面没有预设行。业务按钮禁用或显示占位。

界面以空间和微弱底色层级组织内容。左侧栏用标题、低对比承载面和常态调整把手标识完整范围，手调至少200px；窄于1024px的嵌入视口使用真实窗口容量。组件、区域、页边、浮层和输入框没有白色装饰描边；普通模块仅编辑选中时有蓝边，键盘焦点保留蓝色标记。左右承载面共享底色、32px标题和镜像圆角，左栏不使用渐变。谱页仅首次进入或用户主动选择缩放时计算大小；插件、模块、页签、区域开合及尺寸调整均保持宽高，空间不足时在独立纸页区内滚动。

2026-10-02 居中规则：谱页以整个窗口的水平中心定位。首次整页根据该中心两侧的工作台可见空间计算纸宽，四边至少20px；窗口变宽或变窄后重新对齐窗口中心，保留纸宽和纵向位置。侧栏、上/下区域、模块、页面、尺寸和排布操作保持当前谱页屏幕位置与大小。工作台与各栏独立分区，滚动视口只占工作台，不与侧栏重叠；空间不足时内部裁切和滚动。主动缩放保持水平中心和纵向位置，主动滚动移动视图；窗口尺寸变化会恢复水平居中。

原运行时的 layout model、layout store、registry、plugin API、host、测试合同保持一致。表现性改动限于共用皮肤、标题34px及浮层即时关闭；清理、焦点恢复和组件交还保留原路径。未读取或引用已废弃的 `apps/workbench/**`。

## 验证

原3项插件测试可在仓库根目录执行：

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js
```

默认 `npm test --prefix design/frame-visual` 在本机受限沙箱遇到 Node test worker 的 `spawn EPERM`；本轮以已有的等价单进程方式通过3/3，不能将默认命令描述为已通过。

原件、合同及静态谱面来源检查：

```powershell
node design/frame-visual/tools/audit-copy.cjs
```

重新渲染检查使用 CUA：从 `review.html` 的96个链接导航到场景，再通过 `tools/revision-02-contract.js` 的只读 DOM 采样函数记录结果。浏览器操作不调用预览内部状态修改函数。当前采样保存在 `evidence/revision-02/review.json`。

复核已保存的本轮证据：

```powershell
node design/frame-visual/tools/visual-review.cjs
node design/frame-visual/tools/structure-geometry.cjs
```

两个命令复核证据与当前源码哈希，以及记录的透明边缘、右侧布局页、左右一致性、舞台、页本和浮层合同；它们不会启动浏览器。源码变化后会拒绝旧证据，需要重新使用 CUA 采样。第一轮浏览器脚本原文保存在 `evidence/revision-02/before-source/`，旧版96状态截图与报告在 `evidence/` 根目录，属于历史记录。

本轮实际窗口、1024/1280/1440/1920尺寸、96状态及按钮操作的范围见 `evidence/revision-02/review.md`。Windows 实际系统缩放100/150/200%尚未实测；第一轮 DPR 模拟不能作为本轮缩放验证。截图和状态检查不代表 M0–M7 业务功能已完成。

## 恢复

本轮全部 UI 改动位于此副本，可随时回到只读原框架查看。若需要重建，另建目录并从 `design/frame` 复制；不要覆盖 approved 母版，也不要删除整个 `design/`。原件哈希和继承文件改动清单见 `evidence/scope-audit.json`。

## 工程集成验证（2026-10-02）

上文“原运行时合同保持一致”和96状态验收属于视觉阶段。新集成阶段新增独立入口和模块，原来的33文件备份、14个继承合同文件、10个视觉参照文件保持原有哈希；新证据写入 `evidence/runtime-integration/`，不重写视觉阶段记录。

```powershell
node --test --test-isolation=none design/frame-visual/tests/plugin-platform.test.js design/frame-visual/tests/workspace-runtime.test.js design/frame-visual/tests/stage-viewport.test.js
node design/frame-visual/tools/audit-runtime.cjs
```

第一条为12项测试（原3项加新增9项）；第二条核对备份与视觉基线，并记录新源码哈希。实际浏览器检查包括区域开合、布局取消/确认、页切换和输入保留、尺寸调整、主动缩放、滚动及1024/1280/1440窗口几何。完整模块库、预设、业务菜单、布局持久化与真实内核接入属于后续批次；集成入口对应按钮暂时禁用。`structure-preview.html` 继续保留完整视觉场景与交互参照。
