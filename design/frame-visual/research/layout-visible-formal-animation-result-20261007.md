# 正式选择、开关与框架四区域动画工程结果

日期：2026-10-07。复用现任务10-07-layout-formal-engineering，用户已授权本轮新增要求及可逆实施。

工程增量已完成：实际frame.layout同次登记shape、selection和content三个作者定义，显式启用三项私有端口；框架顶部、左右rail与voice入口拥有自己的局部开关反馈，四区域拥有真实进入/安全退出呈现。业务、尺寸、选择、disabled和可访问状态仍先由原命令链接受。

**工程检查通过，整体体验仍为Block。** 用户视角审计保留UX-01（接受的区域尺寸会带动设置承载重新排版）和UX-02（编辑/取消文案没有清楚表达内容事务范围）；本轮没有扩大公共尺寸或内容事务合同。接受后零漂移不能替代点击前/接受后承载变化的体验判断，详见[user-experience-audit-20261007.md](user-experience-audit-20261007.md)。

排布不再继续或发起整块设置页的框架位移。合法宿主均衡260/紧凑230等尺寸语义保留；接受后的局部shape/selection继续播放，设置承载、标题、缩略图外框、滑条/输入框/按钮矩形固定。手动尺寸仍即时跟随原宿主容量。

## 接线与边界

- workspace-layout-plugin.js引用LAYOUT_PREVIEW_SHAPE、原WORKSPACE_LAYOUT_ANIMATIONS的selection以及独立LAYOUT_TOGGLE_EMPHASIS；page只转交targets，不转交私有root/身份/definitions。
  每个layout cell是10个独占子目标（5个shape、1个selection、4个toggle），没有外壳或谱面权限。共同4.0身份、ui-motion/1/contractVersion1和原命令出口不变。
- 新frame-pointer-presentation.js由框架私下消费，原生eventPhase getter要求仍在同步dispatch，且isTrusted、detail>0。body菜单portal仅经框架自身run回调进入同一上下文。
  键盘、脚本click、异步程序和payload来源标识不能冒充可信指针。layout、顶部开关、模块rail、页面rail、voice和body菜单实际路径均验证。
- 新frame-region-presentation.js沿同一service.forComponent和严格贡献捕获，以既有frame.builtin为owner绑定四内容节点。新frame-toggle-presentation.js每个持久button作为scope根，只绑定一个装饰子目标；页面数量不会耗尽region组件32目标预算。
  默认正式预览是10 layout＋4 frame plane＋10 frame control＝24目标、13个服务scope；数量按实际页面目录计算。没有新增平台插件身份、注册器、命令或业务状态。
- 公共animation-service.js仅新增host-only setProfile(name|null)，只选择已捕获作者变体；正在运行的任务保留捕获参数，全局减少/none优先。插件ctx.motion仍只有bind，局部port不开放profile或timing。
  region作者enter/exit统一轴与fade为180/120ms、位移至多12px；按钮复用160/120、180/120、100/80ms三作者变体。provider跳过相等x/y的无意义transform轨道，按钮实际只有opacity轨道。
- 真正退出保留同一DOM，业务grid即时接受，关闭立即inert/aria-hidden、grip disabled及原焦点恢复。保留层固定在已接受stage之外，只静态裁出最多12px边缘；无有效安全几何即时hidden。
  不复制/重挂插件内容，不让全栏退出覆盖工作台，不动画化grid track、宽高、缩放或文本。每侧token/hold采样使反向接续；旧完成、失败和更新不能复活状态。
- arrangement/currentPage/四区域尺寸变化，程序、窗口resize、root隐藏/恢复均立即清历史框架轨道。框架reduced/none即时，quiet只保留局部按钮100/80ms反馈，区域内容即时；layout自身服从公共减少内容100ms opacity策略。
  无provider、同步完成和当前故障静态到已接受状态。当前诊断沿既有结构化notices，其本身没有DOM；迟到诊断被门禁阻止。
- 新frame-toggle-motion.css仅使用框架节点标记及专用装饰命名空间，没有CSS transition/animation。structure-preview.css只增加import，原外壳规则/顺序/声明与黄金基线一致。
  没有修改父视觉拥有的preview、visual、selection、toggle私有文件、作者recipe、workspace-layout.css或原审阅页；无动画service的历史DOM路径保留。

## 当前验收

