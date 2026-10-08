import assert from "node:assert/strict";
import test from "node:test";

import type { AgentProviderRequest } from "../src/agent/provider.ts";
import { createFirstPartyAgentProviderSession } from "../src/agent/first-party-agent-session.ts";
import type { AgentModelProviderHostPort, AgentProviderHostPort } from "../src/agent/provider-host.ts";
import { createOpenAiPiModel, createOpenAiPiStreamFn } from "../src/agent/pi/openai-stream.ts";
import { createOpenAiPiPlugin } from "../src/agent/pi/openai-plugin.ts";
import { createAgentPluginProvider } from "../src/agent/agent-plugin-contract.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  isAgentModelStreamEnvelopeV1,
  isAgentModelStreamEventV1,
} from "../src/contracts/agent-model-stream.ts";
import type { AgentModelStreamEnvelopeV1 } from "../src/contracts/agent-model-stream.ts";

const request: AgentProviderRequest = {
  runId: "pi-openai-run",
  turnId: "turn-1",
  goal: "读取当前乐谱概要",
  runState: { lifecycle: "active", phase: "planning" },
  context: {
    contextItems: [],
    omittedItems: [],
    versionWarnings: [],
    // This fixture exercises transport, not rejection; budget includes instructions and tool schemas.
    budget: { estimatedTokens: 1, itemCount: 0, tokenBudget: 8192, itemCountBudget: 8, exceeded: false },
  },
  toolset: {
    snapshotId: "toolset-1",
    policyVersion: 1,
    toolsetHash: "hash-1",
    capabilityIds: ["score.read-summary"],
    toolDescriptors: [{
      id: "score.read-summary",
      contractVersion: 1,
      name: "读取乐谱概要",
      description: "读取当前乐谱概要",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSummary: "ScoreSummaryV1",
      preconditions: [],
      sideEffects: { document: "read", filesystem: "none", network: "none", settings: "none", playback: "none" },
      scopeLimit: "document",
      requiresApproval: false,
      costClass: "constant",
      failureModes: [],
    }],
    maxCalls: 1,
  },
};

function hostWithOutput(output: readonly { type: "text"; text: string }[] | readonly {
  type: "tool-call";
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}[], options: {
  readonly textDelta?: string;
  readonly onProviderPending?: (release: () => void) => void;
} = {}): AgentProviderHostPort & {
  readonly requests: unknown[];
} {
  const requests: unknown[] = [];
  return {
    requests,
    async readAgentProviderCredentialStatus(providerId) {
      return { providerId, present: true, status: "configured", message: "configured" };
    },
    async decideAgentProvider() {
      throw new Error("legacy path must not be used");
    },
    async streamAgentModel(modelRequest, _signal, observer) {
      requests.push(modelRequest);
      observer?.({ type: "response.started", runId: modelRequest.runId, turnId: modelRequest.turnId, sequence: 1 });
      if (options.textDelta !== undefined) {
        observer?.({ type: "response.text-delta", runId: modelRequest.runId, turnId: modelRequest.turnId,
          sequence: 2, delta: options.textDelta });
      }
      const envelope: AgentModelStreamEnvelopeV1 = {
        schemaVersion: 1,
        providerId: modelRequest.providerId,
        modelId: modelRequest.modelId,
        providerRequestId: "resp-pi-1",
        output,
        usage: null,
      };
      if (options.onProviderPending !== undefined) {
        return await new Promise<AgentModelStreamEnvelopeV1>((resolve) => {
          options.onProviderPending?.(() => resolve(envelope));
        });
      }
      observer?.({ type: "response.completed", runId: modelRequest.runId, turnId: modelRequest.turnId,
        sequence: options.textDelta === undefined ? 2 : 3 });
      return envelope;
    },
  };
}

