# 基础设施专项审计与根因修复

首轮日期：2026-10-07；最近续验：2026-10-09。活动任务仍为10-05-shared-staff-score-readonly，in_progress。
用户授权开始早期基础审计；本轮inline执行，没有派发子代理、发送其他会话消息、新建任务或整体提交混合工作树。

## 当前判断

2026-10-09按用户要求改为有限收尾：现有支持范围的开发准入与完整发布资格分别判断，具体入口、退出条件和后续接缝以[开发准入说明](../development-readiness-v0.1.md)为准。不再要求所有G1/G6/G7及整体视觉pending项先通过，才能开展任意既有接口下的功能；确有接口/状态所有权/数据完整性或释放缺陷仍先修对应边界。本切片没有接管其他会话的四栏视觉增量或新增业务平台。

本次F-24实际复现布局读端口包装丢失回调返回值，导致异步拒绝绕过原通知隔离；四端口统一返回结果给原源所有者，未改变接口/版本或状态归属。旧布局任务的UX-01/UX-02 blocked同步为修复已交付、整体视觉仍pending；后续实际结果见[本轮收尾证据](../evidence/development-readiness-20261009/verification.md)。以下按日期保留既有切片及候选记录，旧EXE不能批准今天的前端生成增量。

最新三页产品接线已实现：最近／插件／设置消费原协调器与宿主最近ID，复用原管理控制器；同一原生窗口通过逻辑尺寸适配转场，完成后挂载唯一工作区，返回继续保留原实例。F-21已关闭通知重入释放后仍发请求的缺口。产品自动化、生成和新候选编译通过；尚未实际操作这版原生窗口，不将接线/编译通过扩大成视觉、系统缩放或IME资格。

最新偏好切片已将欢迎页密度/字号接入原设置文档，计划/偏好共用原文档读改写队列；F-23实际复现并修复原计划owner释放后排队任务仍写盘的缺口。修复前8/9失败证据保留，生命周期guard现传至排队结束及读后/写前。当前验证和候选以[偏好切片结果](../evidence/startup-appearance-20261008/verification.md)为准，真实原生操作仍暂停；这不授予G1/G6/G7资格。

当前正式4.0公共挂载链、单UI router、只读文档和宿主状态分工能够支撑受控开发；
首轮确认的三类故障及后续F-04/F-09/F-10/F-11均在原权威实现中修复，没有增加平台、路由层或谱面数据权威。
**尚不能声明基础设施整体成熟、可以按所有能力大批量开发插件，或者产品达到商业发布资格。**
配置单写者已在后续续做中落实并通过真实原生子进程/磁盘回归，Windows长路径原子存储缺陷也已修复；当前EXE已重编译。
2026-10-08续验又确认并修复F-10启动失败处理：最终6e34524d…EXE在真实同域第二实例冲突时只显示原生提示，关闭后返回1，无panic，首实例和限定配置保持。
旧6e候选实际WebView的配置保存重启、真实打开/取消/坏文件保护、重读后直接Ctrl+N及125.5%数值缩放已通过；原生Ctrl+滚轮、系统缩放/IME、独立作者文档和完整设备/容量指标仍未闭合。
2026-10-08作者续做发现F-11：公开SDK与宿主分别打包时，私有Symbol导致合法包误拒绝。正式SDK改用共享运行时标记，原manifest/UI/权限校验保持；独立作者七文件包、指南及提交工具已交付，参考包真实行为5/5通过，但独立作者资格仍pending。
新EXE为dc9a8db0…，实际启动后窗口捕获被用户物理Esc停止，因此本候选原生验收pending。新增持续边界检查复用原测试/生成器，检查独立打包、设置所有权、通知/生命周期、只读和资产一致性，并记录前后指纹。
续做证据见[配置写者验证](../evidence/config-writer-lease-20261007/verification.md)和[同版桌面验收](../evidence/desktop-foundation-window-20261008/verification.md)。
首轮检查时布局会话已报告预览/应用和内容编辑表达修复，实际路径验收由原会话交付；本会话只读状态，不接管其视觉修改。
本轮通过的是明确指纹窗口，不自动批准其后续增量。
最新固定集合续做关闭F-13计划外包默认启用与F-14管理API导入即自动启动。新增编译包可通过metadata/package成对显式接入同一目录、存储和正式平台；10项受控装配回归通过，默认集合和四栏几何不变。新增集合的实际磁盘/进程重开、独立作者和容量资格继续pending。当前生成桌面资源已更新，dc9a旧EXE不能视为包含这次修改。

范围及调用者见[模块/接口/状态地图](infrastructure-foundation-map-20261007.md)，
判定依据为[基础验收标准v0.1](../infrastructure-acceptance-v0.1.md)。完整证据位于
`design/frame-visual/evidence/infrastructure-foundation-audit-20261007/`。

## 已确认问题与修复

