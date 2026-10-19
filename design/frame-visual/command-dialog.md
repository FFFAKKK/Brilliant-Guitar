# 受限命令确认对话框：实现与验收

日期：2026-10-03。第 5 批第三个小步，只修改 design/frame-visual 备份框架。用户授权继续，沿用不建 Trellis 任务；计划为 command-dialog-plan.md，fresh 基线、原稿、测试与审阅证据为 evidence/command-dialog/。正式 frontend spec 仍为 reserved，当前合同归档到作者文档与本记录。

## 对 UI 包与布局的影响

默认 runtime-preview 组合根已经装配可选确认对话框宿主，实际组件 ctx 可调用 confirm。默认产品没有新增按钮、菜单项或测试插件，也没有给侧栏开关、尺寸、排布等普通操作加确认步骤。现有菜单、侧栏、谱面与布局页保持原默认结构；新 CSS 只补对话框反馈颜色，复用现有 v-modal 皮肤。

旧 createComponentHost 未提供 dialogs 时，ctx 仍只有 execute/notify/onDispose；提供 dialogs 时增加可选 confirm。manifest、UI facet contractVersion、组件权限声明、命令 router 和平台登记不变。对话框是 UI 包内部宿主能力，不新增平台插件，也不向组件暴露任意 DOM、router 或布局写权限。

当前能力是“确认一个已有命令”，尚不是任意表单或通用浮层 API。只有业务确实需要确认时才使用；本步默认入口接线已测，不表示已有业务界面新增了弹窗入口。

## 请求与执行

```js
const opening = ctx.confirm?.({
  title: "清空笔记？",
  message: "确认后清空当前笔记。",
  confirmLabel: "清空",
  command: "example.notes.clear",
  payload: { noteId: "current" },
});
if (opening?.ok) {
  const outcome = await opening.finished;
  // outcome.status === "confirmed" 表示返回了成功执行结果。
}
```

示例命令必须事先登记，并存在于该组件 permissions.commands。本批默认产品没有新增这条示例命令。

```text
组件 ctx.confirm（文本 + 命令 id + 数据参数）
  → 绑定实际组件实例的受限对话框端口
  → 原 permissions.commands / action-state-read-port
  → 宿主原生 dialog（打开不执行命令）
用户确认 → 再读实例可用性与命令状态
  → 原 ctx.execute → 原唯一 router → 原 command.run
```

只接受 title/message/command/payload/confirmLabel/cancelLabel。前三项须为非空文本；按钮文本默认“确认/取消”。payload 可省略，存在时须是普通对象，递归只含文本、有限数字、布尔、null、数组和普通对象。请求复制并冻结；函数、DOM、循环、无限数、未知字段和无权限命令拒绝。文本作为文本节点，不解释 HTML。

打开返回 { ok: true, finished } 只表示窗口打开；不代表命令成功。拒绝返回 { ok: false, code }，没有 finished。finished 只在会话结束时完成，数据为 { status, dispatched, result? }：confirmed 带成功结果；cancelled 表示关闭而未处于等待执行阶段；dismissed 表示执行等待中主动关闭；owner-hidden/owner-disposed/host-disposed/external-close 表示对应关闭来源。dispatched 表示已向受限执行入口提交过确认请求，不保证 handler 已执行或成功，也不表示事务可以回滚。

命令 disabled/missing/state-error 在打开前拒绝，打开期间的所有者通知或 router.refresh 原地更新确认按钮。点击前再次读取；失败保留窗口与反馈，允许重试。闭包状态仍由命令状态所有者发布通知，不增加状态缓存。对话框阻挡全局快捷键，因此确认按钮不宣传无法在模态期间执行的全局键位。

同一宿主只允许一个确认会话，重复或其他组件申请返回 dialog.busy，不替换现有窗口。一次执行期间禁用确认，避免重复认领；取消按钮改为“关闭”，提示关闭不会撤回操作。窗口关闭、所有者释放或新会话打开后，旧异步返回只被观察，不再更新 UI、发旧反馈或关闭新窗口。关闭对话框不等于取消领域命令。

## 原生焦点与生命周期边界

使用真实 dialog.showModal/close，不实现另一套 Tab 环绕。原生模态负责背景不可交互与焦点范围；缺少原生能力返回 dialog.unsupported，不降级成具有 aria-modal 却实际可操作背景的浮层。打开失败、订阅失败回滚已经申请的资源。成功打开前关闭现有菜单，沿用原瞬态浮层所有权。

初始焦点在取消按钮。普通 Escape 只关闭对话框，不取消底层布局编辑；输入法、AltGraph 和修饰 Escape 保留，阻止原生取消默认动作。Tab 交给原生 dialog；没有实现自定义表单输入或主按钮的额外 Enter 路由。原生 cancel/close 事件都有清理；外部点击不被当作确认或取消。

关闭返回实际触发焦点。触发节点失效时尝试同一仍可用组件中的控件，再由组合根返回工作区舞台。隐藏、断开或不可用的节点不能作为有效回退。组件跨区域移动保持实际实例与端口；组件隐藏关闭其窗口但不释放输入，重新显示可再次申请；释放定义、mount 失败或宿主释放结束对应会话。绑定身份是实际记录，不按可伪造的组件 id 猜测所有者。同 id 新实例不接受旧上下文请求。

默认入口在 pagehide 先释放对话框，再清理 Shell 和组件，避免卸载时恢复焦点。对话框只在打开期间订阅原动作端口，重复开关不积累监听。组件快捷键仍使用原权限检查，不因可选 confirm 获取映射管理或执行任意命令的能力。

## 验证与限制

25 项专项测试通过，覆盖真实组件宿主/registry/router/工作区状态/默认运行入口、可选兼容、文本数据/权限、参数复制、打开不执行、成功一次执行、取消/编辑保留、状态通知与陈旧显示、命令释放/恢复、失败重试、IME/Escape/原生 cancel、全局键盘保护、忙状态、隐藏/卸载/同 id 恢复/mount 失败、原生缺失/失败、订阅回滚、异步关闭/拒绝/晚完成、焦点回退与 pagehide。

本批开始时原有 233 项加新增 25 项，共 258 项基线回归通过，文件清单为 baseline-regression-files.json。同期横向槽位设计新增 9 项测试参与全目录回归；初次全目录回归为 267 项、265 通过、2 失败，失败为横向槽位容量用例。该结果保留为 full-test-output-initial.txt；同期工作继续后，最终全目录 267 项全部通过、0 失败，输出为 full-test-output.txt。本批未修改同期布局源码或测试。6 个 JS/CJS 语法检查及源码范围审计通过，见 syntax-checks.json、source-audit.json 与 verification.json。

DOM 替身显式给 dialog 添加 showModal/close 测试方法，只验证实际模块如何调用与处理事件。它不计算真实布局，不模拟浏览器 top layer、背景 inert、原生 Tab 圈定或系统 IME。因此真实浏览器焦点与视觉仍未验收；既有 file:// 拒绝不通过更换协议或浏览器绕过。副本没有 lint/typecheck 配置，不宣称运行这些工具。

本批审阅差异为 review.diff；5 个既有文件和 7 个新增文件单列。同期横向槽位样稿、样式、文档及测试保存独立快照，基线与历史证据不重写。原 design/frame、废弃 apps/workbench、已有 CSS/几何/工作区/命令 router/平台安装协议均不由本批修改。

后续优先补获准环境的原生模态/菜单验收，再按真实业务需要消费这份确认能力。自定义表单、非模态浮层、可信平台批准界面、其他业务菜单、快捷键设置和内核编辑不属于本小步。第 5 批的原生验收仍未完成。
