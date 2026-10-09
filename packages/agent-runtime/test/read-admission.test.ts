import assert from "node:assert/strict";
import test from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";
import { createAgentSession, type AgentSessionOptions } from "../src/session/agent-session.ts";
import { AgentToolRegistry, type RegisteredAgentTool } from "../src/session/tool-registry.ts";
import { createAgentPluginProvider } from "../src/runtime/agent-plugin-contract.ts";
import { createPiDecisionPlugin } from "../src/pi/decision-adapter.ts";
import { createHostPiStreamFn } from "../src/pi/openai-stream.ts";
import { createPiInputPreview, projectPiModelInput } from "../src/pi/input-preview.ts";
import { projectPiInput } from "../src/pi/input-projection.ts";
import type { AgentProviderRequest } from "../src/runtime/provider.ts";
import type { AgentModelStreamRequestV1, AgentModelOutputBlockV1 } from "../src/contracts/agent-model-stream.ts";
import { freezeAgentToolRejectionFeedbackV1, isAgentInputPreviewV1, isAgentToolRejectionFeedbackV1, isToolFeedbackAdmissionReportV1, resultJsonBytes, type ToolFeedbackAdmissionReportV1 } from "../src/contracts/tool-feedback-admission.ts";
import { ExternalAgentAdapter, createDecisionResponse } from "../src/runtime/external-agent-adapter.ts";
import { FakeExternalAgentTransport, createFakeExternalHello } from "../src/runtime/external-agent-fake-transport.ts";
import { previewExternalInput, projectTurnRequest } from "../src/runtime/external-agent-projection.ts";
import { EXTERNAL_AGENT_PROTOCOL_LIMITS } from "../src/runtime/external-protocol-v1.ts";
import { AgentRunController } from "../src/runtime/run-controller.ts";

const model = createFauxCore({ api: "fake-chat", provider: "fake", models: [{ id: "admission", name: "Admission" }] }).getModel();
const selection = { providerId: model.provider, modelId: model.id };
const port = createPiInputPreview(selection, model);
function readTool(text = "中文🎸\\\"\n".repeat(600)) {
  const executions: { input: unknown; limit: number | undefined; text: string }[] = [];
  const previews: number[] = [];
  const page = (value: unknown, bytes: number) => {
    const requested = (value as { maxCharacters: number }).maxCharacters;
    let low = 1, high = Math.min([...text].length, requested);
    const data = (length: number) => ({ text: [...text].slice(0, length).join(""), nextStart: length, eof: length === [...text].length });
    if (resultJsonBytes(data(low)) > bytes) return null;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (resultJsonBytes(data(mid)) <= bytes) low = mid; else high = mid - 1; }
    return data(low);
  };
  const tool: RegisteredAgentTool = { descriptor: { id: "demo.read", contractVersion: 1, name: "Read", description: "Read immutable text", kind: "query",
    inputSchema: { type: "object", required: ["maxCharacters"], properties: { maxCharacters: { type: "integer" } } }, outputSummary: "Page", preconditions: [],
    sideEffects: { document: "none", filesystem: "none", network: "none", settings: "none", playback: "none" }, scopeLimit: "none",
    requiresDocument: false, approvalRequirement: "risk-based", costClass: "constant", allowedPhases: ["planning"],
    validateInput: (v) => typeof v === "object" && v !== null && Number.isSafeInteger((v as { maxCharacters: number }).maxCharacters) && (v as { maxCharacters: number }).maxCharacters > 0 },
    previewRead(input, context) {
      previews.push(context.resultLimit.maxResultJsonBytes);
      assert.ok(Object.isFrozen(context.resultLimit));
      const data = page(input, context.resultLimit.maxResultJsonBytes);
      return data ? { status: "ready", data } : { status: "insufficient-limit" };
    },
    async execute(input, context) {
      const data = page(input, context?.resultLimit?.maxResultJsonBytes ?? 12288)!;
      executions.push({ input, limit: context?.resultLimit?.maxResultJsonBytes, text: data.text });
      return data;
    } };
  return { tool, executions, previews };
}
const call = (id: string): AgentModelOutputBlockV1 => ({ type: "tool-call", callId: id, name: "demo.read", arguments: { maxCharacters: 4096 } });
function fixture(tool: RegisteredAgentTool, outputs: readonly (readonly AgentModelOutputBlockV1[])[], options: Partial<AgentSessionOptions> = {}) {
  const wire: AgentModelStreamRequestV1[] = [], requests: AgentProviderRequest[] = [], reports: ToolFeedbackAdmissionReportV1[] = [];
  const session = createAgentSession({ tools: new AgentToolRegistry([tool]), readAdmission: { schemaVersion: 1, maxResultJsonBytes: 12288 }, inputPreview: port,
    onToolFeedbackAdmission: (report) => reports.push(report), ...options,
    provider: { async decide(request, signal, observer) {
      requests.push(request);
      const streamFn = createHostPiStreamFn({ async readAgentProviderCredentialStatus(providerId) { return { providerId, present: true, status: "configured", message: "fixture" }; },
        async streamAgentModel(input, _signal, observer) {
          wire.push(input);
          observer?.({ type: "response.started", runId: input.runId, turnId: input.turnId, sequence: 1 });
          observer?.({ type: "response.completed", runId: input.runId, turnId: input.turnId, sequence: 2 });
          return { schemaVersion: 1, providerId: input.providerId, modelId: input.modelId, providerRequestId: "local",
            output: outputs[wire.length - 1] ?? [{ type: "text", text: "Done" }], usage: null };
        } }, request, selection, model, { onSelection: (report) => session.reportContextSelection(report) });
      return createAgentPluginProvider(createPiDecisionPlugin({ id: "brilliant.pi", version: "0.1.0", label: "Pi", model, streamFn })).decide(request, signal, observer);
    } } });
  return { session, wire, requests, reports };
}

