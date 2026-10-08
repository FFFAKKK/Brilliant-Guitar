import assert from "node:assert/strict";
import test from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createPiDecisionPlugin } from "../src/pi/decision-adapter.ts";
import { createAgentPluginProvider, createExternalAgentPlugin } from "../src/runtime/agent-plugin-contract.ts";
import { createAgentSession } from "../src/session/agent-session.ts";
import { AgentToolRegistry, type RegisteredAgentTool } from "../src/session/tool-registry.ts";
import type { AgentProviderRequest } from "../src/runtime/provider.ts";

function fixture() {
  const model = createFauxCore({ api: "fake-chat", provider: "fake", models: [{ id: "standalone", name: "Standalone fixture" }] });
  const plugin = createPiDecisionPlugin({ id: "brilliant.pi", version: "0.1.0", label: "Pi", model: model.getModel(), streamFn: model.streamSimple });
  const provider = createAgentPluginProvider(plugin);
  const requests: AgentProviderRequest[] = [];
  return { model, requests, provider: { decide: (...args: Parameters<typeof provider.decide>) => { requests.push(args[0]); return provider.decide(...args); } } };
}

test("headless Pi conversation retains full previous reply, with no score or UI", async () => {
  const { model, provider, requests } = fixture();
  const longAnswer = "完整内容".repeat(300) + "回复尾部标记";
  model.setResponses([fauxAssistantMessage(longAnswer), fauxAssistantMessage("我记得你的上一轮内容。")]);
  const session = createAgentSession({ provider });
  assert.throws(() => session.submit("不能自动启用"), /启用/);
  assert.equal(requests.length, 0);
  await session.setEnabled(true);
  const first = await session.submit("记住：上下文是本会话的状态");
  const second = await session.submit("上一轮说了什么？");
  assert.equal(first.run.state.lifecycle, "terminal");
  assert.equal(second.response, "我记得你的上一轮内容。");
  assert.equal(second.run.workspace.documentId, null);
  assert.deepEqual(requests[0]?.toolset.capabilityIds, []);
  assert.ok(JSON.stringify(requests[1]?.context).includes("回复尾部标记"));
  await session.reset();
  model.setResponses([fauxAssistantMessage("新对话")]);
  await session.submit("另一个话题");
  assert.ok(!JSON.stringify(requests.at(-1)?.context).includes("回复尾部标记"));
  await session.dispose();
});

function echoTool(execute: RegisteredAgentTool["execute"]): RegisteredAgentTool {
  return { descriptor: {
    id: "demo.echo", contractVersion: 1, name: "Echo", description: "测试工具", kind: "query", inputSchema: { type: "object", properties: {} }, outputSummary: "反馈", preconditions: [],
    sideEffects: { document: "none", filesystem: "none", network: "none", settings: "none", playback: "none" },
    scopeLimit: "none", requiresDocument: false, approvalRequirement: "risk-based", costClass: "constant", allowedPhases: ["planning"],
    validateInput: (value) => typeof value === "object" && value !== null,
  }, execute };
}

test("registered general tool executes once in Controller and feeds the next Pi decision", async () => {
  const { model, provider, requests } = fixture();
  let executions = 0;
  model.setResponses([fauxAssistantMessage(fauxToolCall("demo.echo", {}, { id: "echo-call" }), { stopReason: "toolUse" }), fauxAssistantMessage("收到权威工具反馈。")]);
  const session = createAgentSession({ provider, tools: new AgentToolRegistry([echoTool(async () => { ++executions; return { token: "authoritative-echo-result" }; })]) });
  await session.setEnabled(true);
  const result = await session.submit("调用已注册的工具");
  assert.equal(executions, 1);
  assert.equal(result.run.invocations[0]?.state.status, "succeeded");
  assert.ok(JSON.stringify(requests[1]?.context).includes("authoritative-echo-result"));
  assert.equal(session.getSnapshot().status, "completed");
  await session.dispose();
});

test("unknown tool cannot execute, and failure is not remembered as completed history", async () => {
  const { model, provider, requests } = fixture();
  let executions = 0;
  model.setResponses([fauxAssistantMessage(fauxToolCall("guessed.tool", {}), { stopReason: "toolUse" }), fauxAssistantMessage("新的回复")]);
  const session = createAgentSession({ provider, tools: new AgentToolRegistry([echoTool(async () => ++executions)]) });
  await session.setEnabled(true);
  await session.submit("失败目标标记");
  assert.equal(session.getSnapshot().status, "failed");
  await session.submit("重新发起请求");
  assert.equal(executions, 0);
  assert.ok(!JSON.stringify(requests.at(-1)?.context).includes("失败目标标记"));
  await session.dispose();
});