| ID/优先级 | 修复前实际行为、最早失效点 | 根因及修复 | 本轮状态 |
| --- | --- | --- | --- |
| F-24 / P2（公开布局通知包装） | 真实workspace owner通过捕获后的读端口订阅async观察者，strict rejection进程退出1；新回归11项中1项失败 | captureLayoutReadPorts包装调用listener却丢失返回值，原源所有者无法观察Promise拒绝。包装返回原结果，继续复用既有notifyObservers；无新通知层 | 四端口实际源回归、正常观察者继续收到已接受状态、原owner诊断及重复unsubscribe后不再交付；最终检查见本轮证据 |
| F-01 / P1 | 平台register和设置write已修改状态，却因第一个观察者抛错向调用者报失败；后续观察者收不到通知。诊断hook抛错还阻断后面的插件安装。异步观察者拒绝会逃逸 | 通知直接调用回调，或包装回调丢弃返回值。正式平台/设置/诊断/文档共用窄通知helper；备份原helper排空拒绝，通知/谱面/文档/工作区沿原链转交结果；捕获订阅集合，不等待观察者 | 已修复；先失败后通过的回归及严格拒绝子进程证据已保留 |
| F-02 / P1 | async mount虽显示局部加载失败，Promise拒绝仍逃逸；async dispose/onDispose/setVariant/setVisible也会产生未处理拒绝 | 同步边界只校验形状/捕获同步throw，没有观察Promise。原runtime-support新增同步返回检查；原ComponentHost和DisposalScope在拒绝非法异步返回前观察拒绝，继续其余资源清理 | 已修复；局部错误、兄弟组件继续工作、资源一次释放及旧ctx失效已验证 |
| F-03 / P1 | parser返回的可变对象被registry按引用保存；修改输入/read引用能绕开parse和通知，独立registry默认值可被污染。async parser也未被统一拒绝 | 设置值没有在所有者边界捕获。正式registry独立复制并递归冻结JSON值；同步parser/null信号明确，拒绝非持久化或异步值；SDK默认值验证同时观察并拒绝异步parser | 已修复；输入/读取/序列化/默认值隔离、非法值原子拒绝、false/0/空集合/嵌套null及3.0/4.0普通数据回归通过 |
| F-11 / P1 | 独立SDK bundle的合法4.0包进入现有正式宿主被误当internal manifest，报Invalid UI plugin manifest；原共用vendor参考测试通过 | SDK用模块私有Symbol，分别打包导致身份不同。唯一正式源码改用Symbol.for共享同一运行时身份；原捕获/权限保持，无新平台或特殊插件分支 | 已修复；独立包真实宿主试验由1/5到5/5，未来API/越命名空间拒绝回归通过；旧bundle需重建，标记非授权/序列化协议 |
| F-12 / P2 | 原startup --check在frame cwd通过，在仓库根cwd报Formal platform bridge is stale；同一资产未改，工具回归5/6 | esbuild隐含caller cwd改变生成源标签。三个startup打包入口及motion固定absWorkingDir为frame；作者SDK已有显式root。原生成器跨root/独立临时cwd回归6/6，不通过手改产物消除失败 | 已修复生成工作目录边界；原失败和包目录通过日志均保留，同版桌面资格仍独立 |
| F-13 / P1 | 有已校验启动plan时，额外无设置的trial.unlisted包不属于plan却active，命令返回ok。保留原runtime/activation源的受控重放确认；不是原生进程或安全沙箱绕过 | 应用目录与编译包分开，无计划成员准入；activation对缺项使用默认true。原装配新增metadata/package成对捕获与共享目录，计划模式拒绝无目录plugins；正式activation恢复同时拒绝plan未声明包 | 已修复受控完整链；早拒绝、原parser/安装失败回滚、保存失败/重试、同会话保持及完整重建恢复均通过，新增集合原生另验 |
| F-14 / P2 | 完整壳DOM存在时，只import管理API便读一次存储并挂载默认管理实例；新组合页可能重复初始化。修复前实际回归1!==0 | 可复用API与自动bootstrap在同一模块。将原bootstrap原逻辑移至薄plugin-startup-entry.js；经典生成器消费entry，原模块只导出管理API | 已修复导入副作用；显式mount才读取，原经典自动入口仍由既有回归验证，不新增平台或生命周期实现 |
| F-15 / P2（测试底座） | 整包pointerdown监听警告可复现；真实popover关掉后Node DOM替身仍留监听，专项修复前1/3。raw Node v24.15.0以true删除capture监听残留1，改对象参数归0 | 测试DOM直接继承Node EventTarget，布尔capture删除语义与浏览器不一致。在测试边界统一布尔→对象，document/window/node共用，不修改产品弹窗、不补全局polyfill | 专项3/3；20次真实弹窗开关逐次归零。双runtime resize实测0→8→16→8→0，属于合法活跃峰值，保留Node警告、不提高阈值；不当作实际浏览器或长期资源资格 |
| F-16 / P1（验收判定） | 实际作者模块提前process.exit(0)，旧验证器在tests.log为空时报告passed；同一输出目录再次运行覆写旧报告；修改package.json后提交指纹未变 | 作者验证器自行维护退出码判定，未复用持续检查完整TAP规则；目录递归创建后直接写入，提交图又漏元数据/宿主源。提取共用子进程/TAP/超时及新目录规则，作者自动先查原startup资产，追踪元数据/提交/限定宿主源前后指纹 | 原始三项复现保留；新增七项及原工具共23/23通过。提前退出失败、旧证据拒绝覆写、变化/结束指纹失败为stale；最终统一/整包结果见本批报告。独立作者/沙箱/真实UI资格不随之通过 |
| F-20 / P1（文档接受） | 旧accept_opened_file在原import_file接受作品后用?传播恢复清理错误，可能让UI保留旧谱面却宿主已是新作品 | 作品接受与附属磁盘操作共用失败语义。原接受链现在返回成功原子作品和可选warnings，恢复清理/最近登记失败分别提示；登记可独立重试而不重新导入 | 真实Windows独占锁和恢复路径故障测试确认B已接受、两项警告、旧目录保留及登记重试不改作品；原client/source/底部图形回归通过。没有新增恢复清理重试端口，残留恢复风险不宣称已消除 |
| F-21 / P1（通知重入生命周期） | 原只读源run发布busy后，观察者同步dispose，仍执行operation；真实生成桥调用计数显示createGuarded=1。登记重试也存在同类边界 | 只检查动作开始与响应接受，没有保护同步通知之后的请求分派。原run及recent.retryRegistration在通知后、请求前再次检查disposed/epoch；已发IPC仍不假设取消 | 原正式专项23/24、备份组合10/11先失败；修复后正式24/24、组合13/13。新正式一项遍历new/open/recent/reload/register五条路径；未新增平台或补丁分支 |
| F-22 / P2（文档漂移） | 固定装配合同写成旧计划缺已知新id必拒绝；原校验器与既有回归实际按目录默认补齐读取，独立作者可能依错误合同规划兼容性 | 描述未对照原权威读取行为。改正为已知缺项读时按目录默认补齐、不自动写回；未知/已移除id及未知参数拒绝。新增可选项需主动启用则metadata.enabled=false | 原reader受控probe验证默认false/true与输入不变，原回归保持；只修文档，未修改校验器、schema或默认启用行为 |
| F-10 / P1 | 租约拒绝第二实例后，setup Err引发Tauri panic并退出101；两个中间提示修复版本关闭后又返回0，失败被记为成功 | 默认窗口早于状态初始化；预期失败交回setup panic；零WebView退出又与异步提示回调竞争。延后原窗口，先租约/AppState再WebView；失败异步原生提示，run_return清理后保留setup已确定的失败码1 | 已修复；最终同版真实第二实例提示/退出1/首实例保持/四配置存在状态与哈希保持通过，中间失败日志保留 |