function modelHost(host: AgentProviderHostPort): AgentModelProviderHostPort {
  if (host.streamAgentModel === undefined) throw new Error("test host has no model stream");
  return {
    readAgentProviderCredentialStatus: host.readAgentProviderCredentialStatus,
    streamAgentModel: host.streamAgentModel,
  };
}

test("raw model stream contract rejects leaked fields and impossible usage", () => {
  assert.equal(isAgentModelStreamEventV1({
    type: "response.started", runId: "run-1", turnId: "turn-1", sequence: 1,
  }), true);
  assert.equal(isAgentModelStreamEventV1({
    type: "response.usage", runId: "run-1", turnId: "turn-1", sequence: 2,
    inputTokens: 4, outputTokens: 2, totalTokens: 5,
  }), false);
  assert.equal(isAgentModelStreamEnvelopeV1({
    schemaVersion: 1,
    providerId: "openai",
    modelId: "gpt-5.4-mini",
    providerRequestId: "resp-1",
    output: [{ type: "tool-call", callId: "call-1", name: "score.read-summary", arguments: {} }],
    usage: null,
    secret: "must-not-cross-boundary",
  }), false);
  assert.equal(isAgentModelStreamEnvelopeV1({
    schemaVersion: 1,
    providerId: "openai",
    modelId: "gpt-5.4-mini",
    providerRequestId: "resp-duplicate-call-id",
    output: [
      { type: "tool-call", callId: "call-1", name: "score.read-summary", arguments: {} },
      { type: "tool-call", callId: "call-1", name: "score.read-summary", arguments: {} },
    ],
    usage: null,
  }), false);
});

test("configured OpenAI first-party session uses Pi over the raw model stream", async () => {
  const host = hostWithOutput([{
    type: "tool-call",
    callId: "call-1",
    name: "score.read-summary",
    arguments: {},
  }]);
  const session = createFirstPartyAgentProviderSession(
    { providerId: "openai", modelId: "gpt-5.4-mini" },
    host,
  );
  assert.equal(host.requests.length, 0);
  await session.refresh();
  assert.equal(host.requests.length, 0);
  const provider = session.getProvider();
  assert.ok(provider);
  const decision = await provider.decide(request);
  assert.deepEqual(decision, {
    kind: "tool-calls",
    calls: [{
      callId: "call-1",
      capabilityId: "score.read-summary",
      contractVersion: 1,
      input: {},
    }],
  });
  assert.equal(host.requests.length, 1);
  session.dispose();
});

test("first-party Pi stays unavailable when the host only supports legacy decisions", async () => {
  let legacyRequests = 0;
  const host: AgentProviderHostPort = {
    async readAgentProviderCredentialStatus(providerId) {
      return { providerId, present: true, status: "configured", message: "configured" };
    },
    async decideAgentProvider() {
      legacyRequests += 1;
      throw new Error("legacy path must not be used implicitly");
    },
  };
  const session = createFirstPartyAgentProviderSession(
    { providerId: "openai", modelId: "gpt-5.4-mini" }, host,
  );
  await session.refresh();
  assert.equal(session.getSnapshot().status, "unavailable");
  assert.equal(session.getProvider(), null);
  assert.equal(legacyRequests, 0);
  session.dispose();
});

test("explicit legacy rollback uses only the legacy decision host", async () => {
  let legacyRequests = 0;
  const host = hostWithOutput([{ type: "text", text: "raw model must not be used" }]);
  host.decideAgentProvider = async (turn, _signal, observer) => {
    legacyRequests += 1;
    observer?.({ type: "response.started", runId: turn.runId, turnId: turn.turnId, sequence: 1 });
    observer?.({ type: "response.completed", runId: turn.runId, turnId: turn.turnId, sequence: 2 });
    return {
      schemaVersion: 1, providerId: turn.providerId, modelId: turn.modelId,
      providerRequestId: "resp-legacy-1", usage: null,
      decision: { kind: "finish", reason: "completed", text: "legacy answer" },
    };
  };
  const session = createFirstPartyAgentProviderSession(
    { providerId: "openai", modelId: "gpt-5.4-mini" }, host, "legacy",
  );
  await session.refresh();
  const provider = session.getProvider();
  assert.ok(provider);
  assert.deepEqual(await provider.decide(request), {
    kind: "finish", reason: "completed", text: "legacy answer",
  });
  assert.equal(legacyRequests, 1);
  assert.equal(host.requests.length, 0);
  session.dispose();
});