test("Controller allocates a smaller immutable page and sends the exact preview once with original call input", async (t) => {
  const tool = readTool(); const f = fixture(tool.tool, [[call("first")]], { budget: { tokenBudget: 2048 } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true);
  const outcome = await f.session.submit("Read the text");
  assert.equal(outcome.response, "Done"); assert.equal(tool.executions.length, 1); assert.equal(f.wire.length, 2);
  assert.deepEqual(tool.executions[0]!.input, { maxCharacters: 4096 }); assert.ok(tool.executions[0]!.text.length < 4096);
  assert.equal(f.wire[1]!.messages.filter((item) => item.role === "tool").length, 1);
  const report = f.reports[0]!; assert.ok(isToolFeedbackAdmissionReportV1(report)); assert.equal(report.status, "admitted");
  for (const [index, request] of f.requests.entries()) {
    const projected = projectPiModelInput(request, selection, model).request;
    assert.deepEqual(f.wire[index]?.messages, projected.messages); assert.deepEqual(f.wire[index]?.tools, projected.tools);
    assert.deepEqual(f.wire[index]?.limits, projected.limits);
  }
  assert.equal(report.inputPreview?.estimatedInputTokens, port.preview(f.requests[1]!).estimatedInputTokens);
  assert.ok(typeof report.inputPreview!.estimatedInputTokens === "number" && report.inputPreview!.estimatedInputTokens <= 2048); assert.ok(Object.isFrozen(report.calls[0]));
  assert.equal(report.calls[0]!.candidateInvocationId, outcome.run.invocations[0]!.invocationId);
  assert.ok(tool.previews.length < 40); assert.ok(!JSON.stringify(report).includes(tool.executions[0]!.text));
});

test("whole batch reserves all minimum pages before execution and protects previous results", async (t) => {
  const tool = readTool(); const f = fixture(tool.tool, [[call("a"), call("b")], [call("c"), call("d")]], { budget: { tokenBudget: 2300 } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(tool.executions.length, 2); assert.equal(f.wire.length, 2); assert.equal(outcome.run.invocations.length, 2);
  assert.ok(outcome.run.invocations.every((item) => item.state.status === "succeeded"));
  assert.equal(f.reports.at(-1)?.status, "blocked"); assert.match(f.session.getSnapshot().message, /本组读取未执行/);
  assert.equal(f.requests[1]!.toolFeedback![0]!.calls.length, 2);
  assert.deepEqual(outcome.run.invocations.map((item) => item.input), [{ maxCharacters: 4096 }, { maxCharacters: 4096 }]);
});

test("minimum batch failure creates zero invocations and zero continuation", async (t) => {
  const tool = readTool("x"); const f = fixture(tool.tool, [[call("a"), call("b"), call("c"), call("d")]], { budget: { tokenBudget: 1024 } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(tool.executions.length, 0); assert.equal(outcome.run.invocations.length, 0); assert.equal(f.wire.length, 1);
  assert.equal(f.reports[0]?.status, "blocked"); assert.equal(f.session.getSnapshot().status, "failed");
});

test("Pi-capable providers receive one structured rejection and can recover with a smaller call", async () => {
  const tool = readTool("recovery");
  const registry = new AgentToolRegistry([tool.tool]);
  const requests: AgentProviderRequest[] = [];
  const provider = {
    capabilities: { rejectionFeedback: "v1" as const },
    async decide(request: AgentProviderRequest) {
      requests.push(request);
      if (requests.length === 1) return { kind: "tool-calls", calls: [{ callId: "too-large", capabilityId: "demo.read", contractVersion: 1, input: { maxCharacters: 4096 } }] };
      if (requests.length === 2) {
        assert.equal(request.toolFeedbackRejections?.length, 1);
        return { kind: "tool-calls", calls: [{ callId: "reduced", capabilityId: "demo.read", contractVersion: 1, input: { maxCharacters: 8 } }] };
      }
      return { kind: "finish", reason: "completed", text: "已读取" };
    },
  };
  const controller = new AgentRunController({
    provider,
    capabilities: registry,
    catalog: registry.catalog,
    readAdmission: { schemaVersion: 1, maxResultJsonBytes: 12288 },
    inputPreview: { preview(request) {
      const recovery = (request.toolFeedbackRejections?.length ?? 0) > 0;
      return { schemaVersion: 1, runId: request.runId, turnId: request.turnId,
        status: recovery ? "ready" : "budget-exceeded", estimator: "utf8-json-bytes-div3-v1",
        estimatedInputTokens: recovery ? 10 : 1001, inputTokenBudget: 1000,
        requestBytes: null, requestByteBudget: null };
    } },
    completionVerifier: ({ responseText, invocations }) => ({
      satisfied: responseText === "已读取" && invocations.every((item) => item.state.status === "succeeded"),
      reason: "fixture", evidence: invocations.map((item) => item.invocationId),
    }),
    now: () => 100,
    nextId: (() => { let index = 0; return (kind: string) => `${kind}-${++index}`; })(),
  });
  const outcome = await controller.run({
    runId: "rejection-run",
    workspace: { workspaceId: "workspace", documentId: null, documentVersion: null, selection: null },
    goal: "读取资料",
    intent: { kind: "read", requestedCapabilityIds: ["demo.read"], scope: "none" },
    policy: { policyVersion: 1, allowedCapabilityIds: ["demo.read"], allowedKinds: ["query"], maxToolsPerTurn: 1,
      maxCostClass: "constant", approvalMode: "disallow" },
    budget: { tokenBudget: 1000, itemCountBudget: 16, toolResultSizeBudget: 4096, rangeBudget: 0, historyTurnBudget: 4 },
    initialContextItems: [], maxTurns: 6,
  });
  assert.equal(outcome.response, "已读取");
  assert.equal(tool.executions.length, 1);
  assert.deepEqual(tool.executions[0]!.input, { maxCharacters: 8 });
  assert.equal(requests.length, 3);
  const rejection = requests[1]!.toolFeedbackRejections?.[0];
  assert.equal(rejection?.reason, "input-budget");
  assert.equal(rejection?.retryable, true);
  assert.equal(rejection?.calls[0]?.callId, "too-large");
  assert.equal(outcome.run.invocations.length, 1);
  const projected = projectPiInput(requests[1]!, model);
  const rejected = projected.history.filter((item) => item.role === "toolResult");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.role === "toolResult" && rejected[0].isError, true);
  assert.equal(outcome.run.state.lifecycle, "terminal");
});

test("rejection recovery is bounded and the DTO is strict and deeply frozen", async () => {
  const raw = {
    schemaVersion: 1 as const, runId: "run", turnId: "turn", nextTurnId: "next", status: "blocked" as const,
    reason: "input-budget" as const, retryable: true, recovery: "reduce-input" as const,
    calls: [{ callId: "same", capabilityId: "demo.read", contractVersion: 1, input: { nested: ["x"] } }],
  };
  const frozen = freezeAgentToolRejectionFeedbackV1(raw);
  assert.equal(isAgentToolRejectionFeedbackV1(frozen), true);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.calls[0]!.input), true);
  assert.equal(Object.isFrozen((frozen.calls[0]!.input as { nested: readonly string[] }).nested), true);
  assert.equal(isAgentToolRejectionFeedbackV1({ ...raw, extra: true }), false);
  assert.equal(isAgentToolRejectionFeedbackV1({ ...raw, retryable: false }), false);

  const tool = readTool("bounded"); const registry = new AgentToolRegistry([tool.tool]); const requests: AgentProviderRequest[] = [];
  const provider = { capabilities: { rejectionFeedback: "v1" as const }, async decide(request: AgentProviderRequest) {
    requests.push(request);
    return { kind: "tool-calls" as const, calls: [{ callId: requests.length === 1 ? "first" : "second", capabilityId: "demo.read", contractVersion: 1, input: { maxCharacters: 4096 } }] };
  } };
  const controller = new AgentRunController({ provider, capabilities: registry, catalog: registry.catalog,
    readAdmission: { schemaVersion: 1, maxResultJsonBytes: 12288 }, inputPreview: { preview(request) {
      return { schemaVersion: 1, runId: request.runId, turnId: request.turnId, status: "budget-exceeded" as const,
        estimator: "utf8-json-bytes-div3-v1" as const, estimatedInputTokens: 1001, inputTokenBudget: 1000,
        requestBytes: null, requestByteBudget: null };
    } }, completionVerifier: () => ({ satisfied: false, reason: "never", evidence: [] }),
  });
  const outcome = await controller.run({ runId: "bounded-run", workspace: { workspaceId: "workspace", documentId: null, documentVersion: null, selection: null },
    goal: "Read", intent: { kind: "read", requestedCapabilityIds: ["demo.read"], scope: "none" },
    policy: { policyVersion: 1, allowedCapabilityIds: ["demo.read"], allowedKinds: ["query"], maxToolsPerTurn: 1, maxCostClass: "constant", approvalMode: "disallow" },
    budget: { tokenBudget: 1000, itemCountBudget: 16, toolResultSizeBudget: 4096, rangeBudget: 0, historyTurnBudget: 4 }, initialContextItems: [], maxTurns: 6 });
  assert.equal(requests.length, 2);
  assert.equal(outcome.run.invocations.length, 0);
  assert.equal(outcome.run.state.lifecycle, "terminal");
  assert.equal(outcome.run.state.terminalReason, "failed");
  assert.equal(outcome.run.events.filter((event) => event.event.type === "tool.rejection-feedback").length, 1);
});

test("invalid whole decision and >4 calls are rejected before any body preview", async (t) => {
  const tool = readTool(); const f = fixture(tool.tool, [[...Array.from({ length: 5 }, (_, i) => call(String(i)))] ]);
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(outcome.run.invocations.length, 0); assert.equal(tool.previews.length, 0); assert.equal(tool.executions.length, 0);
});

test("missing provider or unsupported tool rejects the whole group without execute", async (t) => {
  for (const missing of ["provider", "tool", "side-effect"] as const) {
    const tool = readTool(); const { previewRead: _preview, ...unsupported } = tool.tool;
    const f = fixture(missing === "tool" ? unsupported : missing === "side-effect" ? { ...tool.tool, descriptor: { ...tool.tool.descriptor,
      sideEffects: { ...tool.tool.descriptor.sideEffects, document: "read" } } } : tool.tool, [[call("a")]], missing === "provider" ? { inputPreview: undefined } as unknown as Partial<AgentSessionOptions> : {});
    t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
    assert.equal(tool.executions.length, 0); assert.equal(outcome.run.invocations.length, 0); assert.equal(f.reports[0]?.status, "unsupported");
  }
});

test("preview execution mismatch preserves real completion and prevents continuation or retry", async (t) => {
  const tool = readTool("actual"); const f = fixture({ ...tool.tool, execute: async () => ({ text: "DIFFERENT REAL RESULT" }) }, [[call("a"), call("b")]]);
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(outcome.run.invocations.length, 1); assert.equal(outcome.run.invocations[0]!.result?.status, "completed");
  assert.deepEqual(outcome.run.invocations[0]!.result?.status === "completed" && outcome.run.invocations[0]!.result.data, { text: "DIFFERENT REAL RESULT" });
  assert.equal(f.wire.length, 1); assert.equal(f.reports.at(-1)?.reason, "preview-execution-mismatch");
});

test("observer cancellation before dispatch and between reads cannot publish stale admission or execute later calls", async (t) => {
  for (const phase of ["admission", "completed"] as const) {
    const tool = readTool("small"); let cancel: () => void = () => {};
    const f = fixture(tool.tool, [[call("a"), call("b")]], {
      onToolFeedbackAdmission() { if (phase === "admission") cancel(); else throw new Error("observer"); },
      onProgress(event) { if (phase === "completed" && event.type === "activity.completed" && event.activityId.startsWith("capability:")) cancel(); },
    }); cancel = () => { void f.session.cancel(); };
    t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
    assert.equal(tool.executions.length, phase === "admission" ? 0 : 1); assert.equal(f.wire.length, 1);
    assert.equal(outcome.run.state.lifecycle === "terminal" && outcome.run.state.terminalReason, "cancelled");
    assert.equal(f.session.getToolFeedbackAdmission(), null);
  }
});

test("External preview is local, reserves worst header bytes and uses the same Controller without v1 additions", async (t) => {
  const tool = readTool(); let idCalls = 0, clockCalls = 0;
  const hello = createFakeExternalHello(); hello.limits.maxRequestBytes = 5000;
  const transport = new FakeExternalAgentTransport({ hello, respond: (request) => createDecisionResponse(request, transport.requests.length === 1
    ? { kind: "tool-calls", calls: [{ callId: "external", capabilityId: "demo.read", contractVersion: 1, input: { maxCharacters: 4096 } }] }
    : { kind: "finish", reason: "completed", text: "Done" }) });
  const adapter = new ExternalAgentAdapter({ transport, pluginId: hello.plugin.id, pluginVersion: hello.plugin.version, pluginLabel: "External",
    createId: () => { ++idCalls; return `id-${idCalls}`; }, now: () => { ++clockCalls; return 10000; } }); await adapter.activate();
  const reports: ToolFeedbackAdmissionReportV1[] = [];
  const session = createAgentSession({ tools: new AgentToolRegistry([tool.tool]), provider: createAgentPluginProvider(adapter.plugin),
    readAdmission: { schemaVersion: 1, maxResultJsonBytes: 12288 }, inputPreview: adapter.inputPreview, onToolFeedbackAdmission: (r) => reports.push(r) });
  t.after(async () => { await session.dispose(); await adapter.dispose(); }); await session.setEnabled(true); await session.submit("Read");
  assert.equal(session.getSnapshot().status, "completed"); assert.equal(transport.requests.length, 2); assert.equal(tool.executions.length, 1);
  assert.equal(idCalls, 2); assert.equal(clockCalls, 4); assert.equal(transport.openCount, 1); assert.equal(transport.cancellations.length, 0);
  assert.equal(reports[0]?.inputPreview?.estimator, "external-host-projection-v1"); assert.ok(reports[0]!.inputPreview!.requestBytes! <= 5000);
  assert.ok(!Object.hasOwn(transport.requests[1]!, "toolFeedback")); assert.ok(!Object.hasOwn(transport.requests[1]!, "budget"));
  const before = { idCalls, clockCalls, requests: transport.requests.length, state: adapter.state };
  const item = transport.requests[1]!.context.items.find((v) => v.sourceType === "capability-result")!;
  assert.ok(item); assert.ok((item.content as { text: string }).text.length < 4096);
  assert.deepEqual({ idCalls, clockCalls, requests: transport.requests.length, state: adapter.state }, before);
});

test("strict admission report rejects extra fields, wrong identities, duplicate calls and false sizes", async () => {
  const tool = readTool("small"), f = fixture(tool.tool, [[call("a")]]);
  await f.session.setEnabled(true); await f.session.submit("Read"); const r = f.reports[0]!;
  assert.ok(isToolFeedbackAdmissionReportV1(r));
  for (const invalid of [{ ...r, text: "leak" }, { ...r, inputPreview: { ...r.inputPreview, turnId: "wrong" } },
    { ...r, calls: [r.calls[0], r.calls[0]] }, { ...r, calls: [{ ...r.calls[0], previewResultJsonBytes: 999999 }] },
    { ...r, inputPreview: { ...r.inputPreview, estimatedInputTokens: -1 } }]) assert.equal(isToolFeedbackAdmissionReportV1(invalid), false);
  assert.ok(isAgentInputPreviewV1(r.inputPreview));
  await f.session.reset(); assert.equal(f.session.getToolFeedbackAdmission(), null); await f.session.dispose();
});

test("allocation drops optional host context once while preserving both latest full conversation pairs", async (t) => {
  const tool = readTool(); const f = fixture(tool.tool, Array.from({ length: 4 }, (_, i) => i === 3 ? [call("read")] : [{ type: "text" as const, text: "Done" }]), { budget: { tokenBudget: 2600 },
    contextItems: () => [{ contextItemId: "optional", kind: "task-history", content: { text: "optional sentinel".repeat(800) },
      sourceType: "host", sourceId: "optional", documentId: null, documentVersion: null, scope: "none", trustLevel: "untrusted",
      priority: "normal", createdAt: 1, expiresAt: null, estimatedTokens: 1 }] });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true);
  for (const text of ["oldest", "required recent first", "required recent second", "Read"]) await f.session.submit(text);
  const next = f.requests.at(-1)!;
  assert.equal(f.session.getSnapshot().status, "completed"); assert.equal(tool.executions.length, 1);
  assert.ok(!JSON.stringify(f.wire.at(-1)).includes("optional sentinel"));
  for (const required of ["required recent first", "required recent second"]) assert.ok(JSON.stringify(f.wire.at(-1)).includes(required));
  assert.equal(next.contextSelection?.report.selected.filter((item) => item.reason === "recent-conversation").length, 2);
  assert.ok(next.contextSelection?.report.omitted.some((item) => item.contextItemId === "optional"));
  assert.equal(next.toolFeedback![0]!.calls.length, 1);
});

test("required context count and invalid preview block before invocation with distinct reasons", async (t) => {
  const tool = readTool("small");
  const f = fixture(tool.tool, [[call("a"), call("b")]], { budget: { itemCountBudget: 4 } });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(outcome.run.invocations.length, 0); assert.equal(f.reports[0]?.reason, "context-budget");
  for (const preview of [() => { throw new Error("private exception"); }, (r: AgentProviderRequest) => ({ ...port.preview(r), turnId: "wrong" })]) {
    const bad = fixture(tool.tool, [[call("a")]], { inputPreview: { preview } }); t.after(() => bad.session.dispose());
    await bad.session.setEnabled(true); await bad.session.submit("Read");
    assert.equal(bad.reports[0]?.reason, "invalid-preview"); assert.equal(bad.wire.length, 1);
    assert.ok(!JSON.stringify(bad.reports[0]).includes("private exception"));
  }
  assert.equal(tool.executions.length, 0);
});

test("batch authorization preflight rejects a later missing resource before any full candidate", async (t) => {
  const tool = readTool("small"); const full: number[] = [];
  const f = fixture({ ...tool.tool, previewRead(input, context) {
    if ((input as { maxCharacters: number }).maxCharacters === 1) throw new Error("wrong session resource");
    if (context.resultLimit.maxResultJsonBytes > 1) full.push(context.resultLimit.maxResultJsonBytes);
    return tool.tool.previewRead!(input, context);
  } }, [[call("a"), { type: "tool-call", callId: "b", name: "demo.read", arguments: { maxCharacters: 1 } }]]);
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.deepEqual(full, []); assert.equal(tool.executions.length, 0); assert.equal(outcome.run.invocations.length, 0);
});

test("selected expiration during a read invalidates continuation and preserves completed truth", async (t) => {
  const tool = readTool("small"); const expiresAt = Date.now() + 150;
  const f = fixture({ ...tool.tool, execute: async (input, context) => {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiresAt - Date.now()) + 10));
    return tool.tool.execute(input, context);
  } }, [[call("a")]], { contextItems: () => [{ contextItemId: "required", kind: "authoritative-fact", content: { text: "required snapshot" },
    sourceType: "host", sourceId: "required", documentId: null, documentVersion: null, scope: "none", trustLevel: "authoritative",
    priority: "required", createdAt: 1, expiresAt, estimatedTokens: 10 }] });
  t.after(() => f.session.dispose()); await f.session.setEnabled(true); const outcome = await f.session.submit("Read");
  assert.equal(f.wire.length, 1); assert.equal(tool.executions.length, 1);
  assert.equal(outcome.run.invocations[0]!.result?.status, "completed"); assert.equal(f.reports.at(-1)?.reason, "invalid-preview");
});

