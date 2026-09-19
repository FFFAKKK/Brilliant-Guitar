import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_PROVIDER_DESCRIPTOR,
  OpenAiAgentProvider,
  OpenAiProviderSession,
} from "../src/agent/openai-provider.ts";
import type { AgentProviderHostPort } from "../src/agent/provider-host.ts";
import type { AgentProviderRequest } from "../src/agent/provider.ts";
import {
  createAgentProviderDecideRequestV1,
  isAgentProviderDecisionEnvelopeV1,
  isAgentProviderStreamEventV1,
} from "../src/contracts/agent-provider-turn.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";

const providerRequest: AgentProviderRequest = {
  runId: "run-1",
  turnId: "turn-1",
  goal: "读取当前乐谱概要",
  runState: { lifecycle: "active", phase: "planning" },
  context: {
    contextItems: [{
      contextItemId: "private-storage-id",
      kind: "authoritative-fact",
      content: { title: "练习曲" },
      sourceType: "score-summary",
      sourceId: "score.read-summary",
      documentId: "score-1",
      documentVersion: 3,
      scope: "document",
      trustLevel: "authoritative",
      priority: "high",
      createdAt: 123,
      expiresAt: 456,
      estimatedTokens: 20,
    }],
    omittedItems: [{ contextItemId: "omitted-private-id", reason: "token-budget" }],
    versionWarnings: [],
    budget: { estimatedTokens: 20, itemCount: 1, tokenBudget: 400, itemCountBudget: 16, exceeded: false },
  },
  toolset: {
    snapshotId: "snapshot-private-id",
    policyVersion: 1,
    toolsetHash: "hash-private-id",
    capabilityIds: ["score.read-summary"],
    toolDescriptors: [{
      id: "score.read-summary",
      contractVersion: 1,
      name: "读取乐谱概要",
      description: "读取当前乐谱的标题和小节数量。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSummary: "ScoreSummaryV1",
      preconditions: ["当前工作区已打开乐谱"],
      sideEffects: { document: "read", filesystem: "none", network: "none", settings: "none", playback: "none" },
      scopeLimit: "document",
      requiresApproval: false,
      costClass: "constant",
      failureModes: ["document-not-open"],
    }],
    maxCalls: 4,
  },
};

test("Provider transport projects only the data required for one decision", () => {
  const projected = createAgentProviderDecideRequestV1("openai", "gpt-5.4-mini", providerRequest);
  const serialized = JSON.stringify(projected);

  assert.equal(projected.schemaVersion, 1);
  assert.equal(projected.contextItems[0]?.sourceId, "score.read-summary");
  assert.equal(projected.tools[0]?.id, "score.read-summary");
  assert.equal(serialized.includes("private-storage-id"), false);
  assert.equal(serialized.includes("omitted-private-id"), false);
  assert.equal(serialized.includes("snapshot-private-id"), false);
  assert.equal(serialized.includes("hash-private-id"), false);
  assert.equal(serialized.includes("createdAt"), false);
  assert.equal(serialized.includes("estimatedTokens"), false);
});

test("Provider response envelope rejects extra fields and impossible usage", () => {
  const valid = {
    schemaVersion: 1,
    providerId: "openai",
    modelId: "gpt-5.4-mini",
    providerRequestId: "resp-1",
    decision: { kind: "message", text: "完成" },
    usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
  };
  assert.equal(isAgentProviderDecisionEnvelopeV1(valid), true);
  assert.equal(isAgentProviderDecisionEnvelopeV1({ ...valid, secret: "leak" }), false);
  assert.equal(isAgentProviderDecisionEnvelopeV1({
    ...valid, usage: { inputTokens: 20, outputTokens: 5, totalTokens: 10 },
  }), false);
});

test("Provider stream contract accepts only identity-bound semantic events", () => {
  assert.equal(isAgentProviderStreamEventV1({
    type: "response.text-delta",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 2,
    delta: "完成",
  }), true);
  assert.equal(isAgentProviderStreamEventV1({
    type: "response.usage",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 3,
    inputTokens: 20,
    outputTokens: 5,
    totalTokens: 24,
  }), false);
  assert.equal(isAgentProviderStreamEventV1({
    type: "response.tool-input-delta",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 3,
    callId: "call-1",
    delta: "{}",
    secret: "leak",
  }), false);
});