F-01的隔离只针对接受状态后的观察通知，不吞业务run或读取失败。原诊断先保留，onDiagnostic失败不再归责给无关插件，也不递归报告。
F-02没有允许异步mount或异步释放，不能把排空Promise说成异步资源已经清理；插件仍需同步登记清理，并对异步业务采用有效序号/协作取消。
F-03不冻结作者输入，不改变API/envelope/schemaVersion；设置接受类型现明确为JSON数据。
依赖Date/函数/稀疏数组或修改read引用的写法需改为显式JSON值。这是本次可观察的接受边界收紧，已写入权威合同，不能声称任意旧parser输出都保持兼容。

修复文件为正式`plugin-platform.ts/plugin-settings.ts/plugin-sdk.ts/plugin-diagnostic.ts/readonly-score-document-session.ts`及新增`notify-observers.ts`，
备份`runtime-support.js/component-host.js/notices.js/staff-read-port.js/document-staff-projection.js/workspace-runtime.js`。
原副本保存于证据`before/`，没有还原或覆盖其他会话的增量。

## 未关闭的基础门槛

| ID | 证据及影响 | 推荐处理与通过条件 |
| --- | --- | --- |
| F-05 / G1文档开发资格 | A/B/C指南、独立七文件SDK包与真实提交验收工具已就绪；生成参考独立打包5/5通过，但作者已读私有实现，不能证明独立开发资格 | 未读私有实现的作者按指南自主完成A/B/C，记录资料/过程/额外澄清；author:verify保存语义和前后指纹，仍须另核独立资格 |
| F-06 / G2目录装配范围 | 现有startupEntries显式捕获目录与编译包；独立SDK的trial.configured经过管理控件、生成Tauri服务、正式设置恢复及完整会话重建通过。该回归使用fake invoke，不是实际磁盘/进程重启 | 限定固定集合的自动化缺口已关闭；新增集合仍须同版原生保存重开。目录只支持既有number/select及schema1；已知缺项按目录默认补齐读取，不自动写回，未知项拒绝。新增可选项需主动启用时metadata.enabled须为false。外部安装后置 |
| F-07 / G6容量 | 100次受控循环、开发机校验/分页与真实文件/Native host/备份投影/分页基线已有证据。用户选择Windows/4核/8GB规划目标，绘制工程门槛及消费原renderStaff/字体的经典工具已准备；工具受控回归不是浏览器样本 | 参考设备、实际VexFlow/SVG/WebView、完整其他阶段阈值与长期资源仍pending。区分warm Node链、孤立绘制工具与真实Rust IO/IPC/冷启动/产品交互；不由开发机或工具绿灯授予G6 |
| F-08 / G7当前桌面版本 | 旧6e34524d…EXE的475文件同版关键窗口验收保留。作者SDK修复和同期布局增量进入新dc9a8db0…EXE；新窗口捕获被用户Esc停止，不能搬用旧候选结果 | 新候选关键窗口流程、原生Ctrl+滚轮、Windows100/150/200%系统缩放及IME仍pending；逐项补同版实际证据，不用数值控件/DPR/旧EXE替代 |

F-04续做已关闭限定自动化缺口：AppState获取配置目录独占句柄、真实Rust子进程同域拒绝和正常/强制退出恢复、双状态磁盘重开通过；当前main中的plan/appearance两个store共用同一文档读改写所有者，旧修订保存拒绝。IPC保持原样，各namespace拥有自己的严格envelope，后端仍无CAS；旧未保护EXE、其他WebView/独立模块副本或直接整文档写者不在此保证内。
F-09 / P1潜在文件保护缺陷：原始MoveFileExW未统一Windows长路径，Rust测试进程在320 UTF-16单位中文路径下code3失败，原子新建/覆盖及5项相关存储回归失败。规范化source和目标父目录后，在相同长TEMP下85项原生回归全通过；没有缩短路径或降级保存。2026-10-08最终同版通过正常作品打开/取消及坏文件保护；超长路径的WebView文件选择/作品保存没有在本轮实际窗口重放，不能由进程磁盘测试扩大声明。
完整故障原始日志、进程/磁盘/编译证据和范围见配置写者验证，原先的受控memory探针历史记录保持，不改写为真实进程结果。
F-06不是新增第二平台的理由；目录/设置接线继续属于可信应用装配。

## 本轮验证与可重放证据

下表保留首轮证据；最新配置写者/长路径续做的716/589/85及当前EXE见文末和单独验证记录。