test("External pure preview classifies string/depth/bytes/count limits and reserves escaped UTF16 headers", async (t) => {
  const tool = readTool("small"), f = fixture(tool.tool, [[call("a")]]); t.after(() => f.session.dispose());
  await f.session.setEnabled(true); await f.session.submit("Read"); const request = f.requests[1]!;
  const limits = { maxRequestBytes: EXTERNAL_AGENT_PROTOCOL_LIMITS.maxMessageBytes, maxResponseBytes: 65536, maxContextItems: 128, maxToolCalls: 4 };
  const preview = previewExternalInput(request, "external", limits); assert.equal(preview.status, "ready");
  const wire = projectTurnRequest(request, "external", "9999-12-31T23:59:59.999Z", "\ud800".repeat(256), limits);
  assert.equal(preview.requestBytes, Buffer.byteLength(JSON.stringify(wire)));
  assert.equal(previewExternalInput(request, "external", { ...limits, maxRequestBytes: 100 }).status, "input-limit-exceeded");
  assert.equal(previewExternalInput(request, "external", { ...limits, maxContextItems: 1 }).status, "input-limit-exceeded");
  let nested: unknown = "leaf"; for (let i = 0; i < 20; ++i) nested = { nested };
  for (const content of [{ text: "a".repeat(8193) }, nested, Array.from({ length: 1025 }, () => 1)]) {
    const modified = { ...request, context: { ...request.context, contextItems: request.context.contextItems.map((item, i) => i === 0 ? { ...item, content } : item) } };
    const invalid = previewExternalInput(modified, "external", limits);
    assert.equal(invalid.status, "input-limit-exceeded"); assert.equal(invalid.estimatedInputTokens, null); assert.ok(isAgentInputPreviewV1(invalid));
  }
  const invalid = { ...request, context: { ...request.context, contextItems: request.context.contextItems.map((item, i) => i === 0 ? { ...item, content: undefined } : item) } };
  assert.equal(previewExternalInput(invalid, "external", limits).status, "invalid-input");
});

