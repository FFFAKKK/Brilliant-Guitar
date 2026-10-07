import assert from "node:assert/strict";
import test from "node:test";
import { createAgentModelStreamRequestV1, isAgentModelStreamEventV1 } from "@brilliant-guitar/agent-runtime/contracts/agent-model-stream";
import type { AgentModelStreamEventV1 } from "@brilliant-guitar/agent-runtime/contracts/agent-model-stream";
import { parseAgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import { createCompletionsModelHost } from "../src/server/model-host.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";

const sentinel = "fixture-private-key-never-in-dto";
function configuration(baseUrl: string, providerId: "deepseek" | "openai-compatible" = "deepseek") { return parseAgentModelConfiguration({ providerId, protocol: "chat-completions", modelId: "fixture-model", baseUrl }); }
function request(providerId = "deepseek", timeoutMs = 2000) {
  return createAgentModelStreamRequestV1(providerId, "fixture-model", "run-1", "turn-1", [{ role: "user", content: "测试" }], [], { timeoutMs, maxOutputTokens: 128 });
}

test("Pi completions sends the configured target and explicit credential, maps usage-only final chunks", async (t) => {
  const fixture = await createModelFixture([textReply("真实传输 fixture 回复")]); t.after(fixture.close);
  const events: AgentModelStreamEventV1[] = [];
  const result = await createCompletionsModelHost(configuration(fixture.baseUrl), sentinel).streamAgentModel!(request(), undefined, (event) => events.push(event));
  assert.equal(fixture.requests[0]?.url, "/v1/chat/completions");
  assert.equal(fixture.requests[0]?.headers.authorization, `Bearer ${sentinel}`);
  assert.deepEqual(fixture.requests[0]?.body.thinking, { type: "disabled" });
  assert.equal(fixture.requests[0]?.body.model, "fixture-model");
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  assert.deepEqual(result.output, [{ type: "text", text: "真实传输 fixture 回复" }]);
  assert.equal(events[0]?.type, "response.started"); assert.equal(events.at(-1)?.type, "response.completed");
  assert.ok(events.every(isAgentModelStreamEventV1));
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  assert.ok(!JSON.stringify({ events, result, body: fixture.requests[0]?.body }).includes(sentinel));
});

test("generic compatible transport does not add DeepSeek-only options; alias maps are local to each request", async (t) => {
  const fixture = await createModelFixture([toolReply("tool_1", '{"value":"ok"}'), toolReply("tool_1", '{}')]); t.after(fixture.close);
  const host = createCompletionsModelHost(configuration(fixture.baseUrl, "openai-compatible"), sentinel);
  const first = await host.streamAgentModel!({ ...request("openai-compatible"), tools: [{ name: "score.read-summary", description: "read", parameters: { type: "object" } }, { name: "demo-tool", description: "demo", parameters: { type: "object" } }] });
  assert.equal(fixture.requests[0]?.body.thinking, undefined);
  assert.equal(first.output[0]?.type === "tool-call" && first.output[0].name, "score.read-summary");
  assert.deepEqual(first.output[0]?.type === "tool-call" && first.output[0].arguments, { value: "ok" });
  assert.ok(JSON.stringify(fixture.requests[0]?.body.tools).includes("tool_2"));
  const second = await host.streamAgentModel!({ ...request("openai-compatible"), tools: [{ name: "demo-tool", description: "demo", parameters: { type: "object" } }] });
  assert.equal(second.output[0]?.type === "tool-call" && second.output[0].name, "demo-tool");
});

test("usage attached to the finish chunk is accepted without a separate usage-only chunk", async (t) => {
  const reply = textReply("已完成"); assert.ok("chunks" in reply);
  const chunks = reply.chunks.slice(0, -1);
  chunks[chunks.length - 1] = { ...chunks.at(-1), usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } };
  const fixture = await createModelFixture([{ chunks }]); t.after(fixture.close);
  const result = await createCompletionsModelHost(configuration(fixture.baseUrl), sentinel).streamAgentModel!(request());
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 4, totalTokens: 16 });
});

test("length-truncated output cannot become a completed response", async (t) => {
  const fixture = await createModelFixture([{ chunks: [{ id: "length-fixture", choices: [{ index: 0, delta: { content: "截断内容" }, finish_reason: "length" }] }] }]); t.after(fixture.close);
  const events: AgentModelStreamEventV1[] = [];
  await assert.rejects(createCompletionsModelHost(configuration(fixture.baseUrl), sentinel).streamAgentModel!(request(), undefined, (event) => events.push(event)));
  assert.equal(events.at(-1)?.type, "response.failed");
});

for (const [name, reply] of [
  ["unknown tool alias", toolReply("unregistered", "{}")],
  ["unfinished tool JSON", toolReply("tool_1", '{"value":')],
  ["non-object tool JSON", toolReply("tool_1", "[]")],
  ["stream missing finish_reason", textReply("未完成", { unfinished: true })],
  ["provider error containing credential", { error: sentinel }],
] as const) {
  test(`fails closed for ${name}, exposes only stable failure`, async (t) => {
    const fixture = await createModelFixture([reply]); t.after(fixture.close);
    const events: AgentModelStreamEventV1[] = [];
    await assert.rejects(createCompletionsModelHost(configuration(fixture.baseUrl), sentinel).streamAgentModel!({ ...request(), tools: [{ name: "demo.tool", description: "demo", parameters: { type: "object" } }] }, undefined, (event) => events.push(event)), (error) => error instanceof Error && !error.message.includes(sentinel));
    assert.equal(events.at(-1)?.type, "response.failed");
    assert.equal(events.filter((event) => event.type === "response.failed").length, 1);
    assert.ok(!events.some((event) => event.type === "response.completed"));
    assert.equal(fixture.requests.length, 1);
  });
}

for (const mode of ["cancel", "timeout"] as const) {
  test(`transport ${mode} aborts the stream and has one terminal event`, async (t) => {
    const fixture = await createModelFixture([{ hang: true }]); t.after(fixture.close);
    const controller = new AbortController();
    const events: AgentModelStreamEventV1[] = [];
    const pending = createCompletionsModelHost(configuration(fixture.baseUrl), sentinel).streamAgentModel!(request("deepseek", mode === "timeout" ? 150 : 2000), controller.signal, (event) => {
      events.push(event);
      if (mode === "cancel" && event.type === "response.text-delta") controller.abort();
    });
    await assert.rejects(pending);
    assert.equal(events.at(-1)?.type, "response.failed");
    const last = events.at(-1);
    assert.equal(last?.type === "response.failed" && last.code, mode === "cancel" ? "aborted" : "timeout");
  });
}

test("wrong model identity and already-aborted requests send no model traffic", async (t) => {
  const fixture = await createModelFixture([]); t.after(fixture.close);
  const host = createCompletionsModelHost(configuration(fixture.baseUrl), sentinel);
  await assert.rejects(host.streamAgentModel!({ ...request(), modelId: "another-model" }));
  const events: AgentModelStreamEventV1[] = [];
  await assert.rejects(host.streamAgentModel!(request(), AbortSignal.abort(), (event) => events.push(event)));
  assert.equal(events[0]?.type, "response.started"); assert.equal(events.at(-1)?.type, "response.failed");
  assert.equal(fixture.requests.length, 0);
});
