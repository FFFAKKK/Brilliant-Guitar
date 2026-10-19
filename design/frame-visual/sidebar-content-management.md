# 真实侧栏组件管理：实现与验收

日期：2026-10-03。用户批准接入真实组件管理，只修改 design/frame-visual 备份副本，沿用不建 Trellis 任务的选择。计划为 sidebar-content-management-plan.md，证据保存 evidence/sidebar-content-management/。正式 frontend spec 层仍为 reserved，原型合同同步到副本作者文档与后续规划。

## 用户操作与效果

刷新 runtime-preview.html，进入工作区布局，在设置页下方的“栏内组件”选择内容。普通模式可以查看，编辑模式可以添加/移出、选择允许的左/右位置以及上移/下移。当前默认列表是谱面属性、AI 助手、音色；工作区布局自身是固定配置入口，不进入普通内容库。三项内置内容仍只允许右侧，左侧位置禁用并显示原因。

添加/移出改变原 enabled 状态，保留实例和私有数据，不安装/卸载插件。跨栏移动只改变 slot，保留 componentId 和已挂载节点。排序使用当前真实编排索引；移出内容保留次序，可以再加入。配置即时预览；确认保留，取消恢复组件配置。四栏尺寸、收放、当前页面和内容输入保持日常操作结果。

例如选择 AI 助手并移出：对应页签隐藏，“本次修改”显示组件移出；取消后页签恢复。已经输入的助手草稿保留在原实例中。对声明支持双侧的插件，左右移动同样保留输入、阅读位置和业务选择；这个插件只存在于测试，不添加到默认产品入口。

## 内部边界

    贡献目录 + 编排只读快照 + 会话最终差异
      → sidebar-content-read-port → 布局页 → sidebar-content-settings
      → ctx.execute → 原唯一 UI router → sidebar-commands
      → 原 layout-edit-session → sidebar-composition-state
      → 原 sidebar-presentation → 持久 component-host

新增两个内部模块：host/sidebar-content-read-port.js 只输出冻结数据；shell/sidebar-content-settings.js 只负责选择与控件呈现。没有新增平台插件、命令路由器、安装机制或配置 store，组件 ctx 仍为 execute/notify/onDispose。布局页可选接 contents 端口；旧独立装配省略该端口时保持旧权限依赖。

会话新增宿主 reservedPanelIds 和只读 changes()。直接修改固定布局入口的移动/启用/排序返回 layout.reserved-panel；其他记录的规范化排序可以改变其数字 order，不影响固定入口的身份和承载。模式/权限/位置/身份校验继续保留。最终修改列表使用会话原基线，计数是改变的组件记录数，排序可以影响多条记录；操作撤回后对应差异消失。延迟打开布局页不会把已有修改误认成新的基线。

管理端口关联当前目录与当前 placement；缺失贡献、身份/位置变化、目录中新出现但不在固定运行集合中的内容给出不可用原因，不制造新 placement。操作时重新读取可用性。订阅仍监听原编排状态，当前不开放热安装/卸载或目录实时广播。失败显示页面反馈并发 ctx.notify；输入、选择控件保持挂载，页面订阅立即登记 onDispose，失败挂载与重复释放均清理。

## 验证与范围

17 项专项测试通过，覆盖真实目录与默认入口、单次命令分派、模式/权限、固定入口保护、排序与最终差异、确认/取消、同一实例和私有数据、旧表面别名、空态与缺失、失败重试、操作前重新读取、延迟挂载、全部普通内容移出后恢复以及订阅/pagehide 清理。测试在真实目录、平台、组件宿主、会话、呈现和 Shell 上装配，DOM 使用测试替身。

最新全副本回归为 182 项通过、0 失败，完整输出为 evidence/sidebar-content-management/test-output.txt。语法与源码范围检查保存在 verification.json、source-audit.json，原稿哈希与本批差异在 before-source-hashes.json、before-source/ 与 review.diff。旧批次证据不覆盖。

9 个修改或新增 JS/CJS 文件语法检查通过，新源码审计通过，fresh 基线下没有本批声明范围外的同期变化。本批声明范围为 8 个已有文件和 6 个新增文件，证据文件另存。副本未配置 lint/typecheck，不宣称通过这些工具。

现有 CSS、外层 Shell、几何常量、作者 slots、v1 协议、router、组件 ctx、原 design/frame 和废弃 apps/workbench 保持。布局页内部新增真实内容配置设置区，运行入口接只读端口和已有权限；不会自动切换侧栏呈现方式。上/下侧栏内容管理、预制样式选择、拖拽、持久化、多实例与真实内核编辑仍未实施。

DOM 替身验证装配与命令状态流程，不证明真实计算样式、像素、原生焦点、指针或 IME。已有 file:// 访问拒绝保持有效，未换协议或浏览器绕过；真实浏览器验收仍待完成。
