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

Session 提供 `getSnapshot/subscribe/submit/cancel/reset/setEnabled/dispose`。默认保存最近16轮成功对话供模型使用；下一轮按字符估算的上下文预算整轮省略，失败、取消与中断不进入成功历史。旧消费者默认显示最近16轮，内存RunStore保留32个终结记录。

独立宿主可选择`retainTranscript: true`保留完整显示记录（最多4096条），以`checkpoint(snapshot)`在请求前和终结后保存，并用`restoreTranscript(sessionId, messages)`恢复会话及预算内的成功历史。`hasActiveRun()`覆盖终结后的保存阶段。`SessionStorePort`、`AgentSessionLibrary`及`parseSessionLibrary/parseTranscript`定义聊天存储边界，Node文件实现由宿主注入；运行包不自行访问文件或凭据。恢复记录不会启用Agent或重放执行。聊天SessionStore与Controller RunStore职责不同。

Runtime的`reset()`保持原来的清空语义；独立Host的“新会话”负责先保存旧记录，再创建并选择新记录。软件旧宿主仍复用同一个Controller，不要求采用独立应用的会话文件。

迁移期间保留原 Run/事件/外部协议 v1 的 DTO，包括历史业务输入的兼容形状。业务匹配、乐谱读写及完成验证仍由软件注入，包内没有乐谱执行实现。

开发验证：`npm run build`、`npm test`、`npm run check:boundaries`、`npm run test:standalone`。隔离 smoke 使用打包产物和 Fake 决策，不代表真实模型验收。