| 验证 | 结果及边界 |
| --- | --- |
| 修复前故障证据 | formal-before.log 0/8；backup-before.log 0/3；related-before分别额外2/3个失败；lifecycle-before额外3个失败；settings-ownership-before额外2个失败；settings-parser-before额外1个失败。保留各阶段其余已通过用例，不合并伪造一份基线 |
| 正式完整测试 | `node --experimental-strip-types --test "apps/workbench/test/*.test.ts"`，715/715；复用现有agent/kernel生成物，没有运行会修改其他会话资源的npm前置build。不扩大为整个Agent/内核模块资格 |
| 备份完整测试 | `npm --prefix design/frame-visual test`，初次及并发增量后的复验均587/587，包含notation/startup生成检查；数量包含同期其他会话增量，不能把全部增长归本轮 |
| 类型 | 生产及test TypeScript通过。初次test类型检查发现故意异步parser fixture的泛型推断错误，改为显式unknown后通过；生产实现未因该fixture错误降级 |
| 三类公开样例 | 5项试验在完整备份回归内通过；作者文件只导入公共SDK，不读宿主状态；宿主测试使用正式平台、原router/registry/ComponentHost |
| 重复运行 | A/B/C组合100次，隐藏/移动不重挂；原实际组合根只读view启动/结束100次；逆序读取100组及失败重试/释放后结果通过。逐轮计数从backup-full.log提取至lifecycle-trials.json |
| 设置与配置边界 | boundary-probes-after.json确认正式设置引用隔离和默认值恢复；同时保存两个plan-store均成功且首变动丢失的受控trace。脚本退出0表示探针断言复现，不表示配置多写者资格通过 |
| 生成资产 | desktop:build重建共享notation12模块、正式SDK/桌面桥接和经典IIFE；motion:check、desktop:check通过，18资源集合/字节一致。没有手改生成算法 |
| 当前指纹 | 初次checks-start/end及最新post-drift-start/end均为223限定文件、各自窗口内未变；最后一轮为2026-10-07T15:37:09Z—15:37:41Z。包含backup源/实际资产、正式plugins/UI、样例/测试/锁及EXE；不是全仓或全部Rust/Agent依赖冻结 |
| 实际环境 | 本轮file://访问被浏览器URL策略拒绝；未用HTTP/另一浏览器/脚本绕过。当前原生EXE未重建、未操作用户作品或配置；这部分pending |

初次UTC窗口对应北京时间2026年10月7日23:28:55—23:29:30，最新窗口为同日23:37:09—23:37:41。
最终封存检查曾捕获3个作者源文件（horizontal-slots-view.js/structure-preview.js/workspace-layout-visual.js）
及2个生成件变化，保存于final-drift.json，原通过结果没有覆盖。随后只读desktop:check通过，
经典IIFE为776309 bytes；本会话针对该新候选重跑完整备份587/587，最新223文件窗口无变化。
本轮基础修复源没有在这批并发增量中改变。后续指纹再变化时仍不得自动复用当前资格。
正式测试里的canvas文本度量替身提示保留在日志，不把该测试当成字体/像素或记谱国际标准验收。

最小重放命令（仓库根）：

```text
node --experimental-strip-types --test apps/workbench/test/plugin-foundation.test.ts
node --test design/frame-visual/tests/infrastructure-foundation.test.js
node --test --test-isolation=none design/frame-visual/tests/infrastructure-author-trials.test.js
node --experimental-strip-types design/frame-visual/tools/audit-foundation-boundaries.mjs
node apps/workbench/node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.json
node apps/workbench/node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json
npm --prefix design/frame-visual test
npm --prefix design/frame-visual run desktop:check
```

## G1—G8判定

| 门槛 | 本轮已经得到的证据 | 尚缺/当前判定 |
| --- | --- | --- |
| G1 文档与公共合同 | 当前4.0入口、JSON设置/同步生命周期/通知合同及A/B/C完整指南；独立SDK包与提交工具交付，参考自检5/5 | 本次A/B/C支持范围已明确；未读私有实现的独立作者实际开发pending，工具通过不授予资格 |
| G2 真实消费与组合 | 原正式平台/router及只读消费通过；新增独立SDK可配置包已通过同目录管理/生成服务/设置恢复/固定会话与完整重建 | 新集合的原生磁盘/进程验收pending；旧配置增加id需单独兼容策略，不扩大为自动发现、外部安装或全部布局体验资格 |
| G3 权限与状态所有权 | 现限定4.0挂载、命令权限、不可变设置及只读投影自动化通过；没有另建权威 | 该自动化范围passed；第三方执行沙箱excluded，不能宣传为安全隔离资格 |
| G4 生命周期与失败 | 非法异步返回/坏观察者、rollback、重复释放、晚到结果和受控资源计数通过；当前桌面启动拒绝/原生提示/失败退出及首实例保持通过 | 这些限定范围passed；不能把当前窄窗口流程扩为全部provider、系统事件或长期资源验收 |
| G5 一致性/持久化 | F-04租约/多适配器、F-09长路径磁盘通过；2026-10-08最终EXE配置保存后新进程恢复、真实作品标题/小节/tempo一致、取消/坏文件保持及重读通过 | 当前限定只读/配置范围passed；作品写入/保存/历史/恢复及超长路径实际窗口资格另验，不能由配置保存替代 |
| G6 重复/容量 | 三组100次受控循环、开发机投影校验/分页，以及真实`.bgp.json`文件/Native host/备份文档投影/分页四规模基线；后者3预热/25样本保留源/编译内核/addon/输入指纹 | Rust文件IO/IPC/冷启动、真实绘制/最低设备/预定阈值及长期资源pending。浏览器file://访问仍被策略拒绝，未换协议或通道绕过，不把Node文件链称为绘制资格 |
| G7 同版实际环境 | 旧6e34524d…EXE的关键WebView/正常重启及第二进程拒绝证据保留；新dc9a8db0…EXE构建成功，新原生观察被用户Esc停止 | 新候选关键窗口流程及Ctrl+滚轮/系统缩放/IMEpending；整体未通过，旧版及并发增量分别判定 |
| G8 版本演进 | API3.0/4.0、facet1及计划格式/未来拒绝既有回归通过；设置收紧说明已记录 | 现有限定普通数据兼容范围passed；对尚未支持的外部安装/升级excluded，不扩大声明 |

这张表不以715或587替代门槛，也不因为当前只读可以运行就宣称编辑基础已经完整。
新UI的音符输入、选择、编辑/撤销/保存/重开和播放仍需真实消费者闭环才能获得相应写入资格。