test("OpenAI adapter returns only the candidate decision from the host envelope", async () => {
  const received: unknown[] = [];
  const progress: unknown[] = [];
  const host: AgentProviderHostPort = {
    async readAgentProviderCredentialStatus(providerId) {
      return { providerId, present: true, status: "configured", message: "configured" };
    },
    async decideAgentProvider(request, _signal, observer) {
      received.push(request);
      observer?.({ type: "response.started", runId: request.runId, turnId: request.turnId, sequence: 1 });
      observer?.({ type: "response.text-delta", runId: request.runId, turnId: request.turnId,
        sequence: 2, delta: "完成" });
      observer?.({ type: "response.completed", runId: request.runId, turnId: request.turnId, sequence: 3 });
      return {
        schemaVersion: 1,
        providerId: request.providerId,
        modelId: request.modelId,
        providerRequestId: "resp-1",
        decision: { kind: "tool-calls", calls: [] },
        usage: null,
      };
    },
  };
  const adapter = new OpenAiAgentProvider(host, "gpt-5.4-mini");

  assert.deepEqual(await adapter.decide(providerRequest, null, (event) => progress.push(event)),
    { kind: "tool-calls", calls: [] });
  assert.equal(received.length, 1);
  assert.deepEqual(progress.map((event) => (event as { type: string }).type), [
    "response.started", "response.text-delta", "response.completed",
  ]);
});

test("OpenAI session becomes ready only after a configured credential is observed", async () => {
  let configured = false;
  const host: AgentProviderHostPort = {
    async readAgentProviderCredentialStatus(providerId) {
      return configured
        ? { providerId, present: true, status: "configured", message: "configured" }
        : { providerId, present: false, status: "missing", message: "missing" };
    },
    async decideAgentProvider() { throw new Error("unused"); },
  };
  const session = new OpenAiProviderSession(host, { providerId: "openai", modelId: "gpt-5.4-mini" });

  await session.refresh();
  assert.equal(session.getSnapshot().status, "authentication-required");
  assert.equal(session.getProvider(), null);

  configured = true;
  await session.refresh();
  assert.equal(session.getSnapshot().status, "ready");
  assert.notEqual(session.getProvider(), null);
  assert.equal(OPENAI_PROVIDER_DESCRIPTOR.models[0]?.id, "gpt-5.4-mini");
});

test("Tauri Provider bridge forwards AbortSignal cancellation to the exact run turn", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  let rejectDecision: ((reason?: unknown) => void) | null = null;
  const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_agent_provider_decide_v1") {
      return new Promise<T>((_resolve, reject) => { rejectDecision = reject; });
    }
    if (command === "workbench_agent_provider_cancel_v1") {
      rejectDecision?.({ message: "模型 Provider 请求已取消", status: 499 });
      return Promise.resolve(true as T);
    }
    return Promise.reject(new Error("unexpected command"));
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(
    invoke,
    undefined,
    () => ({ onmessage: () => undefined }),
  ));
  const request = createAgentProviderDecideRequestV1("openai", "gpt-5.4-mini", providerRequest);
  const cancellation = new AbortController();
  const decision = client.decideAgentProvider(request, cancellation.signal);
  const rejected = assert.rejects(decision, /模型 Provider 请求已取消/);

  cancellation.abort();
  await rejected;
  assert.deepEqual(calls.map((call) => call.command), [
    "workbench_agent_provider_decide_v1",
    "workbench_agent_provider_cancel_v1",
  ]);
  assert.deepEqual(calls[1]?.args, { runId: "run-1", turnId: "turn-1" });
});

test("Tauri Provider bridge forwards ordered Channel progress before the final envelope", async () => {
  const channel = { onmessage: (_event: unknown) => undefined };
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    assert.equal(command, "workbench_agent_provider_decide_v1");
    assert.equal(args?.progress, channel);
    channel.onmessage({ type: "response.started", runId: "run-1", turnId: "turn-1", sequence: 1 });
    channel.onmessage({ type: "response.text-delta", runId: "run-1", turnId: "turn-1",
      sequence: 2, delta: "完成" });
    channel.onmessage({ type: "response.completed", runId: "run-1", turnId: "turn-1", sequence: 3 });
    return {
      schemaVersion: 1,
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      providerRequestId: "resp-1",
      decision: { kind: "message", text: "完成" },
      usage: null,
    } as T;
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(
    invoke,
    undefined,
    () => channel,
  ));
  const request = createAgentProviderDecideRequestV1("openai", "gpt-5.4-mini", providerRequest);
  const progress: string[] = [];

  await client.decideAgentProvider(request, null, (event) => progress.push(event.type));

  assert.deepEqual(progress, ["response.started", "response.text-delta", "response.completed"]);
});
