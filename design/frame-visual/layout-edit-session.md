# 布局编辑会话：实际合同与影响

日期：2026-10-02。仅在 design/frame-visual 备份副本实施。用户已批准继续第 3 批，沿用不建 Trellis 任务的选择。计划见 layout-edit-session-plan.md，证据见 evidence/layout-edit-session/。正式前端 spec 层仍为 reserved，本批把原型合同留在副本说明中，不扩大到正式包或废弃产品 UI。

本文件已按用户随后明确的边界更新：四栏的开关与尺寸随时可用，编辑模式只管栏内组件配置。修正记录与新证据见 layout-boundaries-correction.md、evidence/layout-boundaries-correction/；旧 evidence/layout-edit-session 保持历史含义。

2026-10-03：真实组件管理已接入默认布局页，新增固定配置入口保护与只读最终差异。最新合同和证据见 sidebar-content-management.md、evidence/sidebar-content-management/。

## 1. 范围与触发

栏内组件的移动/启用/排序共用编辑政策与确认/取消边界。四栏开关、尺寸、尺寸恢复与几何排布属于日常工作区使用，任何模式都可用。导航、输入与缩放仍可用。

UI 包内部依赖如下：

    布局页 / 调整手柄 / 权限受限 ctx.execute / 快捷键
      → 原唯一 UI 命令 router
      → workspace-commands / sidebar-commands 处理函数
      → 组件配置：layout-edit-session → sidebar-composition-state + workspace 编辑模式
      → 日常开关/尺寸/排布：workspace-state，不进入组件回滚基线
      → 各自只读端口 → 原 Shell / 呈现适配 / 持久组件宿主

会话负责配置协调，状态仍由原模块拥有。没有新增平台插件、第二个命令 router、领域命令转发器或第三份配置 store。workspace.adjusting 是唯一编辑模式；baseline 保存回滚配置，busy 防止同步观察者重入写操作，disposed 管理清理，后三者不是新的 UI 模式。

## 2. 签名与装配

内部 API：

    createLayoutEditSession({ workspace, composition, reservedPanelIds = [] })
      → canConfigure(), changes(), begin(), finish(confirm), resize(side, value), arrange(mode),
        configureRegion(region, open), move(id, slot, index), setEnabled(id, enabled),
        reorder(id, index), dispose()

composition 可以是固定状态所有者或启动时的延迟 getter；默认入口在平台启动后解析固定所有者。进入会话后若所有者更换，拒绝继续或覆盖基线。暂不支持热插拔。

reservedPanelIds 由宿主声明固定配置入口；默认运行入口传入 [LAYOUT_PAGE_ID]，独立会话缺省为空数组。直接针对这些 id 的移动/启用/排序经 configurePanel 拒绝并返回 layout.reserved-panel，仍先检查编辑模式与会话同步。changes() 是内部只读投影，在活动会话返回冻结的 { id, before, after } 记录数组，来自原 baseline 和当前编排；无活动会话或所有者失配时为空。配置页仅通过内容管理只读端口取得格式化差异，不持有会话或另建组件回滚基线。

    bindWorkspaceCommands({ router, store, stage, sidebar, editSession })
    bindSidebarCommands({ router, editSession })
    workspace.batch(syncCallback)
    composition.batch(syncCallback)
    workspace.setRegionOpen(region, open)
    composition.restore({ panels })

默认 runtime-preview 创建一个会话，两个绑定共享它。几何独立宿主可省略 editSession，由工作区绑定创建并清理几何会话；侧栏绑定必须显式共享会话，不再接受裸 composition 写方法。

组件的 ctx 仍为 execute/notify/onDispose；只读端口仍为 snapshot/subscribe。状态所有者的 batch、restore 和会话本身不发给内容组件。作者 manifest、v1 转换和固定平台会话协议不升级。

## 3. 请求、响应与确认／取消

