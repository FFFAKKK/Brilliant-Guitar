import assert from "node:assert/strict";
import test from "node:test";
import { ExternalAgentAdapter, type ExternalAgentTransportPort } from "../src/agent/external-agent-adapter.ts";
import { FakeExternalAgentTransport, createFakeExternalHello } from "../src/agent/external-agent-fake-transport.ts";
import { createDecisionResponse } from "../src/agent/external-agent-projection.ts";
import type { ExternalAgentTurnRequestV1 } from "../src/agent/external-protocol-v1.ts";
import { decodeExternalMessage, encodeExternalMessage, ExternalAgentProtocolError } from "../src/agent/external-protocol-v1-validator.ts";
import { createAgentPluginProvider } from "../src/agent/agent-plugin-contract.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";
import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import { policy, providerRequest } from "./external-agent-fixture.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function options(transport: ExternalAgentTransportPort, timeoutMs = 200) {
  return { pluginId: "example.external.agent", pluginVersion: "1.0.0", pluginLabel: "Example External Agent", transport, timeoutMs,
    createId: () => "request", now: () => Date.parse("2026-10-07T00:00:00.000Z") };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof ExternalAgentProtocolError && error.code === code;
}

function response(request: ExternalAgentTurnRequestV1, text = "ok"): string {
  return encodeExternalMessage(createDecisionResponse(request, { kind: "message", text }));
}

function manualTransport() {
  const calls: { request: ExternalAgentTurnRequestV1; result: ReturnType<typeof deferred<string>> }[] = [];
  const cancels: string[] = [];
  const transport: ExternalAgentTransportPort = {
    open: async () => encodeExternalMessage(createFakeExternalHello()),
    request: async (wire) => {
      const request = decodeExternalMessage(wire);
      assert.equal(request.messageType, "turn.request");
      if (request.messageType !== "turn.request") throw new Error("unexpected request");
      const result = deferred<string>();
      calls.push({ request, result });
      return result.promise; // Deliberately ignores AbortSignal.
    },
    cancel: async (wire) => { cancels.push(wire); },
    close: async () => {},
  };
  return { calls, cancels, transport };
}

async function flush() { await new Promise<void>((resolve) => setImmediate(resolve)); }

test("construction and plugin access send nothing until explicit activation", async () => {
  const transport = new FakeExternalAgentTransport({ respond: (request) => createDecisionResponse(request, { kind: "message", text: "ok" }) });
  const adapter = new ExternalAgentAdapter(options(transport));
  assert.equal(adapter.plugin, adapter.plugin);
  assert.equal(adapter.state, "discovered");
  assert.equal(transport.openCount, 0);
  await assert.rejects(adapter.decide(providerRequest), hasCode("plugin-unavailable"));
  assert.equal(transport.requests.length, 0);
  await adapter.activate();
  assert.equal(adapter.state, "ready");
  assert.deepEqual(await createAgentPluginProvider(adapter.plugin).decide(providerRequest), { kind: "message", text: "ok" });
  assert.equal(transport.requests.length, 1);
  await adapter.deactivate();
  assert.equal(adapter.state, "inactive");
  await adapter.activate();
  assert.equal(adapter.state, "ready");
  await adapter.dispose();
  assert.equal(adapter.state, "disposed");
  await assert.rejects(adapter.activate(), hasCode("plugin-unavailable"));
});

test("activation rejects no common version and plugin identity drift", async () => {
  for (const hello of [
    { ...createFakeExternalHello(), protocol: { supportedVersions: [2] } },
    { ...createFakeExternalHello(), plugin: { id: "wrong.agent", version: "1.0.0", label: "Wrong" } },
  ]) {
    const adapter = new ExternalAgentAdapter(options(new FakeExternalAgentTransport({ hello, respond: () => null })));
    await assert.rejects(adapter.activate(), hasCode(hello.protocol.supportedVersions[0] === 2 ? "version-unsupported" : "protocol-invalid"));
    assert.equal(adapter.state, "failed");
  }
});