## 推进顺序与职责

1. F-04/F-09进程/磁盘范围和F-10启动失败已修复；当前同版EXE的启动拒绝、配置保存重开及只读文件保护关键流程已经通过。IPC/JSON版本保持原合同，先补仍pending的原生事件/系统缩放/IME资格。
2. 视觉会话交付预览/应用分离和内容编辑表达的最后实际取消路径/报告，布局工程据交付源补联合复验；本会话已对观察到的增量复跑自动化，不改其CSS/几何/私有视觉文件。
3. 完成独立作者三类试验并在实测前确定设备/文档规模/容量阈值。知情作者自测不能替代独立资格；新测试插件若需要私有状态，先归档合同缺口，不能为让它通过增加隐藏入口。
4. 当前基础范围获得资格后，再开放核心谱面同版交互读端口；复用成熟输入/历史/文件服务形成首个真实编辑闭环，届时检验写入范围而不是批量复制未验证的插件。

历次切片未改记谱算法、Rust生产IPC签名、废弃产品页面或默认插件集合；2026-10-08改了共用Rust宿主的启动顺序和失败处理，没有接管视觉布局。代码、样例和证据可审阅，未整体stage/提交/归档。

## 2026-10-07配置写者候选（阶段历史）

原报告715/587和168683…EXE为上一轮历史记录；续做候选的正式716/716、备份589/589、原生85/85（另1个ignored子进程辅助入口）、生产/test类型、motion/desktop检查通过。
当前EXE为4ffcb60a…，classic776340bytes，18桌面资产；474限定源/资产/锁文件测试和构建前后窗口均无变化。
计数包含同期正式平台增量，不把它们都归本轮；当前EXE编译成功仍不等于真实WebView已通过。详情与可重放步骤见配置写者验证。

## 2026-10-08早期桌面候选（历史）

该阶段EXE为6e34524dda6438d2a6aaa20bbce0c80267d59750e4b411a45b432397bffb1cb0；F-10最终原生第二实例退出1且首实例/限定配置保持。
同版管理页、参数保存后正常重启恢复、真实空谱/打开/取消/坏文件/重读后直接Ctrl+N及125.5%连续数值缩放通过；原计划已通过UI恢复并保存。
本轮Rust87 passed+1 ignored进程辅助入口、startup专项2项（包含在87项内）、bootstrap7/7、desktop:check18资源及独立debug构建通过；716/716和589/589是上一轮全量，不写成本轮重跑。
475限定文件在构建前后及最后原生操作后无漂移，EXE指纹一致。观察15/17/26的错配截图已排除，瞬时延迟以稳定观察判定；失败和中间退出0日志保留。
详细动作、证据及可重放步骤见[同版桌面验收](../evidence/desktop-foundation-window-20261008/verification.md)。G1/G6及G7剩余项继续pending，不开放音符输入或宣布整体基础成熟。

## 2026-10-08作者边界与持续回归续做

F-11在独立SDK真实包路径复现并修复，最终作者工具10/10、参考独立包5/5；本批正式716/716、备份604/604及生产/test类型通过。
这些全量结果属于作者准备切片，包含同期增量；后续持续检查的结果单独记录，不写成再次全量。
新backup debug EXE为dc9a8db019876fd25282471a3822acbb809c500cd4890e375288afa929db3260，原生窗口启动成功但捕获被用户Esc停止。

持续检查入口foundation:check把原权威回归和生成器串联，保存新证据目录、非零完整TAP汇总和前后指纹；空跑/跳过/超时/失败不能通过，源变化为stale。它只检查声明清单，不替代独立作者、Rust磁盘/进程、实际WebView/容量或产品发布资格。
新增工具最初的npm相对路径失败日志保留，随后修正为仓库根解析并增加跨cwd行为回归。
原生成器进一步复现F-12工作目录依赖，固定原esbuild入口后6/6工具回归通过。检查时另记录同期三个视觉源增量；没有还原它们，旧dc9aEXE不能自动获得这些后续源的资格。

详细证据：[作者开发资格准备](../evidence/author-development-qualification-20261008/verification.md)、[持续边界回归](../foundation-boundary-regression.md)。G1/G6/G7继续pending，编辑业务尚未开放。

持续入口最终9步骤passed：正式31/31、备份69/69、五组生成及两类型；备份全量613/613。定向和完整回归各自778限定文件前后无变化，原工具/构建工作目录失败记录保留。详情：[预防切片验证](../evidence/boundary-prevention-20261008/verification.md)。本轮未取得新的桌面窗口或容量资格。

## 2026-10-08可配置固定集合续做

F-13保留原runtime/activation源的无设置包重放：packageDeclaredInPlan=false但status=active，命令ok；修复后应用入口与底层activation均拒绝。F-14完整壳DOM上import管理API的存储读取1!==0先失败，拆出原自动入口后通过。可配置包由独立SDK编译，目录/包成对装配；原控制器、生成Tauri服务、正式registry/router/平台及工作区rollback均复用。

新增10项装配回归通过；持续入口9步骤passed（正式31/31、备份79/79、五生成及两类型），备份全量631/631。定向与整包各自783限定文件前后无变化；计数含同期其他工作。18桌面资产已生成，classic783820bytes；未构建新的原生EXE，dc9a旧候选不能批准当前装配/同期源。真实原生新集合重开、独立作者和G6仍pending。

目录schema1/number/select范围及计划模式拒绝无目录plugins写入[固定装配合同](../../../.trellis/spec/frontend/plugin-startup-assembly-contract.md)。旧配置已知缺项实际读时按目录默认补齐、不写回；2026-10-08启动协调续查按F-22更正此前“不自动补新id”的错误描述，未改变运行行为。容量计划新增可重放输入、阶段指标和原生剩余项清单，但当时尚未冻结最低设备/数字阈值或生成真实规模作品。详见[本批验证](../evidence/configurable-plugin-assembly-20261008/verification.md)。

