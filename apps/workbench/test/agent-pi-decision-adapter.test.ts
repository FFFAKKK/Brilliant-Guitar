import assert from "node:assert/strict";
import test from "node:test";

import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createPiDecisionPlugin } from "../src/agent/pi/decision-adapter.ts";
import { createScoreSummaryFakeStream } from "../src/agent/pi/fake-stream.ts";
import {
  createAgentPluginProvider,
  type AgentPluginRequest,
} from "../src/agent/agent-plugin-contract.ts";
import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";

const request: AgentPluginRequest = {
  runId: "pi-decision-run",
  turnId: "turn-1",
  goal: "读取乐谱概要",
  runState: { lifecycle: "active", phase: "planning" },
  context: {
    contextItems: [],
    omittedItems: [],
    versionWarnings: [],
    budget: { estimatedTokens: 1, itemCount: 0, tokenBudget: 100, itemCountBudget: 10, exceeded: false },
  },
  toolset: {
    snapshotId: "toolset:test",
    policyVersion: 1,
    toolsetHash: "hash",
    capabilityIds: ["score.read-summary"],
    toolDescriptors: [{
      id: "score.read-summary",
      contractVersion: 1,
      name: "读取乐谱概要",
      description: "读取乐谱概要",
      inputSchema: {},
      outputSummary: "乐谱概要",
      preconditions: [],
      sideEffects: { document: "read", filesystem: "none", network: "none", settings: "none", playback: "none" },
      scopeLimit: "document",
      requiresApproval: false,
      costClass: "constant",
      failureModes: [],
    }],
    maxCalls: 1,
  },
  plugin: { id: "brilliant.pi", version: "0.1.0", kind: "first-party", label: "Pi" },
};

test("Pi Decision Adapter returns a tool decision without a capability port", async () => {
  const stream = createScoreSummaryFakeStream();
  const progress: string[] = [];
  const plugin = createPiDecisionPlugin({
    id: "brilliant.pi",
    version: "0.1.0",
    label: "Pi",
    model: stream.model,
    streamFn: stream.streamFn,
  });
  const decision = await plugin.decide(request, null, (event) => progress.push(event.type));
  assert.deepEqual(decision, {
    kind: "tool-calls",
    calls: [{
      callId: "score-summary-call",
      capabilityId: "score.read-summary",
      contractVersion: 1,
      input: {},
    }],
  });
  assert.deepEqual(progress, ["response.started", "response.completed"]);
});

test("Pi Decision Adapter returns a completion decision after a model-only response", async () => {
  const faux = createFauxCore({
    api: "fake-chat",
    provider: "fake",
    models: [{ id: "fake-answer-model", name: "Fake answer model" }],
  });
  faux.setResponses([fauxAssistantMessage("已经完成。", { stopReason: "stop" })]);
  const plugin = createPiDecisionPlugin({
    id: "brilliant.pi",
    version: "0.1.0",
    label: "Pi",
    model: faux.getModel(),
    streamFn: faux.streamSimple,
  });
  const decision = await plugin.decide({ ...request, goal: "直接回答" });
  assert.deepEqual(decision, { kind: "finish", reason: "completed", text: "已经完成。" });
});

test("Pi Decision Adapter propagates a model error instead of returning an empty completion", async () => {
  const faux = createFauxCore({
    api: "fake-chat",
    provider: "fake",
    models: [{ id: "fake-error-model", name: "Fake error model" }],
  });
  faux.setResponses([fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: "模型响应失败",
  })]);
  const progress: string[] = [];
  const plugin = createPiDecisionPlugin({
    id: "brilliant.pi",
    version: "0.1.0",
    label: "Pi",
    model: faux.getModel(),
    streamFn: faux.streamSimple,
  });
  await assert.rejects(
    plugin.decide(request, null, (event) => progress.push(event.type)),
    /模型响应失败/,
  );
  assert.deepEqual(progress, ["response.started", "response.text-delta", "response.failed"]);
});

test("Pi Decision Adapter aborts the active Pi turn", async () => {
  const stream = createScoreSummaryFakeStream();
  const controller = new AbortController();
  const plugin = createPiDecisionPlugin({
    id: "brilliant.pi",
    version: "0.1.0",
    label: "Pi",
    model: stream.model,
    streamFn: stream.streamFn,
  });
  await assert.rejects(
    plugin.decide(request, controller.signal, (event) => {
      if (event.type === "response.started") controller.abort();
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(stream.callCount(), 1);
});

function idSource(): (kind: "event" | "turn" | "invocation" | "user-input") => string {
  let sequence = 0;
  return (kind) => `${kind}-${++sequence}`;
}

function createCapabilities(received: CapabilityTransportRequest[]) {
  return new WorkbenchAgentCapabilityPort({
    async invokeCapability(capabilityRequest) {
      received.push(capabilityRequest);
      return {
        status: "completed" as const,
        invocationId: capabilityRequest.invocationId,
        capabilityId: capabilityRequest.capabilityId,
        contractVersion: capabilityRequest.contractVersion,
        data: {
          documentId: "score-1",
          documentVersion: 7,
          title: "测试乐谱",
          measureCount: 12,
        },
      };
    },
  });
}

test("Pi Decision Adapter completes a real Controller capability loop", async () => {
  const stream = createScoreSummaryFakeStream();
  const plugin = createPiDecisionPlugin({
    id: "brilliant.pi",
    version: "0.1.0",
    label: "Pi",
    model: stream.model,
    streamFn: stream.streamFn,
  });
  const capabilityRequests: CapabilityTransportRequest[] = [];
  const controller = new AgentRunController({
    provider: createAgentPluginProvider(plugin),
    capabilities: createCapabilities(capabilityRequests),
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const outcome = await controller.run({
    runId: "run-pi-controller",
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 7,
      selection: null,
    },
    goal: "告诉我当前乐谱有多少小节",
    intent: {
      kind: "read",
      requestedCapabilityIds: ["score.read-summary"],
      scope: "document",
    },
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: ["score.read-summary"],
      allowedKinds: ["query"],
      maxToolsPerTurn: 1,
      maxCostClass: "constant",
      approvalMode: "disallow",
    },
    budget: {
      tokenBudget: 400,
      itemCountBudget: 16,
      toolResultSizeBudget: 4096,
      rangeBudget: 32,
      historyTurnBudget: 4,
    },
    initialContextItems: [],
    maxTurns: 4,
  });
  assert.equal(outcome.response, "当前乐谱共有 12 个小节。");
  assert.equal(outcome.verification?.satisfied, true);
  assert.equal(capabilityRequests.length, 1);
  assert.equal(stream.callCount(), 2);
  assert.deepEqual(outcome.run.events.map((event) => event.event.type), [
    "run.created",
    "run.prepared",
    "turn.tools-accepted",
    "invocation.dispatched",
    "invocation.outcome-recorded",
    "invocations.completed",
    "verification.continue",
    "turn.finish-requested",
    "verification.completed",
  ]);
});