test("handshake also has a host deadline and ignores late readiness after disposal", async () => {
  const opening = deferred<string>();
  const adapter = new ExternalAgentAdapter(options({ ...manualTransport().transport, open: async () => opening.promise }, 10));
  await assert.rejects(adapter.activate(), hasCode("plugin-timeout"));
  assert.equal(adapter.state, "failed");
  await adapter.dispose();
  opening.resolve(encodeExternalMessage(createFakeExternalHello()));
  await flush();
  assert.equal(adapter.state, "disposed");
});

test("deactivation interrupts pending activation without re-publishing ready", async () => {
  const opening = deferred<string>();
  const adapter = new ExternalAgentAdapter(options({ ...manualTransport().transport, open: async () => opening.promise }));
  const activation = assert.rejects(adapter.activate(), hasCode("plugin-cancelled"));
  await adapter.deactivate();
  await activation;
  opening.resolve(encodeExternalMessage(createFakeExternalHello()));
  await flush();
  assert.equal(adapter.state, "inactive");
});

test("negotiated request/response byte limits and context counts are enforced", async () => {
  const hello = createFakeExternalHello();
  for (const limits of [
    { ...hello.limits, maxRequestBytes: 1 }, { ...hello.limits, maxResponseBytes: 1 },
  ]) {
    const transport = new FakeExternalAgentTransport({ hello: { ...hello, limits }, respond: (request) => createDecisionResponse(request, { kind: "message", text: "ok" }) });
    const adapter = new ExternalAgentAdapter(options(transport));
    await adapter.activate();
    await assert.rejects(adapter.decide(providerRequest), hasCode("protocol-invalid"));
    assert.equal(transport.requests.length, limits.maxRequestBytes === 1 ? 0 : 1);
    assert.equal(adapter.state, "failed");
  }
  const transport = new FakeExternalAgentTransport({ hello: { ...hello, limits: { ...hello.limits, maxContextItems: 1 } }, respond: () => null });
  const adapter = new ExternalAgentAdapter(options(transport));
  await adapter.activate();
  await assert.rejects(adapter.decide({ ...providerRequest, context: { ...providerRequest.context, contextItems: [
    ...providerRequest.context.contextItems, { ...providerRequest.context.contextItems[0]!, contextItemId: "second" },
  ] } }), hasCode("protocol-invalid"));
  assert.equal(transport.requests.length, 0);
});

test("cancel settles locally even when peer ignores abort and cancel acknowledgement", async () => {
  const manual = manualTransport();
  manual.transport.cancel = async (wire) => { manual.cancels.push(wire); await new Promise<void>(() => {}); };
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const running = assert.rejects(adapter.decide(providerRequest), hasCode("plugin-cancelled"));
  await flush();
  await adapter.cancel();
  await running;
  assert.equal(adapter.state, "ready");
  assert.equal(manual.cancels.length, 1);
  assert.equal(decodeExternalMessage(manual.cancels[0]).messageType, "turn.cancel");
  const next = adapter.decide({ ...providerRequest, turnId: "turn-2" });
  await flush();
  assert.notEqual(manual.calls[0]?.request.requestId, manual.calls[1]?.request.requestId);
  manual.calls[0]!.result.resolve(response(manual.calls[0]!.request, "stale"));
  await flush();
  assert.equal(adapter.state, "deciding");
  manual.calls[1]!.result.resolve(response(manual.calls[1]!.request, "fresh"));
  assert.deepEqual(await next, { kind: "message", text: "fresh" });
});

test("AbortSignal cancellation is prompt without a cooperative transport", async () => {
  const manual = manualTransport();
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const signal = new AbortController();
  const running = assert.rejects(adapter.decide(providerRequest, signal.signal), hasCode("plugin-cancelled"));
  await flush();
  signal.abort();
  await running;
  assert.equal(adapter.state, "ready");
  assert.equal(manual.cancels.length, 1);
  const sent = manual.calls.length;
  await assert.rejects(adapter.decide(providerRequest, signal.signal), hasCode("plugin-cancelled"));
  assert.equal(manual.calls.length, sent);
});

