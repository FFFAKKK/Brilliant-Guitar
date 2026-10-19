# 受限命令确认对话框：第 5 批第三步

日期：2026-10-03。用户授权继续；沿用不建 Trellis 任务与主会话直接实施/检查。限定 design/frame-visual 备份副本，fresh 基线及原稿保存在 evidence/command-dialog/。

本小步提供可选 ctx.confirm({ title, message, command, payload?, confirmLabel?, cancelLabel? })。只有装配了对话框宿主的组件可申请；命令来自原 permissions.commands，打开及确认前读取原动作状态，真正执行复用 ctx.execute 与原唯一 router。请求只含文本和数据，不接受回调、DOM 或任意渲染。打开不执行命令；返回 finished Promise 表示确认成功、取消或所有者释放，执行失败保留对话框及反馈。默认组合根装配能力，不增加产品按钮或给已有低风险操作强加确认步骤。

宿主单一实例只允许一个确认会话，同时申请返回 dialog.busy，不堆叠/排队。使用原生 dialog.showModal 提供背景不可交互与原生焦点范围；缺少该能力返回 dialog.unsupported，不通过伪模态回退宣称实现。复用主题、控件、清理范围、动作读取与原 popover 关闭接口；弹出前关闭当前菜单，Escape 只关闭对话框，不取消底层组件编辑。Tab 行为交给原生 dialog，输入法/修饰键保护保留。

关闭返回原实际触发焦点；原焦点不可用时尝试所有者仍可用的组件内容，再由组合根指定工作区回退。组件隐藏、移除、mount 失败、宿主或 pagehide 释放关闭其对话框。旧会话的按钮、close 事件或异步完成不能影响新会话；重复确认最多执行一次，失效上下文不能执行。

检查：真实 router/registry/component-host/action-state 与默认运行入口，原生命令确认成功/拒绝/取消、数据与权限、状态变动/陈旧显示、IME/Escape、异步防重/释放/晚完成、所有者隐藏/恢复/同 id 新实例、订阅/失败回滚和无原生支持。DOM 替身只对 showModal/close 建显式测试桩，不冒充真实浏览器焦点圈定、背景 inert 或视觉验收。

声明修改 5 个既有文件，新增 host/command-dialogs.js、shell/command-dialog.js、styles/command-dialog.css、专项测试、审计脚本及两份批次文档；保护其余 CSS/几何/工作区/路由器/平台/作者 manifest。同期变化如实登记且保留，旧证据不重跑覆盖。新证据记录专项/副本回归、语法、源码审计和 review.diff。此次不接自定义表单、非模态弹窗、文件保存、业务批准、可信平台批准外壳或内核编辑。