| 命令 | payload | 可用时机 |
| --- | --- | --- |
| frame.workspace.adjust.begin | {} | 普通模式进入；已进入则幂等 |
| frame.workspace.adjust.finish | { confirm: boolean } | 有同步的活动会话 |
| frame.workspace.region.resize | { side, value: finite number } | 所有模式 |
| frame.workspace.arrange | { mode: balanced / compact / default } | 所有模式，几何排布 |
| frame.workspace.region.configure | { region, open: boolean } | 所有模式，显式设置兼容，拒绝额外字段 |
| frame.sidebar.panel.move | { id, slot, index? } | 编辑会话，固定身份、允许位置与有效顺序 |
| frame.sidebar.panel.enabled | { id, enabled: boolean } | 编辑会话 |
| frame.sidebar.panel.reorder | { id, index: integer } | 编辑会话 |
| frame.workspace.region.toggle | { region } | 普通收放，所有模式 |
| frame.workspace.page.select / page.step / view.zoom | 原 payload | 普通操作，所有模式 |

region/side 为 left/right/top/voice；用户名称统一为左／右／上／下侧栏，voice 仅为内部兼容标识。侧栏 slot 为作者允许的 left/right。命令结果保留 { ok, changed? } 或 { ok:false, code }；不新增环境变量、存储格式或内核请求。

进入编辑仍打开右侧并导航到现有布局页。组件操作继续即时预览，不要求确认后才渲染。重复 begin 不覆盖组件基线；确认保留当前组件配置，下一次进入以新的确认配置为基线。

取消恢复完整侧栏组件的身份/位置/启用/顺序并结束编辑模式。四栏显隐、尺寸、arrangement、当前页、输入、业务选择、阅读位置和窗口 viewport 全部保留当前结果。尺寸始终沿用原几何常量与视口约束函数。组件差异列表不统计日常开关、尺寸或几何排布。

上侧栏按真实 topOpen 收放，组件编辑不强制显示它。布局页内提供同一会话的确认/取消入口，上侧栏关闭时仍可结束编辑。原上侧栏确认/取消入口保留，调用相同命令。

两所有者使用同步嵌套 batch，在任何通知前完成全部状态修改。返回失败或抛异常，恢复各自原状态引用和快照，不发布部分结果。成功每个所有者最多发一次最终通知。默认入口仍有两份订阅，因此最多各渲染一次一致最终状态，不承诺只有一次 render。

canConfigure 在通知期间可读到最终模式和会话基线；实际同步重入写操作仍返回 layout.busy。命令消费者通过状态订阅读取当前可用性，当前没有新增菜单实时状态广播模块。观察者异常隔离，不把已完成的配置提交回滚，也不阻塞其他观察者。

batch 仅用于内部同步配置回调。thenable 返回被拒绝并恢复本次同步修改；这不是异步事务，异步后续逻辑不得借此写状态。dispose 有活动会话时先取消；取消失败则保留会话并允许重试，不谎称清理完成。默认 pagehide 保留 bfcache 的 persisted 行为，最终释放时取消会话。

## 4. 验证与错误矩阵

| 条件 | 结果／保留状态 |
| --- | --- |
| 模式外 router.execute 组件配置命令 | command.disabled，无修改 |
| 模式外直接组件 handler／会话方法 | layout.edit-required，无修改 |
| ctx 无命令权限 | permission.denied；不会到达布局写入口 |
| 编辑中直接修改宿主保留的配置入口 | layout.reserved-panel，无修改 |
| 同步观察者内再次配置 | layout.busy，防止重复协调 |
| raw workspace 自行进入但会话无基线，或所有者更换 | layout.edit-desynchronized |
| 几何独立会话尝试侧栏操作 | layout.no-composition |
| 已清理会话调用 | layout.disposed |
| finish 缺少活动调整 | workspace.no-adjustment |
| region/open/尺寸/排布等非法 | workspace.invalid-payload |
| 侧栏 payload、身份、能力或顺序非法 | sidebar.invalid-payload / unknown-panel / invalid-slot / invalid-order |
| restore 非完整身份集合、组件映射变化、额外字段、越界 slot、重复或非连续 order | sidebar.invalid-snapshot；快照引用不变 |
| 同步 batch 返回 {ok:false} | 原引用恢复，不通知；原失败结果透传 |
| 同步 batch 抛异常 | 原引用恢复，不通知；异常透传 |
| 同步 batch 返回 thenable | TypeError；恢复同步修改，不通知 |
| 渲染／观察者抛异常 | 其余观察者继续；已完成状态不回滚 |

restore 只还原本次固定集合中已有的 id/componentId，不能用于安装新内容、扩大 slots 或导入任意保存文件。侧内 order 必须从 0 连续且唯一；只在完整验证后发布。

## 5. 正常、默认与失败例子