test("duplicate submissions are rejected; reset isolates late output and cancels the original run", async () => {
  let resolveOld!: (decision: unknown) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let calls = 0;
  const session = createAgentSession({ provider: { decide: async () => {
    if (++calls === 1) return new Promise((resolve) => { resolveOld = resolve; markStarted(); });
    return { kind: "finish", reason: "completed", text: "新会话回复" };
  } } });
  await session.setEnabled(true);
  const pending = session.submit("旧会话");
  await started;
  assert.throws(() => session.submit("重复提交"), /运行/);
  const reset = session.reset();
  resolveOld({ kind: "finish", reason: "completed", text: "迟到的旧回复" });
  await reset;
  await pending;
  await session.submit("新会话");
  assert.equal(session.getSnapshot().messages.length, 2);
  assert.ok(!JSON.stringify(session.getSnapshot()).includes("迟到的旧回复"));
  await session.dispose();
  assert.throws(() => session.submit("已退出"), /disposed/);
});

test("oversized input is rejected without a model request, and old turns are omitted as whole pairs", async () => {
  const { model, provider, requests } = fixture();
  model.setResponses([fauxAssistantMessage("回答".repeat(2000)), fauxAssistantMessage("第二次回答")]);
  const session = createAgentSession({ provider, budget: { tokenBudget: 512 } });
  await session.setEnabled(true);
  assert.throws(() => session.submit("x".repeat(3000)), /预算/);
  assert.equal(requests.length, 0);
  await session.submit("第一轮");
  await session.submit("第二轮");
  assert.equal(session.getSnapshot().omittedHistoryTurns, 1);
  assert.ok(!JSON.stringify(requests.at(-1)?.context).includes("回答回答"));
  await session.dispose();
});

test("snapshot observers cannot reenter submit, and repeated enable preserves an active run", async () => {
  let resolveDecision!: (value: unknown) => void;
  let started!: () => void;
  const deciding = new Promise<void>((resolve) => { started = resolve; });
  const session = createAgentSession({ provider: { decide: async () => { started(); return new Promise((resolve) => { resolveDecision = resolve; }); } } });
  await session.setEnabled(true);
  let attempts = 0;
  const reentryResults: string[] = [];
  session.subscribe(({ snapshot }) => {
    if (snapshot.status === "running" || snapshot.status === "completed") {
      ++attempts;
      try { void session.submit("观察者重入"); reentryResults.push("accepted"); }
      catch (error) { reentryResults.push(error instanceof Error ? error.message : "unknown"); }
    }
  });
  const pending = session.submit("正常请求"); await deciding;
  await session.setEnabled(true); assert.equal(session.getSnapshot().status, "running");
  resolveDecision({ kind: "finish", reason: "completed", text: "回复" });
  await pending; assert.ok(attempts >= 2);
  assert.ok(reentryResults.every((message) => message.includes("运行")));
  assert.equal(session.getSnapshot().messages.length, 2);
  await session.dispose();
});

test("disabling revokes new submissions before an original completion callback can start another run", async () => {
  let resolveDecision!: (value: unknown) => void;
  let started!: () => void;
  const deciding = new Promise<void>((resolve) => { started = resolve; });
  const session = createAgentSession({ provider: { decide: async () => { started(); return new Promise((resolve) => { resolveDecision = resolve; }); } } });
  await session.setEnabled(true);
  const pending = session.submit("原请求"); await deciding;
  const checked = pending.then(() => { assert.throws(() => session.submit("停用过程中的新请求"), /启用/); });
  const disabling = session.setEnabled(false);
  resolveDecision({ kind: "finish", reason: "completed", text: "迟到回复" });
  await Promise.all([disabling, checked]);
  assert.equal(session.getSnapshot().status, "disabled");
  await session.dispose();
});