[最终检查](../evidence/layout-visible-formal-animation-20261007/final-verification.json)与[当前浏览器批次v7](../evidence/layout-visible-formal-animation-20261007/toggle-v7/formal-visible-browser.json)为本轮最终依据，已消费UX采样结束后稳定的最新作者源。

| 检查 | 结果 |
| --- | --- |
| 备份UI完整npm test | 568/568，含声明、权限/拒绝、空值、生命周期和原外壳黄金比较 |
| 正式workbench挂载 | 8/8 |
| workbench TypeScript、shape正负类型fixture | 通过 |
| animation-contract、Motion、startup、desktop生成check | 全部通过 |
| 实际ESM、classic file、桌面静态入口浏览器 | 334/334，无意外浏览器错误 |
| 谱面逐帧矩形 | 4108采样帧，x/y/width/height最大漂移0 |
| 排布期间设置承载/标题/外框/控件 | 1169采样帧，所有四分量最大漂移0 |
| 原生轨道与最终释放 | 服务active/targets/components及浏览器轨道归零 |

浏览器为Chrome，视口/DPR为1440×900@1、1280×720@1.5、800×600@2。正式提供者记录实际原生轨道，慢放只使用宿主既有2.5倍策略；同时验证生成入口正常速250/180/120/160/280ms，没有注入review executor。

覆盖真实选择窗口和同clip亮图标、单层开关蓝面/亮图标、无位移按钮轨道、真实四侧方向/时长、安全边界/inert/无文档溢出、原实例、快速反向/迟到、键盘/程序/异步、none/reduced/quiet/系统减少、窗口/root隐藏恢复、当前故障/替换/无provider，以及双完整runtime相同目标名的独占和释放隔离。经典file和生成桌面入口另验证干净重启不响应旧 detached switch；框架图标与命中区域中心偏差≤0.1 CSS px。

框架right区域自身被用户开合时，获准内容平面会translate≤12px；这与排布期间设置页面稳定的断言分开。每次业务再次接受，重新记录该次几何基线，不能把第二次合法状态变化算成上一动作漂移。

生成与浏览器加载全程串行。最终经典包769540 bytes，既有desktop bridge157711 bytes，桌面资产闭包18文件；新增样式由现有CSS import依赖闭包纳入，没有手改vendor。

## 重放、历史与限制

工作目录为design/frame-visual。先运行npm run desktop:build，完成后单独运行tools/layout-visible-formal-browser.cjs；使用FRAME_VISIBLE_EVIDENCE_DIR指定新批次目录，省略时创建带时间戳的新replay目录。浏览器结束后，设置FRAME_VISIBLE_BROWSER_REPORT为相对本增量证据根的JSON路径，再运行tools/layout-visible-formal-verify.cjs。默认最终检查消费toggle-v7。

工程基线保存于before/和toggle-before/。初始选择＋框架152项证据保留在增量根目录；toggle-final首轮有错误的浮点/跨动作矩形/DOM通知断言，toggle-v2的311项通过；toggle-v3有双runtime夹具遮挡和错误mask字段，toggle-v4的324项通过。verification-first保留第一次完整检查的两项样式合同失败。修正为独立样式与节点门禁后，toggle-v5全部通过。作者同步后的toggle-v6有一项选择轨道刚创建但尚未移动的过早采样；明确等待实际中间帧后toggle-v7为334/334。失败阶段不作为当前验收。

原layout-preview-formal-shape-result-20261007.md和shape证据保持封存；其五目标重放工具属于shape阶段基线，不拿来覆盖当前十目标结果。最终JSON记录工程源/生成件及所消费作者源的哈希，保留并发变化。

本报告是正式工程和Chrome/静态资产验收，父视觉美术联合验收及原生桌面WebView验收继续独立。没有构建或修改Rust/内核/废弃产品UI，没有stage、commit、跨会话消息或自动归档；任务继续in_progress以保留现有会话与联合验收边界。

作者在v5结束后补充了排布title/data-tooltip、区域下一步动作提示、组件header自有28px命中高度/actions间距及原谱面缩放组四列行布局。等待其UX采样结束期间没有写生成件；收到稳定/结束通知后沿原链重建经典/桌面，再真实浏览器和完整一致性检查。新增作者提示和28px命中区在三个ESM窗口、经典file、桌面静态入口均通过。pre-author-update保留v5对应的最终检查；最终JSON单列整体UX Block及两项concerns，未将技术通过数转换为整体体验通过。
