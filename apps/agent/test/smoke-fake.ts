import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, textReply } from "./model-fixture.ts";
import { FileConnectionSettingsStore } from "../src/server/connection-store.ts";
import { FileSessionStore } from "../src/server/session-store.ts";

// Explicit test entry only. Production startup never imports a fixture or fills a credential.
const fixture = await createModelFixture((request, count) => {
  const context = JSON.stringify(request.body.messages);
  if (context.includes("[stop]")) return { hang: true };
  if (context.includes("[fail]")) return { error: "fixture-request-failed" };
  if (context.includes("[markdown]")) return textReply("这是 **本地 fixture** 的 Markdown 示例，没有调用 DeepSeek。\n\n### 会话与上下文\n\n- 聊天记录完整保存。\n- 模型使用预算内的历史。\n\n| 层 | 职责 |\n| --- | --- |\n| Session | 完整记录 |\n| Pi | 生成决策 |\n\n```typescript\nconst state = { conversation: 'saved', enabled: false };\nconsole.log(state);\n```\n\n![测试图片](https://example.test/image.png)", { delayMs: 180 });
  return textReply(count === 1 ? "这是本地模型 fixture 的流式回复，用于检查界面和传输链路。它没有调用 DeepSeek。"
    : "这是后续本地测试回复。宿主已把预算内的上一轮完整内容放进新的请求上下文。", { delayMs: 250 });
}, { catalog: (request) => {
  if (request.headers.authorization === "Bearer fixture-unauthorized") return { status: 401, value: { error: "fixture-only-auth-failure" } };
  if (request.headers.authorization === "Bearer fixture-empty") return { value: { data: [] } };
  if (request.headers.authorization === "Bearer fixture-slow") return { hang: true };
  return { value: { data: [{ id: "fixture-model" }, { id: "fixture-secondary" }] } };
} });
const dataIndex = process.argv.indexOf("--data-dir");
if (dataIndex >= 0 && (!process.argv[dataIndex + 1] || process.argv[dataIndex + 1]!.startsWith("--"))) throw new Error("Fixture data directory is missing");
const host = dataIndex >= 0 ? await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(resolve(process.argv[dataIndex + 1]!)), sessionStore: new FileSessionStore(resolve(process.argv[dataIndex + 1]!)) }) : new StandaloneAgentHost();
await host.configure({ providerId: "openai-compatible", protocol: "chat-completions", baseUrl: fixture.baseUrl, modelId: "fixture-model" });
const server = createStandaloneServer({ host, clientDirectory: fileURLToPath(new URL("../dist/client/", import.meta.url)) });
server.listen(8788, "127.0.0.1", () => {
  console.log("Fixture UI: http://127.0.0.1:8788 (local test only, no real provider)");
  console.log("Fill any test-only key in settings, then manually enable Agent.");
});
server.on("error", () => { void shutdown(); process.exitCode = 1; });
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await host.dispose(); await fixture.close();
  server.closeAllConnections(); server.close();
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
