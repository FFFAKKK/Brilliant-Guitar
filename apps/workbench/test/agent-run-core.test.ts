import assert from "node:assert/strict";
import test from "node:test";

import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { reduceAgentInvocationState } from "../src/agent/invocation-state.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";
import { reduceAgentRunState } from "../src/agent/run-state.ts";
import type {
  AgentContextBudget,
  RunPolicySnapshot,
} from "../src/agent/agent-contracts.ts";
import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";

const budget: AgentContextBudget = {
  tokenBudget: 400,
  itemCountBudget: 16,
  toolResultSizeBudget: 4096,
  rangeBudget: 32,
  historyTurnBudget: 4,
};

const policy: RunPolicySnapshot = {
  policyVersion: 1,
  allowedCapabilityIds: ["score.read-summary"],
  allowedKinds: ["query"],
  maxToolsPerTurn: 1,
  maxCostClass: "constant",
  exposeApprovalRequired: false,
};

function idSource(): (kind: "event" | "turn" | "invocation") => string {
  let sequence = 0;
  return (kind) => `${kind}-${++sequence}`;
}

function runRequest() {
  return {
    runId: "run-summary",
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
}

test("fake provider completes a grounded read-only run through the real capability boundary", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "read-summary",
          capabilityId: "score.read-summary",
          contractVersion: 1,
          input: {},
        }],
      },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.read-summary"],
        contextSourceIds: ["score.read-summary"],
      },
      decision: { kind: "finish", reason: "completed", text: "当前乐谱共有 32 小节。" },
    },
  ]);
  const requests: CapabilityTransportRequest[] = [];
  const capabilities = new WorkbenchAgentCapabilityPort({
    async invokeCapability(request) {
      requests.push(request);
      return {
        status: "completed",
        invocationId: request.invocationId,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: {
          documentId: "score-1",
          documentVersion: 7,
          title: "练习曲",
          measureCount: 32,
        },
      };
    },
  });
  const controller = new AgentRunController({
    provider,
    capabilities,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });

  const outcome = await controller.run(runRequest());

  assert.deepEqual(outcome.run.state, {
    lifecycle: "terminal",
    phase: "verifying",
    terminalReason: "completed",
  });
  assert.equal(outcome.response, "当前乐谱共有 32 小节。");
  assert.equal(outcome.verification?.satisfied, true);
  assert.equal(outcome.run.turns.length, 2);
  assert.equal(outcome.run.invocations[0]?.state.status, "succeeded");
  assert.equal(requests[0]?.invocationId, outcome.run.invocations[0]?.invocationId);
  assert.equal(outcome.run.contextItems[0]?.sourceId, "score.read-summary");
  assert.equal(provider.requests[1]?.context.contextItems.some(
    (item) => item.sourceId === "score.read-summary" && item.documentVersion === 7,
  ), true);
  assert.equal(provider.exhausted, true);
  assert.deepEqual(outcome.run.events.map((item) => item.event.type), [
    "run.created",
    "run.prepared",
    "turn.tools-accepted",
    "invocations.completed",
    "verification.continue",
    "turn.finish-requested",
    "verification.completed",
  ]);
  assert.deepEqual(outcome.run.events.map((item) => item.sequence), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(outcome.run.invocations[0]?.events.map((item) => item.sequence), [1, 2, 3, 4, 5]);
});

test("run and invocation reducers reject impossible transitions", () => {
  const created = reduceAgentRunState(null, { type: "run.created" });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const prepared = reduceAgentRunState(created.state, { type: "run.prepared" });
  assert.equal(prepared.accepted, true);
  if (!prepared.accepted) return;
  const illegalRun = reduceAgentRunState(prepared.state, { type: "invocations.completed" });
  assert.equal(illegalRun.accepted, false);

  const requested = reduceAgentInvocationState(null, { type: "invocation.requested" });
  assert.equal(requested.accepted, true);
  if (!requested.accepted) return;
  const illegalInvocation = reduceAgentInvocationState(requested.state, { type: "invocation.succeeded" });
  assert.equal(illegalInvocation.accepted, false);
});

