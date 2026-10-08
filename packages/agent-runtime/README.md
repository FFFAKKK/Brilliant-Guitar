# Agent Runtime

可以单独安装的通用 Agent 运行包。复用 Pi 1.0.3 生成决策，`AgentRunController` 统一管理工具校验、执行、审批、状态和完成校验。运行包不依赖 Workbench、Tauri、React 或乐谱实现。

```ts
import { createAgentSession } from "@brilliant-guitar/agent-runtime";

const session = createAgentSession({ provider }); // 注入决策 Provider，不是模型密钥
await session.setEnabled(true);
const result = await session.submit("你好");
console.log(result.response);
await session.dispose();
```

`provider` 实现统一的 `AgentDecisionProviderPort`。可用 `createAgentPluginProvider()` 将默认 Pi 插件或外部决策插件接入同一 Controller。模型传输、凭据管理及业务工具由宿主提供。

`AgentToolRegistry` 接受显式注册的工具。默认无工具；通用聊天 Session 只允许无文档的 query/analysis 工具。涉及乐谱修改、审批和恢复的宿主通过 Controller 的相应端口装配，不能绕过统一执行链。

`registry.withTools(tools)`返回新注册表，保留原表。宿主可向Session注入`contextItems(sessionId)`提供资源目录、`allowedToolIds()`筛选本轮允许工具，以及`onProgress(event)`观察真实活动。这些目录/策略回调在接受Run之前采样，失败不留下活动Run；观察回调异常不影响执行，取消/重置代次隔离旧事件。运行包不负责读取宿主文件。

Controller提供可选run-local `toolFeedback`：每组包含turnId、原始callId、invocationId、真实参数、结果和来源。交给Provider的是独立冻结快照。默认Pi插件恢复完整调用/结果消息，再使用Pi `continue()`决策；结果正文不重复作为普通context发送，最终预算保留完整组。旧恢复记录没有callId关联时继续原有context投影，不修改持久Run或External v1。

Session 提供 `getSnapshot/subscribe/submit/cancel/reset/setEnabled/dispose`。默认保存最近16轮成功对话供模型使用；下一轮按字符估算的上下文预算整轮省略，失败、取消与中断不进入成功历史。旧消费者默认显示最近16轮，内存RunStore保留32个终结记录。

独立宿主显式设置`contextSelectionPolicy: "standalone-context-v1"`：Session交付完整有界候选，ContextBuilder保护最近`min(2, historyTurnBudget, 可用成功轮数)`轮及本Run真实执行结果，较早可选历史按新到旧选择、按原顺序投影。required仍须通过作用域、有效期、身份与估算校验；同一能力的不同invocation不合并。未启用策略的消费者保留原选择行为。

`getContextSelection()`返回当前Run只读冻结的`ContextSelectionReportV1|null`；`onContextSelection(report)`仅供观察。Provider获得request-local `contextSelection`计划，Pi最终预算按计划反向省略完整可选单元并重新投影，保护内容仍超限时阻止下一请求。最终流宿主用`createHostPiStreamFn(..., { onSelection: report => session.reportContextSelection(report) })`报告最终估算；停止/新Run/恢复/停用/退出隔离旧报告。报告与计划不添加到存储Run DTO或External v1，无正文、凭据或长期记忆。合同见`docs/agent-m3.2-context-selection-contract-v1.md`。

独立宿主可选择`retainTranscript: true`保留完整显示记录（最多4096条），以`checkpoint(snapshot)`在请求前和终结后保存，并用`restoreTranscript(sessionId, messages)`恢复会话及预算内的成功历史。`hasActiveRun()`覆盖终结后的保存阶段。`SessionStorePort`、`AgentSessionLibrary`及`parseSessionLibrary/parseTranscript`定义聊天存储边界，Node文件实现由宿主注入；运行包不自行访问文件或凭据。恢复记录不会启用Agent或重放执行。聊天SessionStore与Controller RunStore职责不同。

Runtime的`reset()`保持原来的清空语义；独立Host的“新会话”负责先保存旧记录，再创建并选择新记录。软件旧宿主仍复用同一个Controller，不要求采用独立应用的会话文件。

迁移期间保留原 Run/事件/外部协议 v1 的 DTO，包括历史业务输入的兼容形状。业务匹配、乐谱读写及完成验证仍由软件注入，包内没有乐谱执行实现。

开发验证：`npm run build`、`npm test`、`npm run check:boundaries`、`npm run test:standalone`。隔离 smoke 使用打包产物和 Fake 决策，不代表真实模型验收。