test("a failed Pi model request never triggers a legacy decision request", async () => {
  let modelRequests = 0;
  let legacyRequests = 0;
  const host = hostWithOutput([{ type: "text", text: "unused" }]);
  host.streamAgentModel = async () => {
    modelRequests += 1;
    throw new Error("model transport failed");
  };
  host.decideAgentProvider = async () => {
    legacyRequests += 1;
    throw new Error("legacy path must not be used implicitly");
  };
  const session = createFirstPartyAgentProviderSession(
    { providerId: "openai", modelId: "gpt-5.4-mini" }, host,
  );
  await session.refresh();
  const provider = session.getProvider();
  assert.ok(provider);
  await assert.rejects(provider.decide(request), /model transport failed/);
  assert.equal(modelRequests, 1);
  assert.equal(legacyRequests, 0);
  session.dispose();
});

test("Pi stream rejects duplicate tool-call IDs before producing a decision", async () => {
  const host = hostWithOutput([
    { type: "tool-call", callId: "call-duplicate", name: "score.read-summary", arguments: {} },
    { type: "tool-call", callId: "call-duplicate", name: "score.read-summary", arguments: {} },
  ]);
  const streamFn = createOpenAiPiStreamFn(modelHost(host), request, { providerId: "openai", modelId: "gpt-5.4-mini" });
  const stream = await streamFn(createOpenAiPiModel({ providerId: "openai", modelId: "gpt-5.4-mini" }), normalizeContext({
    messages: [{ role: "user", content: "读取概要", timestamp: 1 }],
  }));
  const message = await stream.result();
  assert.equal(message.stopReason, "error");
  assert.match(message.errorMessage ?? "", /原始模型流完成结果无效/);
});

test("Pi stream preserves transcript tools and updates the shared partial message", async () => {
  const host = hostWithOutput([{ type: "text", text: "已读取概要" }], { textDelta: "已读取" });
  const streamFn = createOpenAiPiStreamFn(modelHost(host), request, { providerId: "openai", modelId: "gpt-5.4-mini" });
  const stream = await streamFn(createOpenAiPiModel({ providerId: "openai", modelId: "gpt-5.4-mini" }), normalizeContext({
    systemPrompt: "系统提示",
    tools: [{ name: "score.read-summary", description: "读取乐谱概要", parameters: { type: "object" } }],
    messages: [{ role: "user", content: "读取概要", timestamp: 1 }],
  }));
  const events = [];
  for await (const event of stream) events.push(event);
  const message = await stream.result();
  assert.equal(message.stopReason, "stop");
  assert.equal(message.content[0]?.type, "text");
  assert.equal(message.content[0]?.text, "已读取概要");
  assert.equal(events.some((event) => event.type === "text_delta" && event.delta === "已读取"), true);
  const modelRequest = (host as typeof host & { requests: unknown[] }).requests[0] as {
    messages: readonly { role: string; content: unknown }[];
    tools: readonly { name: string }[];
  };
  assert.equal(modelRequest.messages.some((item) => item.role === "system"), true);
  assert.equal(modelRequest.messages.some((item) => item.role === "user"), true);
  assert.deepEqual(modelRequest.tools.map((tool) => tool.name), ["score.read-summary"]);
});

