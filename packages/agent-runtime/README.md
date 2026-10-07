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

Session 提供 `getSnapshot/subscribe/submit/cancel/reset/setEnabled/dispose`。默认保存最近 16 轮完整成功对话；发送下一轮时按上下文预算整轮省略较早内容，失败和取消不进入成功历史。默认 UI 消息保留 16 轮，内存运行存储保留 32 个终结记录。新会话取消旧任务并隔离迟到输出；本包不承诺进程重启恢复。

迁移期间保留原 Run/事件/外部协议 v1 的 DTO，包括历史业务输入的兼容形状。业务匹配、乐谱读写及完成验证仍由软件注入，包内没有乐谱执行实现。

开发验证：`npm run build`、`npm test`、`npm run check:boundaries`、`npm run test:standalone`。隔离 smoke 使用打包产物和 Fake 决策，不代表真实模型验收。
