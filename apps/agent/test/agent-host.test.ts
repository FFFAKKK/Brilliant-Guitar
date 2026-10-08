import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { AgentToolRegistry, isAgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";
import type { RegisteredAgentTool } from "@brilliant-guitar/agent-runtime";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { isStandaloneAgentSnapshot, type StandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";

const sentinel = "fixture-private-key-only-on-host";
export function waitForHost(host: StandaloneAgentHost, predicate: (snapshot: StandaloneAgentSnapshot) => boolean): Promise<StandaloneAgentSnapshot> {
  if (predicate(host.getSnapshot())) return Promise.resolve(host.getSnapshot());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("Host state did not settle")); }, 5000);
    const unsubscribe = host.subscribe((snapshot) => { if (predicate(snapshot)) { clearTimeout(timer); unsubscribe(); resolve(snapshot); } });
  });
}
async function configuredHost(baseUrl: string, tools?: AgentToolRegistry) {
  const host = new StandaloneAgentHost(tools ? { tools } : {});
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl });
  await host.saveCredential(sentinel);
  return host;
}

test("production host uses Pi and the shared Controller for complete multi-turn conversations", async (t) => {
  const answer = "完整回复".repeat(250) + "尾部保留标记";
  const fixture = await createModelFixture([textReply(answer), textReply("第二轮回复"), textReply("新会话")]); t.after(fixture.close);
  const host = await configuredHost(fixture.baseUrl); t.after(() => host.dispose());
  assert.throws(() => host.submit("未启用"), /启用/);
  await assert.rejects(host.testConnection(), /启用/);
  assert.equal(fixture.requests.length, 0);
  await host.setEnabled(true);
  const first = await host.session.submit("记住第一轮信息");
  assert.equal(first.response, answer);
  await host.session.submit("继续对话");
  assert.ok(JSON.stringify(fixture.requests[1]?.body.messages).includes("尾部保留标记"));
  assert.equal(fixture.requests[0]?.body.tools, undefined);
  assert.ok(!JSON.stringify({ snapshot: host.getSnapshot(), run: first.run, requests: fixture.requests.map((item) => item.body) }).includes(sentinel));
  assert.ok(isStandaloneAgentSnapshot(host.getSnapshot()));
  await host.reset(); await host.session.submit("另一个话题");
  assert.ok(!JSON.stringify(fixture.requests[2]?.body.messages).includes("尾部保留标记"));
  assert.equal(host.getSnapshot().session.messages.length, 2);
});