## 2026-10-08真实格式文件容量续做

当前文件路径实际为brilliant-score-1 UTF-8 `.bgp.json`；工具复用原factory/公开CommandBus初始化确定音乐，再由原ScoreSessionService Native导入/原codec导出并重开。空谱和16/128/512小节真实夹具往返保持全部音符/休止、身份、标题及零历史，512含2048事件。专项5/5验证未来版本/截断/非法UTF-8拒绝且已接受作品保持，新输出目录不覆盖历史。

开发机i9-13900HX/Windows10.0.26200/Node24.15.0上，每规模3次预热、25正式样本；文件链到分页p95分别约1.90/10.98/104.18/346.27ms。512的hostImportRead中位数约253.11ms，包含原decode、Native打开/读回及notation/playback投影；不是纯内核计时。布局段中位数约0.44ms，因此后续性能调查应分段定位，而不能据总时延修改记谱算法。

876限定源/编译内核文件、Native addon及输入字节在测量前后保持，结果仅baseline-only、thresholds=null、G6=pending。浏览器工具明确拒绝file://访问，未改HTTP/其他表面或原始命令绕过；没有新SVG/WebView或原生窗口结论。详细原始样本和夹具见[文件容量证据](../evidence/document-capacity-20261008/run-01/report.json)，接入规则见[容量合同](../../../.trellis/spec/frontend/document-capacity-contract.md)。

本批持续入口9步骤passed：正式边界31/31、备份84/84、五生成及两类型；备份整包636/636。定向与整包各自786限定文件前后无变化，不把先前正式716完整或Rust87记录说成本轮重跑。未改生产源或构建新EXE。最终验证和版本边界见[本批收尾](../evidence/document-capacity-20261008/verification.md)。

收尾首次指纹捕获窗口后的Agent构建及布局增量；后续boundary-02又捕获检查期间布局源变化和启动产物过期，备份83/84且整体stale，均未放行。原失败/指纹保留，不回退同期源。使用原desktop:build生成当前18资源后，boundary-03九步骤通过（正式31/31、备份84/84及五生成/两类型），备份整包最终644/644、退出0，两个窗口各自807限定文件无变化；本批仍只新增5项容量专项。一次性整包日志采集器的spec/TAP误判保留为失败，随后明确TAP复跑通过。

当前[run-02基线](../evidence/document-capacity-20261008/run-02/report.json)包含897限定源/编译内核文件，addon/音乐输入未变；空谱、16/128/512小节至分页p95约1.97/9.54/66.34/298.44ms，最大规模慢值380.46ms。生产路径未优化，不能把两轮差异称为改善；仍不含SVG/WebView、Rust文件IO/IPC和冷启动，也未冻结最低设备/阈值。G1/G6/G7继续pending，当前classic792259bytes未进入新EXE。当前版本封存状态见本批closeout-final.json；旧stale封存不能替代它。

## 2026-10-08绘制验收准备与测试事件边界

用户已选择Windows/4核CPU/8GB规划目标；实际参考设备仍未指定。绘制部分策略v0.1在首个实际浏览器样本前冻结工程目标，经典测量入口消费原真实文件投影、唯一renderStaff和原字体加载器，12项受控工具回归通过。没有实际浏览器绘制样本，G6仍pending；全部步骤/解释见[绘制验收指南](../notation-capacity-guide.md)。

整包警告续查关闭F-15测试底座差异：原Node v24.15.0布尔capture删除残留，测试DOM归一对象参数后真实弹窗20次逐轮归零；原失败1/3和最终3/3保留。双runtime监听峰值resize16、全部释放0，警告保留，不能把合法活跃峰值叫浏览器泄漏或以提高阈值隐藏。

当前boundary-03十步骤passed：正式31/31、备份99/99、六生成和两类型，832限定源/资产/实际容量输入文件无漂移；整包最终及scoped封存见[本批验证](../evidence/notation-capacity-preparation-20261008/verification.md)。本批新增15项，其余数量含同期增量。原startup生成器对同一当前源check退出0，资源helper提取等价；当前classic793405bytes的同期变化未被还原。本会话未构建/启动新EXE，不开放编辑，G1/G6/G7继续pending。

## 2026-10-08作者验收判定完整性

真实提前退出0却passed、旧报告覆写、package.json变化漏记三项复现保留。F-16已收敛到共用子进程/TAP/超时和新目录规则；作者入口自动先查原startup资产，提交元数据与原限定宿主源/资产进入前后指纹。变化或结束指纹失败为stale，不将退出0当成完成。

本批新增七项及原工具共23/23通过，首次两个夹具假设失败保留。持续十步骤passed（正式31/31、备份106/106、六生成/两类型），备份全量674/674，两个窗口各自835限定文件无变化；参考独立SDK提交5/5且指纹保持。未放宽原A/B/C断言，独立作者仍pending；不把导入图当作沙箱。没有改产品布局/协议或重建EXE，G1/G6/G7剩余资格独立保留。详见[作者验收完整性验证](../evidence/author-verifier-integrity-20261008/verification.md)。

## 2026-10-08启动中心接入前收口与F-17

三页独立视觉候选后的首次整包709/715及过期启动产物作为历史失败保留；后续其他会话完成生成更新。本轮初查原startup/desktop/check通过，备份720/720、850限定文件稳定，未把别人更新归成本轮修复。首次十步骤检查中layout-motion-continuity测试被同期更新，容量回归按真实指纹返回stale；原boundary-01不授予通过，证据未覆盖。

F-17 / P1生命周期缺口：原默认初始化等待read时释放，晚到null仍由readOrCreateInitialScore发出新的create。原业务只在最终accept时检查disposed，未保护helper内部的后续宿主调用。新增真实调用计数回归在原源码失败；修复在原应用会话为helper提供绑定epoch的read/create包装，发请求前检查有效性，继续复用原默认新建/409重读逻辑。已经发出的IPC不假定可取消。本切片没有修改Rust或声称已进行原生窗口重放。