test("the displayed message window is bounded in whole turns", async () => {
  const session = createAgentSession({ provider: { decide: async () => ({ kind: "finish", reason: "completed", text: "完整回复" }) }, budget: { historyTurnBudget: 1 } });
  await session.setEnabled(true);
  await session.submit("第一轮"); await session.submit("第二轮");
  assert.equal(session.getSnapshot().messages.length, 2);
  assert.equal(session.getSnapshot().messages[0]?.content, "第二轮");
  await session.dispose();
});

test("input budget hook samples once per Run, freezes all Pi rounds and preserves item limits", async () => {
  const { model, provider, requests } = fixture();
  let budget = 16384, samples = 0;
  model.setResponses([fauxAssistantMessage(fauxToolCall("demo.echo", {}, { id: "budget-call" }), { stopReason: "toolUse" }), fauxAssistantMessage("done"), fauxAssistantMessage("next")]);
  const session = createAgentSession({ provider, inputTokenBudget: () => { ++samples; return budget; },
    budget: { itemCountBudget: 32, historyTurnBudget: 3, toolResultSizeBudget: 4096 },
    tools: new AgentToolRegistry([echoTool(async () => { budget = 1024; return { text: "frozen-run" }; })]) });
  await session.setEnabled(true); const outcome = await session.submit("read");
  assert.equal(samples, 1); assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.context.budget.tokenBudget, 16384);
    assert.equal(request.context.budget.itemCountBudget, 32);
  }
  assert.equal(outcome.run.invocations[0]?.state.status, "succeeded");
  await session.submit("next"); assert.equal(samples, 2); assert.equal(requests[2]?.context.budget.tokenBudget, 1024);
  await session.dispose();
});

test("invalid or throwing hooks leave zero transcript, checkpoints, provider and tool side effects", async () => {
  let budget: number = NaN, samples = 0, checkpoints = 0, requests = 0, executions = 0;
  const session = createAgentSession({ retainTranscript: true, budget: { tokenBudget: 512 }, inputTokenBudget: () => { ++samples; if (budget === -1) throw new Error("hook failed"); return budget; },
    checkpoint: async () => { ++checkpoints; }, provider: { decide: async () => { ++requests; return { kind: "finish", reason: "completed", text: "ok" }; } },
    tools: new AgentToolRegistry([echoTool(async () => { ++executions; return {}; })]) });
  await session.setEnabled(true); const before = session.getSnapshot();
  for (budget of [NaN, Infinity, 1.5, 1023, 65537, -1]) {
    assert.throws(() => session.submit("rejected")); assert.equal(session.getSnapshot(), before); assert.equal(session.hasActiveRun(), false);
  }
  assert.equal(samples, 6); assert.equal(checkpoints + requests + executions, 0);
  budget = 1024; assert.throws(() => session.submit("x".repeat(4000)), /预算/); assert.equal(session.getSnapshot(), before);
  budget = 16384; await session.submit("x".repeat(4000)); assert.equal(requests, 1);
  await session.dispose();
});

test("external plugin receives the same frozen Controller budget and hook reentry is rejected", async () => {
  let session: ReturnType<typeof createAgentSession>, samples = 0;
  const plugin = createExternalAgentPlugin({ id: "example.external", label: "External", version: "1", decide: async (request) => {
    assert.equal(request.context.budget.tokenBudget, 16384);
    return { kind: "finish", reason: "completed", text: "external response" };
  } });
  session = createAgentSession({ provider: createAgentPluginProvider(plugin), inputTokenBudget: () => {
    ++samples; assert.throws(() => session.submit("reenter"), /预算正在读取/); return 16384;
  } });
  await session.setEnabled(true); await session.submit("external");
  assert.equal(samples, 1); assert.equal(session.getSnapshot().messages.length, 2); await session.dispose();
});

test("legacy history projection uses the newly sampled budget without changing its retained window", async () => {
  const { model, provider, requests } = fixture(); let budget = 16384;
  model.setResponses([fauxAssistantMessage("x".repeat(4000)), fauxAssistantMessage("small")]);
  const session = createAgentSession({ provider, inputTokenBudget: () => budget, budget: { historyTurnBudget: 3 } });
  await session.setEnabled(true); await session.submit("first"); budget = 1024;
  await session.submit("next"); assert.equal(session.getSnapshot().omittedHistoryTurns, 1);
  assert.equal(requests[1]?.context.budget.tokenBudget, 1024);
  assert.ok(!JSON.stringify(requests[1]?.context).includes("x".repeat(4000)));
  await session.dispose();
});
