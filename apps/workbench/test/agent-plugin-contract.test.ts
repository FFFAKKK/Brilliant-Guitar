import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import {
  createAgentPluginProvider,
  createExternalAgentPlugin,
  createFirstPartyAgentPlugin,
  type AgentPluginRequest,
} from "../src/agent/agent-plugin-contract.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";
import type { AgentDecision } from "../src/agent/agent-contracts.ts";

const budget = {
  tokenBudget: 400,
  itemCountBudget: 16,
  toolResultSizeBudget: 4096,
  rangeBudget: 32,
  historyTurnBudget: 4,
} as const;

const policy = {
  policyVersion: 1,
  allowedCapabilityIds: ["score.read-summary"],
  allowedKinds: ["query"],
  maxToolsPerTurn: 1,
  maxCostClass: "constant",
  approvalMode: "disallow",
} as const;

const request = {
  runId: "run-plugin-contract",
  workspace: {
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 7,
    selection: null,
  },
  goal: "告诉我当前乐谱有多少小节",
  intent: {
    kind: "read" as const,
    requestedCapabilityIds: ["score.read-summary"],
    scope: "document" as const,
  },
  policy,
  budget,
  initialContextItems: [],
  maxTurns: 4,
};

function idSource(): (kind: "event" | "turn" | "invocation" | "user-input") => string {
  let sequence = 0;
  return (kind) => kind + "-" + (++sequence);
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

function createScriptedPlugin(kind: "first-party" | "external", received: AgentPluginRequest[]) {
  const decide = async (pluginRequest: AgentPluginRequest): Promise<AgentDecision> => {
    received.push(pluginRequest);
    assert.equal("capabilities" in pluginRequest, false);
    if (received.length === 1) {
      return {
        kind: "tool-calls",
        calls: [{
          callId: "read-summary",
          capabilityId: "score.read-summary",
          contractVersion: 1,
          input: {},
        }],
      };
    }
    assert.equal(pluginRequest.context.contextItems.some(
      (item) => item.sourceId === "score.read-summary",
    ), true);
    return { kind: "finish", reason: "completed", text: "当前乐谱共有 12 小节。" };
  };

  const plugin = kind === "first-party"
    ? createFirstPartyAgentPlugin({
        id: "brilliant.first-party.agent",
        version: "0.1.0",
        label: "Brilliant Guitar 内置 Agent",
        decide,
      })
    : createExternalAgentPlugin({
        id: "example.external.agent",
        version: "1.0.0",
        label: "Example External Agent",
        decide,
      });
  return { plugin, provider: createAgentPluginProvider(plugin) };
}

async function runWithPlugin(kind: "first-party" | "external") {
  const pluginRequests: AgentPluginRequest[] = [];
  const capabilityRequests: CapabilityTransportRequest[] = [];
  const { plugin, provider } = createScriptedPlugin(kind, pluginRequests);
  const controller = new AgentRunController({
    provider,
    capabilities: createCapabilities(capabilityRequests),
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const outcome = await controller.run(request);
  return { plugin, outcome, pluginRequests, capabilityRequests };
}

for (const kind of ["first-party", "external"] as const) {
  test(kind + " Agent Plugin uses the same Controller execution chain", async () => {
    const result = await runWithPlugin(kind);

    assert.equal(result.plugin.descriptor.kind, kind);
    assert.equal(result.outcome.response, "当前乐谱共有 12 小节。");
    assert.equal(result.outcome.verification?.satisfied, true);
    assert.equal(result.capabilityRequests.length, 1);
    assert.equal(result.capabilityRequests[0]?.capabilityId, "score.read-summary");
    assert.equal(result.pluginRequests.length, 2);
    assert.equal(result.pluginRequests[0]?.plugin.id, result.plugin.descriptor.id);
    assert.equal(result.pluginRequests[1]?.context.contextItems.some(
      (item) => item.sourceId === "score.read-summary",
    ), true);
    assert.deepEqual(result.outcome.run.events.map((item) => item.event.type), [
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
}

test("external Agent Plugin failures retain Controller provider-failed semantics", async () => {
  let capabilityCalls = 0;
  const plugin = createExternalAgentPlugin({
    id: "example.failing.agent",
    version: "1.0.0",
    label: "Failing External Agent",
    decide: async () => {
      throw new Error("external agent unavailable");
    },
  });
  const controller = new AgentRunController({
    provider: createAgentPluginProvider(plugin),
    capabilities: {
      async invoke() {
        capabilityCalls += 1;
        throw new Error("capability must not be reached");
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });

  const outcome = await controller.run(request);

  assert.deepEqual(outcome.run.state, {
    lifecycle: "terminal",
    phase: "planning",
    terminalReason: "failed",
    failureCode: "provider-failed",
  });
  assert.equal(capabilityCalls, 0);
  assert.equal(outcome.run.invocations.length, 0);
});

test("Agent Plugin provider rejects an object without a decision function", () => {
  assert.throws(
    () => createAgentPluginProvider({
      descriptor: {
        id: "invalid.agent",
        version: "1.0.0",
        kind: "external",
        label: "Invalid Agent",
      },
    } as never),
    /Invalid Agent Plugin decision function/,
  );
});