test("Pi stream closes promptly as aborted and ignores a stale provider result", async () => {
  let releaseProviderResult: (() => void) | undefined;
  const host = hostWithOutput([{ type: "text", text: "迟到的结果" }], {
    onProviderPending(release) { releaseProviderResult = release; },
  });
  const controller = new AbortController();
  const streamFn = createOpenAiPiStreamFn(modelHost(host), request, { providerId: "openai", modelId: "gpt-5.4-mini" });
  const stream = await streamFn(createOpenAiPiModel({ providerId: "openai", modelId: "gpt-5.4-mini" }), normalizeContext({
    messages: [{ role: "user", content: "取消", timestamp: 1 }],
  }), { signal: controller.signal });
  controller.abort();
  const message = await stream.result();
  assert.equal(message.stopReason, "aborted");
  assert.ok(releaseProviderResult);
  releaseProviderResult();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await stream.result()).stopReason, "aborted");
});

test("OpenAI raw model stream completes the real Controller capability loop", async () => {
  const requests: unknown[] = [];
  let callCount = 0;
  const host: AgentProviderHostPort = {
    async readAgentProviderCredentialStatus(providerId) {
      return { providerId, present: true, status: "configured", message: "configured" };
    },
    async decideAgentProvider() { throw new Error("legacy path must not be used"); },
    async streamAgentModel(modelRequest, _signal, observer) {
      requests.push(modelRequest);
      callCount += 1;
      observer?.({ type: "response.started", runId: modelRequest.runId, turnId: modelRequest.turnId, sequence: 1 });
      const output = callCount === 1
        ? [{ type: "tool-call" as const, callId: "call-controller-1", name: "score.read-summary", arguments: {} }]
        : [{ type: "text" as const, text: "当前乐谱共有 12 个小节。" }];
      observer?.({ type: "response.completed", runId: modelRequest.runId, turnId: modelRequest.turnId, sequence: 2 });
      return { schemaVersion: 1, providerId: modelRequest.providerId, modelId: modelRequest.modelId,
        providerRequestId: `resp-controller-${callCount}`, output, usage: null };
    },
  };
  const plugin = createOpenAiPiPlugin(modelHost(host), { providerId: "openai", modelId: "gpt-5.4-mini" }, {
    id: "brilliant.pi", version: "0.1.0", kind: "first-party", label: "Brilliant Guitar Pi Agent",
  });
  const capabilityRequests: CapabilityTransportRequest[] = [];
  const controller = new AgentRunController({
    provider: createAgentPluginProvider(plugin),
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(capabilityRequest) {
        capabilityRequests.push(capabilityRequest);
        return { status: "completed" as const, invocationId: capabilityRequest.invocationId,
          capabilityId: capabilityRequest.capabilityId, contractVersion: capabilityRequest.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "测试乐谱", measureCount: 12 } };
      },
    }),
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: (() => { let sequence = 0; return (kind: "event" | "turn" | "invocation" | "user-input") => `${kind}-${++sequence}`; })(),
  });
  const outcome = await controller.run({
    runId: "run-openai-pi-controller",
    workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 7, selection: null },
    goal: "告诉我当前乐谱有多少小节",
    intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
    policy: { policyVersion: 1, allowedCapabilityIds: ["score.read-summary"], allowedKinds: ["query"],
      maxToolsPerTurn: 1, maxCostClass: "constant", approvalMode: "disallow" },
    budget: { tokenBudget: 8192, itemCountBudget: 16, toolResultSizeBudget: 4096, rangeBudget: 32, historyTurnBudget: 4 },
    initialContextItems: [], maxTurns: 4,
  });
  assert.equal(outcome.response, "当前乐谱共有 12 个小节。");
  assert.equal(outcome.verification?.satisfied, true);
  assert.equal(capabilityRequests.length, 1);
  assert.equal(requests.length, 2);
  const secondRequest = requests[1] as { messages: readonly { role: string; content: unknown }[] };
  const secondUserMessage = secondRequest.messages.find((message) => message.role === "user");
  assert.ok(secondUserMessage);
  assert.match(String(secondUserMessage.content), /capability-result/);
  assert.match(String(secondUserMessage.content), /measureCount/);
});