test("direct Controller consumers also receive the four-call admission ceiling", async () => {
  const tool = readTool("small"), registry = new AgentToolRegistry([tool.tool]);
  const controller = new AgentRunController({ capabilities: registry, catalog: registry.catalog,
    readAdmission: { schemaVersion: 1, maxResultJsonBytes: 12288 }, inputPreview: port,
    provider: { async decide(request) {
      assert.equal(request.toolset.maxCalls, 4);
      return { kind: "tool-calls", calls: Array.from({ length: 5 }, (_, i) => ({ callId: String(i), capabilityId: "demo.read", contractVersion: 1, input: { maxCharacters: 1 } })) };
    } }, completionVerifier: () => ({ satisfied: true, reason: "fixture", evidence: [] }) });
  const outcome = await controller.run({ runId: "direct", workspace: { workspaceId: "workspace", documentId: null, documentVersion: null, selection: null }, goal: "Read",
    policy: { policyVersion: 1, allowedCapabilityIds: ["demo.read"], allowedKinds: ["query"], maxToolsPerTurn: 16, maxCostClass: "constant", approvalMode: "disallow" },
    intent: { kind: "read", requestedCapabilityIds: ["demo.read"], scope: "none" }, maxTurns: 2, initialContextItems: [],
    budget: { tokenBudget: 8192, itemCountBudget: 64, historyTurnBudget: 16, rangeBudget: 0, toolResultSizeBudget: 16384 } });
  assert.equal(outcome.run.invocations.length, 0); assert.equal(tool.previews.length, 0);
});