正常：随时开关四栏或调整尺寸。进入编辑，把允许双侧的 sample.a 移到左侧并移出 sample.b；预览立即变化。确认后保留组件配置。再次进入并修改组件后取消，会回到这份新确认的组件配置；期间改变的栏开关和尺寸保留。

默认：未编辑时可收放四栏、拖动尺寸、输入尺寸、单项恢复、几何排布、浏览页签和缩放。初始四个内置内容仍只允许 right，左侧仍为空；真实组件内容管理、样式选择和业务内容尚未接入。

失败：取消时组件恢复成功，但结束编辑模式返回失败或抛异常。组件与模式退回取消前的预览，基线保留；修正问题后可以重试。用户输入、业务数据和日常工作区使用没有进入回滚。

## 6. 历史验证与最新修正

下列为初始会话批次的历史记录，旧证据不覆盖。最新的组件边界修正已经更新旧断言，并补充实际四栏开关与键盘/指针尺寸流程；当前结果见 layout-boundaries-correction.md 与其 evidence 目录。

- 本批新增 20 项测试；连同同期视觉布局新增的 5 项，当时全副本 162 项测试通过，0 失败。命令及完整输出见 evidence/layout-edit-session/test-output.txt。157 项为同期视觉文件写入前的中间结果；最新边界修正后为 165 项通过，见 evidence/layout-boundaries-correction/test-output.txt。
- 覆盖模式政策与直接处理函数、原权限与实际键盘分派、重复进入、统一确认/取消、确认后的新基线、失败/异常注入后恢复与重试、无部分通知、观察者错误/重入、非法完整快照、同步事务拒绝 thenable、当前窗口约束和几何独立兼容入口。
- 集成使用实际平台、目录、编排、呈现、组件宿主和 Shell，确认同一节点与输入、业务选择、阅读位置保留，布局操作不执行测试文档命令。
- 实际 runtime-preview 模块在 DOM 替身中装配并通过布局页控件测试顶部确认/取消和 pagehide 清理。它证明模块装配与处理流程，不计算浏览器布局、像素或原生焦点。
- 本批 15 个 JS/CJS 与 6 个额外同期 JS 的语法检查记录在 verification.json；该副本没有 lint/typecheck 配置，不宣称通过这些工具。
- fresh baseline 为 115 个副本源码文件，声明 13 个修改和 6 个新增。新审计 tools/audit-layout-edit-session.cjs 检查原 frame、workbench、CSS、几何常量、fixtures、权限上下文与平台协议；并发修改单列，不回滚、不覆盖旧批次证据。

同期布局工作新增 layout-review.html、layout-visual-state.js、workspace-layout-visual.js、共享 workspace-layout.css 和 5 项视觉组件测试，并修改三个 fixture、两份原 CSS 与两个 HTML 样式入口；workspace-layout-page.js 是重叠文件，已迁移到新视觉组件且保留本批的 configureRegion 绑定。审计记录 12 个范围外变化和 1 个重叠适配，保存 reviewed concurrent-source 快照。不能把这些同期视觉改动归于本批，也不能宣称整个副本的 CSS/fixture 都未变化；本批本身未编辑它们。原 frame 和废弃 workbench 的所有文件哈希保持不变。

浏览器已有的 file:// 访问拒绝保持有效；没有更换协议或浏览器绕过。真实计算样式、像素、焦点和输入法验收尚未完成。

## 7. 容易写错的地方与后续

错误：把栏开关与尺寸也锁进组件编辑，或只禁用组件按钮而让 handler 直接 composition.move。

正确：开关与尺寸随时可用且不随组件取消回滚；组件配置使用原同一 router 和共享会话，检查模式与所有者。底层数学和编排方法继续通用，可在内部独立测试。

错误：begin 写 topOpen=true，confirm 无条件恢复旧 topOpen。用户编辑的顶部显隐会丢失。

正确：上侧栏按 topOpen 收放，布局页内确认/取消调用同一会话；编辑不强制上侧栏可见。

下一批为真实内容管理：从实际贡献目录读取可用内容，连接添加/移出、允许区域移动、排序、空态和不可用原因，所有配置动作复用本批会话。现有内置内容的 right 限制不自动扩大。预制侧栏样式、配置保存、正式包与真实谱面编辑仍按 roadmap 后续批次实施。
