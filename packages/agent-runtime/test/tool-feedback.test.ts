import assert from "node:assert/strict";
import test from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";
import { createAgentSession, type AgentSessionOptions } from "../src/session/agent-session.ts";
import { AgentToolRegistry, type RegisteredAgentTool } from "../src/session/tool-registry.ts";
import { createAgentPluginProvider } from "../src/runtime/agent-plugin-contract.ts";
import type { AgentProviderRequest } from "../src/runtime/provider.ts";
import type { AgentModelStreamRequestV1, AgentModelOutputBlockV1 } from "../src/contracts/agent-model-stream.ts";
import type { AgentModelInputDiagnosticV1 } from "../src/contracts/model-input.ts";
import { createPiDecisionPlugin } from "../src/pi/decision-adapter.ts";
import { createHostPiStreamFn } from "../src/pi/openai-stream.ts";
import { projectPiInput } from "../src/pi/input-projection.ts";

const model = createFauxCore({ api: "fake-chat", provider: "fake", models: [{ id: "feedback", name: "Feedback" }] }).getModel();
function tool(execute: RegisteredAgentTool["execute"], id = "demo.read"): RegisteredAgentTool {
  return { descriptor: { id, contractVersion: 1, name: "Read", description: "Read data", kind: "query",
    inputSchema: { type: "object", required: ["page"], properties: { page: { type: "integer" } } }, outputSummary: "Actual data", preconditions: [],
    sideEffects: { document: "none", filesystem: "none", network: "none", settings: "none", playback: "none" }, scopeLimit: "none",
    requiresDocument: false, approvalRequirement: "risk-based", costClass: "constant", allowedPhases: ["planning"],
    validateInput: (input) => typeof input === "object" && input !== null && Number.isSafeInteger((input as { page?: unknown }).page),
  }, execute };
}
function fixture(outputs: readonly (readonly AgentModelOutputBlockV1[])[], registered: RegisteredAgentTool, options: Partial<Omit<AgentSessionOptions, "provider" | "tools">> = {}) {
  const wire: AgentModelStreamRequestV1[] = [], decisions: AgentProviderRequest[] = [], diagnostics: AgentModelInputDiagnosticV1[] = [];
  const session = createAgentSession({ ...options, tools: new AgentToolRegistry([registered]), provider: { decide: async (request, signal, observer) => {
    decisions.push(request);
    const streamFn = createHostPiStreamFn({
      async readAgentProviderCredentialStatus(providerId) { return { providerId, present: true, status: "configured", message: "fixture" }; },
      async streamAgentModel(input, _signal, streamObserver) {
        wire.push(input);
        streamObserver?.({ type: "response.started", runId: input.runId, turnId: input.turnId, sequence: 1 });
        streamObserver?.({ type: "response.completed", runId: input.runId, turnId: input.turnId, sequence: 2 });
        return { schemaVersion: 1, providerId: input.providerId, modelId: input.modelId, providerRequestId: `fixture-${wire.length}`,
          output: outputs[wire.length - 1] ?? [{ type: "text", text: "Done" }], usage: null };
      },
    }, request, { providerId: model.provider, modelId: model.id }, model, { onInput: (diagnostic) => diagnostics.push(diagnostic) });
    return createAgentPluginProvider(createPiDecisionPlugin({ id: "brilliant.pi", version: "0.1.0", label: "Pi", model, streamFn })).decide(request, signal, observer);
  } } });
  return { session, wire, decisions, diagnostics };
}
const call = (id: string, page: number): AgentModelOutputBlockV1 => ({ type: "tool-call", callId: id, name: "demo.read", arguments: { page } });