test("a guessed capability fails the run without reaching the capability port", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    decision: {
      kind: "tool-calls",
      calls: [{
        callId: "guess",
        capabilityId: "score.delete-document",
        contractVersion: 1,
        input: {},
      }],
    },
  }]);
  let invoked = false;
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke() {
        invoked = true;
        throw new Error("must not be called");
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  });

  const outcome = await controller.run(runRequest());

  assert.equal(invoked, false);
  assert.deepEqual(outcome.run.state, {
    lifecycle: "terminal",
    phase: "planning",
    terminalReason: "failed",
    failureCode: "invalid-decision",
  });
});

test("provider failure, cancellation and uncertain capability outcome stay distinct", async () => {
  const failingProvider = new FakeAgentProvider([{
    kind: "error",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    message: "provider unavailable",
  }]);
  const neverInvoked = {
    async invoke(): Promise<never> {
      throw new Error("must not be called");
    },
  };
  const failed = await new AgentRunController({
    provider: failingProvider,
    capabilities: neverInvoked,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  }).run(runRequest());
  assert.equal(failed.run.state.lifecycle === "terminal"
    ? failed.run.state.terminalReason : null, "failed");
  assert.equal(failed.run.state.lifecycle === "terminal" && failed.run.state.terminalReason === "failed"
    ? failed.run.state.failureCode : null, "provider-failed");

  const abort = new AbortController();
  abort.abort();
  const cancelledProvider = new FakeAgentProvider([]);
  const cancelled = await new AgentRunController({
    provider: cancelledProvider,
    capabilities: neverInvoked,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  }).run(runRequest(), abort.signal);
  assert.deepEqual(cancelled.run.state, {
    lifecycle: "terminal",
    phase: "planning",
    terminalReason: "cancelled",
  });
  assert.equal(cancelledProvider.requests.length, 0);

  const uncertainProvider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    decision: {
      kind: "tool-calls",
      calls: [{
        callId: "read",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }],
    },
  }]);
  const uncertain = await new AgentRunController({
    provider: uncertainProvider,
    capabilities: {
      async invoke(): Promise<never> {
        throw new Error("reply lost after dispatch");
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  }).run(runRequest());
  assert.deepEqual(uncertain.run.state, {
    lifecycle: "recovering",
    phase: "executing",
    recoveryReason: "capability-outcome-unknown",
  });
  assert.equal(uncertain.run.invocations[0]?.state.status, "outcome-unknown");
});

test("cancellation after dispatch waits for reconciliation instead of claiming the capability stopped", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    decision: {
      kind: "tool-calls",
      calls: [{
        callId: "read",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }],
    },
  }]);
  let notifyDispatched: (() => void) | undefined;
  const dispatched = new Promise<void>((resolve) => { notifyDispatched = resolve; });
  const capabilities = {
    invoke(): Promise<never> {
      notifyDispatched?.();
      return new Promise<never>(() => {});
    },
  };
  const abort = new AbortController();
  const running = new AgentRunController({
    provider,
    capabilities,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  }).run(runRequest(), abort.signal);

  await dispatched;
  abort.abort();
  const outcome = await running;

  assert.deepEqual(outcome.run.state, {
    lifecycle: "waiting",
    phase: "executing",
    waitReason: "cancellation-pending",
  });
  assert.equal(outcome.run.invocations[0]?.state.status, "outcome-unknown");
  assert.equal(outcome.run.events.at(-1)?.event.type, "cancellation.requested");
});

test("capability port rejects a mismatched transport identity", async () => {
  const port = new WorkbenchAgentCapabilityPort({
    async invokeCapability(request) {
      return {
        status: "completed",
        invocationId: `${request.invocationId}-wrong`,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: { documentId: "score-1", documentVersion: 1, title: "", measureCount: 1 },
      };
    },
  });
  await assert.rejects(() => port.invoke({
    invocationId: "invocation-1",
    capabilityId: "score.read-summary",
    contractVersion: 1,
    workspaceId: "workspace-1",
    input: {},
  }), /identity/);
});

test("a model cannot turn its own failed finish proposal into user cancellation or completion", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    decision: { kind: "finish", reason: "cancelled", text: "模型选择停止" },
  }]);
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(): Promise<never> {
        throw new Error("must not be called");
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    nextId: idSource(),
  });

  const outcome = await controller.run(runRequest());

  assert.deepEqual(outcome.run.state, {
    lifecycle: "terminal",
    phase: "verifying",
    terminalReason: "failed",
    failureCode: "completion-rejected",
  });
});