test("cancellation before dispatch does not start an external turn", async () => {
  const manual = manualTransport();
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const signal = new AbortController();
  const running = assert.rejects(adapter.decide(providerRequest, signal.signal), hasCode("plugin-cancelled"));
  signal.abort();
  await running;
  assert.equal(manual.calls.length, 0);
});

test("call budgets intersect the peer limit with the current Controller turn", async () => {
  const hello = createFakeExternalHello();
  const transport = new FakeExternalAgentTransport({ hello: { ...hello, limits: { ...hello.limits, maxToolCalls: 1 } },
    respond: (request) => ({ schemaVersion: 1, messageType: "turn.response", requestId: request.requestId,
      runId: request.runId, turnId: request.turnId, result: { kind: "decision", decision: { kind: "tool-calls", calls: [
        { callId: "one", capabilityId: "score.read-summary", contractVersion: 1, input: {} },
        { callId: "two", capabilityId: "score.read-summary", contractVersion: 1, input: {} },
      ] } } }) });
  const adapter = new ExternalAgentAdapter(options(transport));
  await adapter.activate();
  await assert.rejects(adapter.decide({ ...providerRequest, toolset: { ...providerRequest.toolset, maxCalls: 2 } }), hasCode("decision-invalid"));
  assert.equal(transport.requests[0]?.maxToolCalls, 1);
});

test("disposal waits for concurrent deactivation and the closed state cannot revive", async () => {
  const closing = deferred<void>();
  let closes = 0;
  const adapter = new ExternalAgentAdapter(options({ ...manualTransport().transport,
    close: async () => { closes += 1; await closing.promise; } }));
  await adapter.activate();
  const deactivation = adapter.deactivate();
  const disposal = adapter.dispose();
  const again = adapter.dispose();
  assert.equal(again, disposal);
  assert.equal(adapter.state, "deactivating");
  await assert.rejects(adapter.activate(), hasCode("plugin-unavailable"));
  closing.resolve();
  await Promise.all([deactivation, disposal]);
  assert.equal(closes, 1);
  assert.equal(adapter.state, "disposed");
});

test("unresponsive shutdown is bounded and still finishes disposal locally", async () => {
  const adapter = new ExternalAgentAdapter(options({ ...manualTransport().transport,
    close: async () => new Promise<void>(() => {}) }, 10));
  await adapter.activate();
  await assert.rejects(adapter.dispose(), hasCode("plugin-timeout"));
  assert.equal(adapter.state, "disposed");
});

test("transport failures expose safe stable diagnostics", async () => {
  const adapter = new ExternalAgentAdapter(options({ ...manualTransport().transport,
    request: async () => { throw new Error("arbitrary private infrastructure detail"); } }));
  await adapter.activate();
  await assert.rejects(adapter.decide(providerRequest), (error: unknown) => error instanceof ExternalAgentProtocolError
    && error.code === "plugin-unavailable" && error.retryable && error.requestId !== null
    && !error.message.includes("private"));
});

test("timeout keeps its stable error code for cooperative and uncooperative transports", async () => {
  for (const ignoreAbort of [true, false]) {
    const transport = new FakeExternalAgentTransport({ delayMs: 30, ignoreAbort,
      respond: (request) => createDecisionResponse(request, { kind: "message", text: "late" }) });
    const adapter = new ExternalAgentAdapter(options(transport, 10));
    await adapter.activate();
    await assert.rejects(adapter.decide(providerRequest), hasCode("plugin-timeout"));
    assert.equal(adapter.state, "ready");
    assert.equal(transport.cancellations[0]?.reason, "timeout");
  }
});

test("unsupported remote cancellation still invalidates requests locally", async () => {
  const hello = createFakeExternalHello();
  const transport = new FakeExternalAgentTransport({ hello: { ...hello, features: { ...hello.features, cancellation: false } },
    delayMs: 30, ignoreAbort: true, respond: (request) => createDecisionResponse(request, { kind: "message", text: "late" }) });
  const adapter = new ExternalAgentAdapter(options(transport, 10));
  await adapter.activate();
  await assert.rejects(adapter.decide(providerRequest), hasCode("plugin-timeout"));
  assert.equal(transport.cancellations.length, 0);
});

