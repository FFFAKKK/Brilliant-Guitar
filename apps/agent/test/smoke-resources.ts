import { resolve } from "node:path";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";

// Explicit local mechanism demo. Never imported by production main.ts.
const fixture = await createModelFixture((request, count) => {
  const messages = request.body.messages as { role: string; content: string }[];
  const current = [...messages].reverse().find((message) => message.role === "user");
  const input = current ? JSON.parse(current.content) as { goal?: string; context?: { contextItemId: string; content: { items?: { resourceId: string }[] } }[] } : {};
  if (input.goal?.includes("[stop]")) return { hang: true };
  const catalog = input.context?.find((item) => item.contextItemId === "resource.catalog")?.content.items;
  if (catalog?.length && !messages.some((message) => message.role === "tool")) {
    return { ...toolReply("tool_1", JSON.stringify({ resourceId: input.goal?.includes("[resource-fail]") ? "unknown-resource" : catalog[0]!.resourceId,
      start: 0, maxCharacters: 2048 }), `resource-demo-${count}`), delayMs: 200 };
  }
  const returned = messages.filter((message) => message.role === "tool").map((message) => JSON.parse(message.content) as { data: { name: string; text: string; eof: boolean } });
  return textReply(returned.length ? `这是本地模型 fixture 的机制演示，没有调用真实供应商。\n\n工具实际读取了 **${returned[0]!.data.name}**：\n\n${returned[0]!.data.text}\n\n${returned[0]!.data.eof ? "本页已到文件结尾。" : "资料尚有后续页；本演示只展示首段。"}`
    : "这是本地模型 fixture 的对话。先添加 TXT/MD，再发消息，可检查真实工具读取链路。", { delayMs: 180 });
});
const host = new StandaloneAgentHost();
await host.configure({ providerId: "openai-compatible", protocol: "chat-completions", modelId: "fixture-model", baseUrl: fixture.baseUrl });
const portIndex = process.argv.indexOf("--port"), clientIndex = process.argv.indexOf("--client-dir");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8791;
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Fixture port is invalid");
const server = createStandaloneServer({ host, clientDirectory: resolve(clientIndex >= 0 ? process.argv[clientIndex + 1]! : "dist/client") });
server.listen(port, "127.0.0.1", () => console.log(`Resource fixture: http://127.0.0.1:${port} (local test only). Set any test-only key and manually enable.`));
server.on("error", () => { void shutdown(); process.exitCode = 1; });
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return; closing = true;
  await host.dispose(); await fixture.close(); server.closeAllConnections(); server.close();
}
process.on("SIGINT", () => { void shutdown(); }); process.on("SIGTERM", () => { void shutdown(); });
