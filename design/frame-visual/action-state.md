# 共用动作状态：第一步实现与验收

日期：2026-10-03。继续后续工作，只修改 design/frame-visual 备份副本，沿用不建 Trellis 任务的选择。计划见 action-state-plan.md；本步完成动作状态读取与现有布局页按钮接入，第 5 批的菜单/弹窗仍未完成。正式 frontend spec 层为 reserved，原型合同同步到副本作者文档与路线图。

## 实际影响

布局页按钮同时读取原命令可用性和具体控件限制，不再只按 adjusting 决定能否配置。权限不足、已登记命令被移除、编辑 flag 与会话失配时，相关按钮禁用并显示原因；命令重新可用后恢复。状态接口不改变原会话政策：四栏开关、尺寸、尺寸恢复、几何排布继续随时可用，栏内组件配置需要编辑。

例如界面显示“编辑中”，但组件编排所有者被替换，原侧栏命令的 canConfigure 返回 false。原先布局页可能仍显示可点击，本步读取同一 enabled 后直接禁用组件配置。即使显示状态尚未通知，点击前再次读取也会阻止旧入口执行，并反馈“该操作当前不可用”，不会误提示用户先进入编辑。有效操作依旧一次 ctx.execute、一次原 router 执行。

有实际绑定的动作显示最新快捷键提示和 aria-keyshortcuts；改键、取消和恢复即时更新。默认运行入口仍没有新增默认键位。控件保留同一节点、选择和尺寸输入草稿，更新不替换组件实例。无动作端口的旧独立装配保留旧行为。CSS、外层 Shell 与默认布局结构不由本步修改；细微呈现变化仅是实际 disabled、提示与键位属性，像素与原生行为尚未验收。

## 结构与数据流

```text
实际组件登记 → 命令读取名单与组件快捷键上下文
原 router.describe / shortcuts.keysFor + 状态所有者通知
  → host/action-state-read-port（snapshot/subscribe，只读）
  → 布局页 → shell/action-presentation / 原组件配置视图
  → 原控件 disabled、提示与 ARIA

点击 → 重新读取动作与内容可用性 → ctx.execute
  → 原唯一 UI router → 原命令 handler
  → 原编辑会话/工作区与编排状态所有者 → 通知与呈现
```

新增 host/action-state-read-port.js 与 shell/action-presentation.js 两个内部模块，由原组合根装配，不登记新平台插件，不创建新 router、缓存、命令目录或状态副本。组件上下文仍为 execute/notify/onDispose，作者协议与 v1 适配保持。读取端口没有 handler、权限授予或执行能力，真正权限仍由原组件宿主检查。

接口输入 commands 名单复制去重、context 复制冻结；默认入口从实际 registry 中取得 permissions.commands、id/owner，过滤当前组件、owner 与 score 作用域。快照及数组/记录冻结，形状为 `{ actions: [{ id, exists, enabled, checked, keys, reason }] }`。未获读取名单中的动作呈现 permission.denied；名单中未登记的命令返回 command.missing；enabled=false 返回 command.disabled。

enabled 要同步返回 boolean；checked 要同步返回 boolean 或 null。异常、非法类型及 thenable 返回 command.state-error，只禁用相应动作，其他动作仍读取；异步拒绝排空，函数调用保留 this。本步在读取接口隔离错误，没有重写原 router.execute 合同。状态回调应同步、无副作用。

checked 数据供单一切换动作消费者使用。同一命令带不同 payload 的四栏开关、加入/位置和排布控件继续读取对应工作区/编排快照：一个无 payload 的 checked 不替代各个目标状态。位置能力、顺序边界和尺寸恢复值属于具体控件限制，与命令 enabled 合并。

订阅监听原 router 和工作区/编排只读源。任意闭包变化不会自动发布，状态所有者须通知或显式 router.refresh。无缓存，主动 snapshot 始终重读。订阅注册失败回滚此前资源，观察者与诊断错误隔离，逆序清理且重复释放安全；页面登记 onDispose，真实宿主在挂载失败与正常释放时清理全部监听。

## 验证与证据

22 项专项测试通过：数据冻结与权限名单、实际作用域过滤、enabled/checked 与失效隔离、命令登记/释放、键位改动/取消/恢复、通知与清理、失败订阅回滚、真实组件权限、会话失配、陈旧显示下操作前重读、单次受限执行、节点/输入/选择保持以及默认运行入口/pagehide。DOM 测试装配实际平台、router、组件宿主、会话与默认入口；没有以替身命令成功代替实际受限链。

全副本回归为 204 项通过、0 失败。9 个涉及 JS/CJS 文件语法检查与新源码审计结果见 evidence/action-state/verification.json、source-audit.json；专项/全量输出为 specialized-test-output.txt、full-test-output.txt。fresh 基线、原稿和审阅差异为 before-source-hashes.json、before-source/、review.diff。历史 182 项与旧批次审计保留原含义，不重新运行覆盖历史证据。副本未配置 lint/typecheck，不宣称通过这些工具。

本步声明修改 7 个已有文件，新增 6 个文件，证据另存。源码审计检查原 design/frame、废弃 apps/workbench、CSS、外层 Shell、原 router/快捷键/平台/ctx/作者协议、命令 handlers、编辑会话及编排状态；范围外同期变更单独列出，不回滚同期工作。

核对时发现 src/fixtures/controls-review.js 的同期样稿更新及新增 tools/framework-controls-contract.cjs。两项均非本步声明修改，保留原样，并在 concurrent-work.json 和 concurrent-source/ 保存确切哈希与源码；初次保护检查因此未通过的记录保存为 source-audit-initial.json。检查脚本随后仍在更新，最新哈希另列。新审计保留最初基线，分别报告已保存快照是否正确、当前源码是否相同；已登记样稿必须匹配确切快照，其他未知保护范围变更仍导致失败。范围外检查脚本可以继续更新，审计如实列出，不用更换基线掩盖变化。

DOM 替身不能证明像素、真实计算样式、原生焦点、指针与 IME。既有 file:// 访问拒绝仍有效，没有通过更换协议或浏览器绕过；真实浏览器验收仍待可用且获准的环境。

## 紧接着的工作

先接一个已有菜单动作：引用原命令与同一状态，打开期间同步可用性/checked/键位，关闭与卸载释放订阅。再接受限对话框的打开、关闭与焦点返回，并在真实浏览器验收键盘与焦点。菜单本轮尚未激活，没有把未接入业务的占位项显示成可用操作。

其后再推进真实谱面编辑闭环、预制侧栏样式、用户配置保存和正式包。上/下侧栏内容管理、拖拽、运行中安装/卸载与多实例也仍未实施，不纳入这一步状态基础。