test("responses arriving after absolute deadline cannot become decisions", async () => {
  let now = Date.parse("2026-10-07T00:00:00.000Z");
  const transport = new FakeExternalAgentTransport({ respond: (request) => { now += 300; return createDecisionResponse(request, { kind: "message", text: "late" }); } });
  const adapter = new ExternalAgentAdapter({ ...options(transport), now: () => now });
  await adapter.activate();
  await assert.rejects(adapter.decide(providerRequest), hasCode("plugin-timeout"));
  assert.equal(transport.cancellations[0]?.reason, "timeout");
});

test("only one final reply is accepted and mismatched replies never affect another turn", async () => {
  const manual = manualTransport();
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const first = adapter.decide(providerRequest);
  await flush();
  await assert.rejects(adapter.decide(providerRequest), hasCode("plugin-unavailable"));
  manual.calls[0]!.result.resolve(response(manual.calls[0]!.request, "first"));
  manual.calls[0]!.result.resolve(response(manual.calls[0]!.request, "duplicate"));
  assert.deepEqual(await first, { kind: "message", text: "first" });
  const second = assert.rejects(adapter.decide({ ...providerRequest, turnId: "turn-2" }), hasCode("protocol-invalid"));
  await flush();
  manual.calls[1]!.result.resolve(response(manual.calls[0]!.request, "stale"));
  await second;
  assert.equal(adapter.state, "failed");
});

test("request projection errors leave no dangling deciding state and require no transport", async () => {
  const transport = new FakeExternalAgentTransport({ respond: () => null });
  const adapter = new ExternalAgentAdapter(options(transport));
  await adapter.activate();
  await assert.rejects(adapter.decide({ ...providerRequest, goal: "x".repeat(9000) }), hasCode("protocol-invalid"));
  assert.equal(adapter.state, "failed");
  assert.equal(transport.requests.length, 0);
  for (const timeoutMs of [0, -1, 1.5, Infinity, 999999999]) {
    assert.throws(() => new ExternalAgentAdapter({ ...options(transport), timeoutMs }), hasCode("protocol-invalid"));
  }
});

test("deactivation closes locally and rejects late results without reviving disposed state", async () => {
  const manual = manualTransport();
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const running = assert.rejects(adapter.decide(providerRequest), hasCode("plugin-cancelled"));
  await flush();
  await adapter.dispose();
  await running;
  manual.calls[0]!.result.resolve(response(manual.calls[0]!.request));
  await flush();
  assert.equal(adapter.state, "disposed");
  const cancel = decodeExternalMessage(manual.cancels[0]);
  assert.equal(cancel.messageType === "turn.cancel" && cancel.reason, "runtime-shutdown");
});

const controllerRequest = {
  runId: "run-external-controller",
  workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 7, selection: null },
  goal: "告诉我当前乐谱有多少小节",
  intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
  policy,
  budget: { tokenBudget: 400, itemCountBudget: 16, toolResultSizeBudget: 4096, rangeBudget: 32, historyTurnBudget: 4 },
  initialContextItems: [], maxTurns: 4,
} as const;

function controller(adapter: ExternalAgentAdapter, received: CapabilityTransportRequest[]) {
  let sequence = 0;
  return new AgentRunController({
    provider: createAgentPluginProvider(adapter.plugin),
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(request) {
        received.push(request);
        return { status: "completed", invocationId: request.invocationId, capabilityId: request.capabilityId,
          contractVersion: request.contractVersion, data: { documentId: "score-1", documentVersion: 7, title: "测试乐谱", measureCount: 12 } };
      },
    }),
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100, nextId: (kind) => `${kind}-${++sequence}`,
  });
}