test("actual Controller/Pi restores multi-call and multi-turn feedback exactly once, with immutable host identities", async (t) => {
  const executions: number[] = [];
  const f = fixture([[call("call-a", 0), call("call-b", 1)], [call("call-c", 2)], [{ type: "text", text: "All pages read" }]],
    tool(async (input) => { const page = (input as { page: number }).page; executions.push(page); return { text: `actual-page-${page}` }; }),
    { onProgress() { throw new Error("observer failure"); } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true);
  const outcome = await f.session.submit("Read all pages");
  assert.equal(outcome.response, "All pages read"); assert.deepEqual(executions, [0, 1, 2]);
  assert.deepEqual(f.wire[1]?.messages.map((m) => m.role), ["system", "user", "assistant", "tool", "tool"]);
  assert.deepEqual(f.wire[2]?.messages.map((m) => m.role), ["system", "user", "assistant", "tool", "tool", "assistant", "tool"]);
  const messages = f.wire[2]!.messages;
  assert.equal(JSON.stringify(messages).split("Read all pages").length - 1, 1);
  for (const [index, id] of ["call-a", "call-b", "call-c"].entries()) {
    const result = messages.find((m) => m.role === "tool" && m.toolCallId === id);
    assert.ok(result?.role === "tool");
    const body = JSON.parse(result.content) as { invocationId: string; source: { contextItemId: string }; data: { text: string } };
    assert.equal(body.invocationId, outcome.run.invocations[index]?.invocationId);
    assert.equal(body.source.contextItemId, `capability-result:${body.invocationId}`);
    assert.equal(body.data.text, `actual-page-${index}`);
    assert.equal(JSON.stringify(messages).split(`actual-page-${index}`).length - 1, 1);
  }
  const group = f.decisions[1]!.toolFeedback![0]!;
  assert.ok(Object.isFrozen(group)); assert.ok(Object.isFrozen(group.calls[0]?.call.input));
  assert.throws(() => { Object.assign(group.calls[0]!.result, { data: "forged" }); }, TypeError);
  assert.equal(f.decisions[0]?.toolFeedback, undefined);
  assert.equal(f.decisions[1]?.toolFeedback?.length, 1); assert.equal(f.decisions[2]?.toolFeedback?.length, 2);
  assert.ok(f.diagnostics[2]?.sources.some((s) => s.contextItemId === group.calls[0]?.source.contextItemId));
});

test("Pi rejects mismatched, incomplete and duplicated replay units before projecting successful tools", async (t) => {
  const f = fixture([[call("call-a", 0)], [{ type: "text", text: "Done" }]], tool(async () => ({ text: "actual" })));
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); await f.session.submit("Read");
  const request = f.decisions[1]!, group = request.toolFeedback![0]!, entry = group.calls[0]!;
  const invalid = [
    { ...group, runId: "wrong-run" }, { ...group, turnId: "" }, { ...group, calls: [] },
    { ...group, calls: [entry, entry] },
    { ...group, calls: [entry, { ...entry, call: { ...entry.call, callId: "another-call" } }] },
    { ...group, calls: [{ ...entry, invocationId: "wrong-invocation" }] },
    { ...group, calls: [{ ...entry, result: { ...entry.result, capabilityId: "another.tool" } }] },
    { ...group, calls: [{ ...entry, source: { ...entry.source, sourceType: "user" } }] },
    { ...group, calls: [{ ...entry, source: { ...entry.source, trustLevel: "user-provided" as const } }] },
  ];
  for (const altered of invalid) assert.throws(() => projectPiInput({ ...request, toolFeedback: [altered] }, model), /工具/);
});

test("large actual result stays an entire call/result group; final overflow sends no subsequent model request", async (t) => {
  let executions = 0;
  const f = fixture([[call("call-a", 0)]], tool(async () => { ++executions; return { text: "资料".repeat(2300) }; }), { budget: { tokenBudget: 2400 } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); await f.session.submit("Read");
  assert.equal(executions, 1); assert.equal(f.wire.length, 1);
  assert.equal(f.diagnostics.at(-1)?.status, "budget-exceeded");
  assert.deepEqual(f.diagnostics.at(-1)?.roles, ["system", "user", "assistant", "tool"]);
  assert.equal(f.session.getSnapshot().status, "failed");
});

test("host context/policy callback failure leaves no active run or partial transcript", async (t) => {
  for (const callback of ["contextItems", "allowedToolIds"] as const) {
    let fail = true;
    const session = createAgentSession({ provider: { decide: async () => ({ kind: "finish", reason: "completed", text: "Done" }) },
      [callback]: () => { if (fail) throw new Error("host callback failed"); return []; } });
    t.after(() => session.dispose()); await session.setEnabled(true);
    assert.throws(() => session.submit("Read"), /host callback/);
    assert.equal(session.hasActiveRun(), false); assert.equal(session.getSnapshot().messages.length, 0);
    fail = false; await session.submit("Retry"); assert.equal(session.getSnapshot().status, "completed");
  }
});

test("registry composition preserves original registration and rejects duplicate identities", () => {
  const original = new AgentToolRegistry([tool(async () => "one")]);
  const combined = original.withTools([tool(async () => "two", "other.read")]);
  assert.deepEqual(original.catalog.map((d) => d.id), ["demo.read"]);
  assert.deepEqual(combined.catalog.map((d) => d.id), ["demo.read", "other.read"]);
  assert.throws(() => original.withTools([tool(async () => "duplicate")]), /Duplicate/);
});