同时增加read-existing初始化策略及原桌面工厂转发：首次只消费原client.read，null不创建空谱，显式新建/打开仍沿原校验/未保存保护。原自动入口保持默认初始化策略；三页产品启动链、最近目录与宿主原子接受仍未接通。此选项是应用合同扩展，不是新插件协议/平台/router。

本轮新增九项正式文档回归，原18项修复前10通过/8失败、修复后18/18；含同步读错误、真实WorkbenchClient/Tauri桥包络、取消/保护/晚到和默认生命周期。重建原桥/经典/19桌面资产后，正式725/725、备份725/725在同一870限定文件窗口通过且无漂移。备份计数含其他会话同期新增项，本轮没有新增备份测试。最终十步骤、生成和封存状态见[本批验证](../evidence/startup-center-integration-readiness-20261008/verification.md)。

原有G1独立作者、G6真实绘制/4核8GB实机/长期资源及G7当前原生窗口/系统缩放/IME仍pending。三页视觉仍待实际评审，不能将上述回归扩大为基础设施商业成熟或产品发布资格。

## 2026-10-08宿主受保护替换与F-18/F-19

F-18 / P1 / 本切片已修复：原只读应用在操作开始时检查替换资格，宿主打开却只有workspaceId，新建只比较ID，等待文件期间同作品版本变化仍能覆盖。真实服务回归证明旧create接受A/v0→A/v1后的ID-only替换；新guarded入口在同一service锁中比较empty或ID＋版本后复用原create/import。原文件helper回归同时确认冲突不删恢复原字节、不变更路径和保存检查点。备份只读源显式新建/打开已接新IPC，缺失端口不降级；旧兼容端口保留，不能扩大声称旧入口已有此保护。

F-19 / P1 / 本切片已修复：普通迟到读与主动重开同ID较早磁盘版本共用无条件版本单调检查，可能导致宿主已接受而UI拒绝更新。受保护主动替换与普通read/reload现已区分；控制源码副本只撤掉此例外即可0/1失败，正式专项最终23/23。新建重放另验证同ID/input/guard不重复创建，改变guard不能伪装重试；serde空分支额外字段首次失败修正后严格拒绝。

当前checks-02十五步骤通过，1107限定源/资产（含Rust/crates与原UI/候选）窗口无漂移；正式730/730、备份734/734、边界45/45与106/106、Rust主集合92通过/0失败/1原子进程夹具忽略，两类型、原生成与独立候选check、备份debug构建通过。Rust父测试额外执行的1项fixture不重复计为主集合唯一测试。备份增加9项为同期工作，本轮仅适配原组合回归，不归成本轮新增。

首次默认临时目录磁盘原子替换权限失败、空分支校验失败及runner CSS路径ENOENT保留；使用仓库TEMP/TMP和正确实际CSS路径后复验，没有绕过沙箱或放宽断言。当前候选EXE SHA以[本批验证](../evidence/guarded-document-replacement-20261008/verification.md)及closeout为准，未操作原生窗口。旧原生结果不授予当前构建资格。

恢复清理和替换不构成跨磁盘事务的原错误语义已明确；提交后清理失败需真实重读确认。后续最近目录/启动协调要正确表达已接受与后续元数据失败，不得把它隐藏为普通“没有文档”。最近目录、三页产品启动和窗口尺寸转换继续待实现；G1/G6/G7仍pending，未宣称基础设施商业成熟或产品可发布。活动任务仍in_progress，混合工作树未整体提交/归档。

## 2026-10-08宿主最近目录与F-20

原宿主新增唯一typed最近目录，复用原配置租约/JsonDocumentStore；完整读改写加Mutex，最多20条且整体256KiB上限保持。按canonical普通文件路径去重，同路径ID保持，移除只改记录。按ID打开在同一service锁内核对身份/版本后走原文件接受链；目录列表不假定每个文件仍存在，坏/缺失文件失败保留当前作品和目录。

F-20关闭原文件已接受后恢复清理错误仍返回整体失败的语义缺口。原链现在携带独立warnings，恢复清理及最近写入真实磁盘故障下仍返回已接受B；原client/只读源与图形状态同步接受。登记可独立重试且不改作品，失败不置文档error，成功不清除尚未处理的恢复清理警告；当前没有恢复清理直接重试端口，不宣称残留风险已消失。前提交错误继续拒绝替换。

新Rust9项、正式7项、备份1项通过。checks-01十五步骤passed：Rust主集合101通过/1项原有子进程夹具由父测试执行，正式737/737、备份739/739、边界52/107、两类型及七生成检查、独立debug构建。1113限定文件在UTC12:28:38—12:31:59无变化，仍不包含全部外部依赖。首次定向未命名夹具错误保留，没有放宽未保存保护；整包其他会话增量另记。

当前EXE ce4fa397…仅构建未操作，不能搬用历史窗口资格。三页产品视图/启动协调/窗口尺寸仍待下一切片；独立作者、真实SVG/WebView/4核8GB及长期资源、原生Ctrl＋滚轮/系统缩放/IME继续pending。完整边界和证据见[最近目录验证](../evidence/recent-documents-20261008/verification.md)。活动任务in_progress，未整体提交/归档。

## 2026-10-08启动中心协调与F-21/F-22

应用协调核心现在复用原controller/store、read-existing源、最近ID端口及实际backup runtime。首次显式文档动作前核对并捕获已保存计划，接受后等待showView完成再挂载；取消不挂载，窗口/构造普通失败重试不重复新建或导入。返回/继续保持原实例和运行集合，下次草稿不会热应用；清理不确定禁止第二次构造。同root所有权、输入捕获、异步晚到及最近逆序都由实际组合试验覆盖。showView仍是待产品实现的端口，默认产品入口和三页视觉候选未替换。