test("external JSON Agent drives one real Controller capability loop and receives authoritative feedback", async () => {
  let turn = 0;
  const transport = new FakeExternalAgentTransport({ respond: (request) => {
    turn += 1;
    return createDecisionResponse(request, turn === 1
      ? { kind: "tool-calls", calls: [{ callId: "read-summary", capabilityId: "score.read-summary", contractVersion: 1, input: {} }] }
      : { kind: "finish", reason: "completed", text: "当前乐谱共有 12 小节。" });
  } });
  const adapter = new ExternalAgentAdapter(options(transport));
  await adapter.activate();
  const received: CapabilityTransportRequest[] = [];
  const outcome = await controller(adapter, received).run(controllerRequest);
  assert.equal(outcome.response, "当前乐谱共有 12 小节。");
  assert.equal(outcome.verification?.satisfied, true);
  assert.equal(received.length, 1);
  assert.equal(transport.requests.length, 2);
  assert.equal(transport.requests[1]?.context.items.some((item) => item.sourceId === "score.read-summary"), true);
  assert.equal("pluginId" in received[0]!, false);
});

for (const scenario of ["unknown-tool", "wrong-contract", "invalid-input", "duplicate-call", "forged-cancel", "plugin-error", "malformed-json"] as const) {
  test(`Controller dispatches zero capabilities for external ${scenario}`, async () => {
    const transport = new FakeExternalAgentTransport({ respond: (request) => {
      if (scenario === "malformed-json") return "{bad-json}";
      const call = { callId: "call", capabilityId: scenario === "unknown-tool" ? "score.guessed" : "score.read-summary",
        contractVersion: scenario === "wrong-contract" ? 2 : 1, input: scenario === "invalid-input" ? { extra: true } : {} };
      return { schemaVersion: 1, messageType: "turn.response", requestId: request.requestId, runId: request.runId, turnId: request.turnId,
        result: scenario === "plugin-error" ? { kind: "error", error: { code: "plugin-rejected", message: "refused", retryable: true } }
          : { kind: "decision", decision: scenario === "forged-cancel" ? { kind: "finish", reason: "cancelled", text: null }
            : { kind: "tool-calls", calls: scenario === "duplicate-call" ? [call, call] : [call] } } };
    } });
    const adapter = new ExternalAgentAdapter(options(transport));
    await adapter.activate();
    const received: CapabilityTransportRequest[] = [];
    const outcome = await controller(adapter, received).run(controllerRequest);
    assert.equal(received.length, 0);
    assert.deepEqual(outcome.run.state, { lifecycle: "terminal", phase: "planning", terminalReason: "failed",
      failureCode: scenario === "invalid-input" ? "invalid-decision" : "provider-failed" });
    assert.equal(transport.requests.length, 1); // Never automatically retried.
  });
}

test("peer error retry hints cannot permit automatic retries or fabricate local cancellation", async () => {
  const transport = new FakeExternalAgentTransport({ respond: (request) => ({ schemaVersion: 1, messageType: "turn.response",
    requestId: request.requestId, runId: request.runId, turnId: request.turnId,
    result: { kind: "error", error: { code: "plugin-cancelled", message: "peer cancelled", retryable: true } } }) });
  const adapter = new ExternalAgentAdapter(options(transport));
  await adapter.activate();
  await assert.rejects(adapter.decide(providerRequest), (error: unknown) => error instanceof ExternalAgentProtocolError
    && error.code === "plugin-cancelled" && error.retryable === false && error.requestId !== null);
  assert.equal(transport.requests.length, 1);
});

test("real Controller user cancellation stays separate from provider failure", async () => {
  const manual = manualTransport();
  const adapter = new ExternalAgentAdapter(options(manual.transport));
  await adapter.activate();
  const signal = new AbortController();
  const received: CapabilityTransportRequest[] = [];
  const running = controller(adapter, received).run(controllerRequest, signal.signal);
  await flush();
  signal.abort();
  const outcome = await running;
  assert.equal(received.length, 0);
  assert.notEqual(outcome.run.state.lifecycle === "terminal" && outcome.run.state.terminalReason === "failed", true);
  assert.equal(manual.cancels.length, 1);
});
