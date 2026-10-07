import { fileURLToPath } from "node:url";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, textReply } from "./model-fixture.ts";

// Explicit test entry only. Production startup never imports a fixture or fills a credential.
const fixture = await createModelFixture((request, count) => {
  const context = JSON.stringify(request.body.messages);
  if (context.includes("[stop]")) return { hang: true };
  if (context.includes("[fail]")) return { error: "fixture-request-failed" };
  return textReply(count === 1 ? "这是本地模型 fixture 的流式回复，用于检查界面和传输链路。它没有调用 DeepSeek。"
    : "这是后续本地测试回复。宿主已把预算内的上一轮完整内容放进新的请求上下文。", { delayMs: 250 });
}, { catalog: (request) => {
  if (request.headers.authorization === "Bearer fixture-unauthorized") return { status: 401, value: { error: "fixture-only-auth-failure" } };
  if (request.headers.authorization === "Bearer fixture-empty") return { value: { data: [] } };
  if (request.headers.authorization === "Bearer fixture-slow") return { hang: true };
  return { value: { data: [{ id: "fixture-model" }, { id: "fixture-secondary" }] } };
} });
const host = new StandaloneAgentHost();
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