test("injected generic tool executes exactly once; feedback is passed through the next Pi decision", async (t) => {
  const fixture = await createModelFixture([toolReply("tool_1", "{}"), textReply("工具反馈已收到")]); t.after(fixture.close);
  let executions = 0;
  const tool: RegisteredAgentTool = { descriptor: {
    id: "demo.read-summary", contractVersion: 1, name: "Demo", description: "测试读取", kind: "query", inputSchema: { type: "object", properties: {} }, outputSummary: "测试反馈", preconditions: [],
    sideEffects: { document: "none", filesystem: "none", network: "none", settings: "none", playback: "none" }, scopeLimit: "none", requiresDocument: false, approvalRequirement: "risk-based", costClass: "constant", allowedPhases: ["planning"],
    validateInput: (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  }, execute: async () => { ++executions; return { value: "host-authoritative-result" }; } };
  const host = await configuredHost(fixture.baseUrl, new AgentToolRegistry([tool])); t.after(() => host.dispose());
  await host.setEnabled(true);
  const result = await host.session.submit("调用工具");
  assert.equal(executions, 1); assert.equal(result.run.invocations[0]?.state.status, "succeeded");
  assert.equal(result.response, "工具反馈已收到");
  assert.ok(JSON.stringify(fixture.requests[1]?.body.messages).includes("host-authoritative-result"));
});

test("connection probe is explicit, uses the same runtime, and does not enter conversation history", async (t) => {
  const fixture = await createModelFixture([textReply("连接成功"), textReply("正常对话")]); t.after(fixture.close);
  const host = await configuredHost(fixture.baseUrl); t.after(() => host.dispose());
  assert.equal(fixture.requests.length, 0);
  await host.setEnabled(true); assert.equal(fixture.requests.length, 0);
  assert.equal(await host.testConnection(), true);
  assert.equal(host.getSnapshot().session.messages.length, 0);
  await host.session.submit("正常对话");
  assert.ok(!JSON.stringify(fixture.requests[1]?.body.messages).includes("请只回复"));
});

test("HTTP/SSE expose authoritative snapshots, reject concurrent work, and clear target-bound credentials", async (t) => {
  const fixture = await createModelFixture([{ hang: true }]);
  const host = new StandaloneAgentHost();
  const server = createStandaloneServer({ host });
  await listenForTest(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const api = async (path: string, body?: unknown, method = "POST") => {
    const response = await fetch(`${baseUrl}/api/${path}`, body === undefined ? {} : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() as unknown };
  };
  const streamAbort = new AbortController();
  t.after(async () => { streamAbort.abort(); await host.dispose(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await fixture.close(); });
  const stream = await fetch(`${baseUrl}/api/session/events`, { signal: streamAbort.signal });
  const reader = stream.body?.getReader(); assert.ok(reader);
  let frames = "";
  async function frame(): Promise<StandaloneAgentSnapshot> {
    while (!frames.includes("\n\n")) { const part = await reader!.read(); assert.ok(!part.done); frames += new TextDecoder().decode(part.value); }
    const end = frames.indexOf("\n\n"); const next = frames.slice(0, end); frames = frames.slice(end + 2);
    const data = next.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    const value: unknown = JSON.parse(data ?? "null"); assert.ok(isStandaloneAgentSnapshot(value)); return value;
  }
  assert.equal((await frame()).session.enabled, false);
  assert.equal((await api("session/messages", { message: "未启用" })).status, 400);
  assert.equal((await api("model-test", {})).status, 400);
  assert.equal((await api("model-config", { providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl: fixture.baseUrl }, "PUT")).status, 200);
  assert.equal((await api("model-credential", { apiKey: sentinel }, "PUT")).status, 200);
  assert.equal(fixture.requests.length, 0);
  let credentialState = await frame(); while (!credentialState.credentialPresent) credentialState = await frame();
  assert.ok(!JSON.stringify(credentialState).includes(sentinel));
  assert.equal((await api("session/enable", { enabled: true })).status, 200);
  assert.equal((await api("session/messages", { message: "等待流式输出" })).status, 200);
  await waitForHost(host, (snapshot) => snapshot.session.messages.some((item) => item.content === "尚未结束"));
  assert.equal((await api("session/messages", { message: "并发提交" })).status, 409);
  assert.equal((await api("model-config", host.getSnapshot().configuration, "PUT")).status, 409);
  assert.equal((await api("model-credential", { apiKey: "replacement" }, "PUT")).status, 409);
  const enabledAgain = await api("session/enable", { enabled: true }); assert.equal(enabledAgain.status, 200);
  assert.ok(isStandaloneAgentSnapshot(enabledAgain.value)); assert.equal(enabledAgain.value.session.status, "running");
  const cancelled = await api("session/cancel", {}); assert.equal(cancelled.status, 200);
  assert.ok(isStandaloneAgentSnapshot(cancelled.value)); assert.equal(cancelled.value.session.status, "cancelled");
  assert.equal((await api("session/reset", {})).status, 200); assert.equal(host.getSnapshot().session.messages.length, 0);
  const newTarget = { ...host.getSnapshot().configuration, baseUrl: `${fixture.baseUrl}/another-target` };
  assert.equal((await api("model-config", newTarget, "PUT")).status, 200);
  assert.equal(host.getSnapshot().credentialPresent, false); assert.equal(host.getSnapshot().session.enabled, false);
  assert.equal((await api("session/enable", { enabled: true })).status, 400); assert.equal(fixture.requests.length, 1);
  assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { origin: "http://unrelated.local" } })).status, 403);
  // Node fetch owns its Host header; use HTTP directly to put the invalid value on the wire.
  const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/api/session`, { headers: { host: "unrelated.local" } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject); request.end();
  });
  assert.equal(invalidHostStatus, 403);
  assert.equal((await api("model-credential", { apiKey: sentinel, unexpected: true }, "PUT")).status, 400);
  assert.ok(isAgentSessionSnapshot(host.getSnapshot().session));
  assert.equal(isStandaloneAgentSnapshot({ ...host.getSnapshot(), apiKey: sentinel }), false);
  await host.dispose(); assert.equal(host.getSnapshot().credentialPresent, false);
});