F-21根因是同步busy通知形成有效性变化边界，旧源只在通知前/响应后检查，观察者释放后仍发createGuarded。原正式23/24和实际桥组合10/11先失败；在原run及登记重试请求前补epoch/释放检查后，正式24/24、组合13/13。正式新增一项遍历五路径，备份新增13项；不是通过隐藏按钮、增加平台或仅丢弃响应解决。

F-22按原reader及已有回归纠正合同：已知新ID/参数缺失读时用声明默认，不自动写回；未知项拒绝，需用户启用的新可选项默认false。probe确认false/true和输入不变，未修改原运行策略。

checks-01菜单同期变化和过期生成、checks-02十四步骤全通过但Agent网页client同期变化都保留为stale。checks-03原生重建在rustc内存分配失败，未取得新构建；先前checks-02成功EXE ae0648a1…保留且只编译、无实际窗口结论。checks-04另建完整限定窗口执行13项前端/生成/类型及整包检查，最后状态见[本批验证](../evidence/startup-center-coordination-20261008/verification.md)及closeout.json；没有缩减原指纹范围掩盖并发变化。

后续是三页视图实际消费和同一窗口尺寸转换，之后再取得实际WebView/重启/输入资格。独立作者、真实绘制/4核8GB及长期资源、原生Ctrl＋滚轮/系统缩放/IME仍pending；普通谱面业务保持只读。任务继续in_progress，混合工作树未整体提交/归档。

最终续验：checks-04因Agent生成模块变化stale；checks-05新手势试验七项失败（764/771）且窗口内测试变化，未放行。另一会话随后修复原手势并重建经典/桌面资产，本会话只复验，triage-01同版原文档24/24、协调13/13、手势30/30通过。最终checks-06十三步骤passed：正式738/738、备份772/772、边界53/120、类型及七生成检查；UTC13:38:38—13:41:23的1136限定文件无变化。整包增量含其他会话，本批新增正式1项与备份13项。当前classic817967bytes未进入旧ae0648a1…EXE；原生新构建/窗口资格继续pending，不能用成功前端检查覆盖原生内存分配失败。最终scoped/指纹状态见本批closeout.json。

## 2026-10-08三页启动中心产品接线

三页共用原模板/管理壳和通用视图，真实产品消费原协调器、桌面计划store及read-existing源；最近列表按宿主recordId操作，暂无真实缩略图时显示文件图形。产品页不带示例图或视觉预览徽标，密度/字号仅当前欢迎页，不伪装跨进程设置。独立视觉候选仍私有内存，不携带平台/桥；旧独立管理页保留。

同一main窗口的逻辑尺寸服务已实现：DPI换算、每模式本进程尺寸/最大化记录、workArea限制和失败回滚，完成后再显隐DOM/挂载原runtime。仅备份内联增加四项几何写权限，默认产品权限不扩大。选择/重试/返回/继续沿唯一协调器，真实组合测试确认同一score-view和运行计划、不重复新建/导入；原生操作晚到释放后不继续DOM或后续OS写入。

checks-01十四步骤passed：正式745/745、备份782/782、边界60/130、两类型及八生成检查，限定窗口无变化。本批只新增正式7项与备份10项。随后HTML补共享样式标记/去预览徽标，checks-02三生成及35项相关回归passed；不把旧整包说成针对最终HTML重跑。native-01原锁定离线链加-j1，32.77秒编译成功、限定窗口无变化；cache hardlink降级复制警告保留。新33963520bytes候选SHA256 cd6ccccd…，只编译未打开，不能搬用旧原生资格。

当前桌面21资源、产品IIFE847366bytes、原独立管理classic818048bytes、桥172037bytes。后续优先真实Windows/WebView欢迎→选择→工作区→返回→继续及DPI/最大化/失败提示；用户停止的原生UI操作本轮未恢复。缩略图/设置持久化、G1独立作者、G6真实绘制/4核8GB最低实机/长期资源和G7原生输入仍pending。谱面只读，未授予商业发布资格。结果、版本差异及封存见[本批验证](../evidence/startup-center-product-20261008/verification.md)和closeout.json，任务仍in_progress。

## 2026-10-08启动外观持久化与F-23

欢迎页密度/字号已接原设置文档的独立应用namespace；默认不写盘，坏/未来数据保留，失败保留即时显示值并图形重试，修订冲突明确重读。外观owner独立于文档准备，坏偏好不阻止guarded新建/打开；只影响欢迎页，工作区/旧ApplicationSettingsV1/业务IPC不变。计划和偏好在原文档读改写所有者内串行，保留彼此和其他namespace；不推导多WebView/bundle/直接整文档写入或后端CAS。

F-23 / P1：旧计划owner仅在调用store前及响应后检查释放，排队任务未携带所有权，dispose后仍实际写盘revision1。修复前8/9及原副本保留；原async控制器现把绑定epoch的isCurrent传至store/共享队列，排队结束和读后/写前检查，已发IO不假装取消。新偏好审查还复现冲突后调回旧baseline误报已保存，31/32失败保留；现在保留冲突/重读入口，直到重新建立合法基线。

本批新增偏好10项、实际产品5项，最终相关72/72通过。早期checks-01正式745/备份796通过；checks-02因同期四个布局源变化而stale、七项生成相关失败，checks-03资产过期失败均保留。最终checks-04十四步骤全部通过（正式745/745、备份814/814、边界60/145、两类型/八生成），但唯一预览测试变化仍使原报告stale；closure-01复验该文件与产品29/29、四生成且限定窗口稳定，不篡改原报告或放宽断言。新候选/最终源码与文档封存见[本批验证](../evidence/startup-appearance-20261008/verification.md)及其closeout.json。

实际原生窗口继续暂停，G1独立作者、G6真实绘制/4核8GB最低设备及长期资源、G7当前输入/系统缩放/IME仍pending。缩略图缓存和更多正式设置后续单独收口；不开放普通谱面编辑，不声称商业成熟。活动任务继续in_progress，混合工作树未整体提交/归档。
