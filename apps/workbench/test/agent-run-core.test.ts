import assert from "node:assert/strict";
import test from "node:test";

import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreMeasuresCompletion, verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { reduceAgentInvocationState } from "../src/agent/invocation-state.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import {
  AgentRunController,
  AgentRunResumeError,
  getAgentRunRequiredInput,
} from "../src/agent/run-controller.ts";
import type { AgentRunProgressEvent } from "../src/agent/run-progress.ts";
import { reduceAgentRunState } from "../src/agent/run-state.ts";
import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
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

function idSource(): (kind: "event" | "turn" | "invocation" | "user-input") => string {
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
    async invokeAgentCapability(request) {
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
    "invocation.dispatched",
    "invocation.outcome-recorded",
    "invocations.completed",
    "verification.continue",
    "turn.finish-requested",
    "verification.completed",
  ]);
  assert.deepEqual(outcome.run.events.map((item) => item.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(outcome.run.invocations[0]?.events.map((item) => item.sequence), [1, 2, 3, 4, 5]);
});

test("controller projects Provider streaming into product progress without exposing tool fragments", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      events: [
        { type: "response.started" },
        { type: "response.tool-input-delta", callId: "read-summary", delta: "SECRET_PARTIAL_JSON" },
        { type: "response.completed" },
      ],
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
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      events: [
        { type: "response.started" },
        { type: "response.text-delta", delta: "当前乐谱" },
        { type: "response.text-delta", delta: "共有 32 小节。" },
        { type: "response.completed" },
      ],
      decision: { kind: "finish", reason: "completed", text: "当前乐谱共有 32 小节。" },
    },
  ]);
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const progress: AgentRunProgressEvent[] = [];

  const outcome = await controller.run(runRequest(), null, (event) => progress.push(event));

  assert.equal(outcome.run.state.lifecycle, "terminal");
  assert.equal(JSON.stringify(progress).includes("SECRET_PARTIAL_JSON"), false);
  assert.equal(progress.some((event) => event.type.startsWith("response.")), false);
  assert.equal(progress.some((event) => event.type === "activity.started"
    && event.kind === "reading" && event.label === "读取乐谱概要"), true);
  assert.equal(progress.filter((event) => event.type === "message.text-delta")
    .map((event) => event.type === "message.text-delta" ? event.delta : "").join(""), "当前乐谱共有 32 小节。");
  assert.equal(progress.some((event) => event.type === "message.completed"
    && event.content === "当前乐谱共有 32 小节。"), true);
});

test("progress observer failures never change the authoritative Run result", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    events: [
      { type: "response.started" },
      { type: "response.text-delta", delta: "需要更多信息" },
      { type: "response.completed" },
    ],
    decision: { kind: "message", text: "需要更多信息" },
  }]);
  const progressErrors: unknown[] = [];
  const controller = new AgentRunController({
    provider,
    capabilities: { async invoke() { throw new Error("must not invoke"); } },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
    reportProgressError: (error) => progressErrors.push(error),
  });

  const outcome = await controller.run(runRequest(), null, () => {
    throw new Error("broken UI projection");
  });

  assert.equal(outcome.response, "需要更多信息");
  assert.equal(outcome.run.state.lifecycle, "waiting");
  assert.equal(progressErrors.length > 0, true);
});

test("controller checkpoints run events through the durable store port", async () => {
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
      decision: { kind: "finish", reason: "completed", text: "已完成" },
    },
  ]);
  const store = new InMemoryAgentRunStore();
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });

  const outcome = await controller.run(runRequest());
  const stored = await store.load("run-summary");
  assert.equal(outcome.run.events.length, 9);
  assert.equal(stored?.lastSequence, 9);
  assert.deepEqual(stored?.run.state, outcome.run.state);
  assert.equal(stored?.run.turns.length, 2);
  assert.equal((await store.listRecoverable()).length, 0);
});

test("resume cursor continues from the persisted turn without redispatching completed capabilities", async () => {
  const sourceProvider = new FakeAgentProvider([
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
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text: "已完成" },
    },
  ]);
  const source = new AgentRunController({
    provider: sourceProvider,
    capabilities: {
      async invoke(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const sourceOutcome = await source.run(runRequest());
  const persistedRun = {
    ...sourceOutcome.run,
    state: { lifecycle: "active", phase: "planning" } as const,
    events: sourceOutcome.run.events.slice(0, 7),
    // Exercise old/incomplete snapshots where events crossed the stable turn
    // boundary but the Turn and Context projection were not yet included.
    turns: [],
    contextItems: [],
  };
  const store = new InMemoryAgentRunStore();
  for (const event of persistedRun.events) {
    const committed = await store.commit({
      runId: persistedRun.runId,
      expectedSequence: event.sequence - 1,
      event,
      nextRun: {
        ...persistedRun,
        events: persistedRun.events.slice(0, event.sequence),
      },
    });
    assert.equal(committed.status, "committed");
  }

  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
    decision: { kind: "finish", reason: "completed", text: "恢复后完成" },
  }]);
  let capabilityCalls = 0;
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(): Promise<never> {
        capabilityCalls += 1;
        throw new Error("completed capability must not be dispatched again");
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 200,
    nextId: idSource(),
  });

  const outcome = await controller.resume(runRequest(), persistedRun);

  assert.equal(capabilityCalls, 0);
  assert.equal(provider.requests.length, 1);
  assert.equal(outcome.response, "恢复后完成");
  assert.equal(outcome.run.turns.length, 1);
  assert.equal(outcome.run.contextItems.some((item) => item.sourceId === "score.read-summary"), true);
  assert.equal(provider.requests[0]?.context.contextItems.some(
    (item) => item.contextItemId === "turn.input",
  ), false);
  assert.equal(outcome.run.events.filter((item) => item.event.type === "run.created").length, 1);
  assert.equal(outcome.run.events.filter((item) => item.event.type === "run.prepared").length, 1);
  assert.deepEqual(outcome.run.events.map((item) => item.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal((await store.load("run-summary"))?.lastSequence, 9);
});

test("a missing measure selection waits and resumes the same Run with the latest workspace sidecar", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-selection-before",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        input: { reference: { kind: "current-selection" } },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-selection-after",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        input: { reference: { kind: "current-selection" } },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: ["score.read-measures"] },
      decision: { kind: "finish", reason: "completed", text: "已读取当前选择。" },
    },
  ]);
  const store = new InMemoryAgentRunStore();
  const invocationSelections: unknown[] = [];
  const progress: AgentRunProgressEvent[] = [];
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(capabilityRequest, context) {
        invocationSelections.push(context?.workspace.selection ?? null);
        if (context?.workspace.selection === null) return {
          status: "rejected",
          invocationId: capabilityRequest.invocationId,
          capabilityId: capabilityRequest.capabilityId,
          contractVersion: capabilityRequest.contractVersion,
          code: "selection-unavailable",
          message: "当前没有可用于任务的小节选择区",
        };
        return {
          status: "completed",
          invocationId: capabilityRequest.invocationId,
          capabilityId: capabilityRequest.capabilityId,
          contractVersion: capabilityRequest.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 8,
            startMeasureId: "measure-2",
            endMeasureId: "measure-3",
            measureCount: 2,
            measures: [
              { measureId: "measure-2", meter: { numerator: 4, denominator: 4 }, pickupDuration: null },
              { measureId: "measure-3", meter: { numerator: 4, denominator: 4 }, pickupDuration: null },
            ],
          },
        };
      },
    },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreMeasuresCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  const measureRequest = {
    ...runRequest(),
    runId: "run-selection",
    goal: "读取当前选中的小节",
    intent: {
      kind: "read" as const,
      requestedCapabilityIds: ["score.read-measures"],
      scope: "range" as const,
    },
    policy: {
      ...policy,
      allowedCapabilityIds: ["score.read-measures"],
      maxCostClass: "range" as const,
    },
  };

  const waiting = await controller.run(measureRequest, null, (event) => progress.push(event));

  assert.deepEqual(waiting.run.state, { lifecycle: "waiting", phase: "planning", waitReason: "user-input" });
  assert.equal(waiting.run.events.at(-1)?.event.type, "user-input.required");
  const requiredInput = getAgentRunRequiredInput(waiting.run);
  assert.ok(requiredInput);
  assert.match(requiredInput.requestId, /^user-input-/);
  assert.deepEqual(requiredInput, {
    requestId: requiredInput.requestId,
    kind: "measure-selection",
    prompt: "请在当前乐谱中选择要读取的小节",
    sourceInvocationId: waiting.run.invocations[0]?.invocationId,
    constraints: { documentId: "score-1", minMeasures: 1, maxMeasures: 32 },
  });
  const repeatedInput = { ...requiredInput, requestId: "user-input-second" };
  const nextSequence = waiting.run.events.length + 1;
  assert.equal(getAgentRunRequiredInput({
    ...waiting.run,
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    events: [
      ...waiting.run.events,
      {
        eventId: "event-resumed",
        runId: waiting.run.runId,
        sequence: nextSequence,
        occurredAt: 101,
        event: { type: "run.resumed" },
      },
      {
        eventId: "event-input-second",
        runId: waiting.run.runId,
        sequence: nextSequence + 1,
        occurredAt: 102,
        event: { type: "user-input.required", input: repeatedInput },
      },
    ],
  })?.requestId, "user-input-second");
  assert.equal(waiting.run.invocations[0]?.state.status, "rejected");
  assert.equal(progress.some((event) => event.type === "activity.waiting"
    && event.code === "selection-unavailable"), true);

  const stored = await store.load("run-selection");
  assert.ok(stored);
  const selectedWorkspace = {
    ...measureRequest.workspace,
    documentVersion: 8,
    selection: {
      kind: "measure-range" as const,
      documentId: "score-1",
      documentVersion: 8,
      startMeasureId: "measure-2",
      endMeasureId: "measure-3",
    },
  };
  const completed = await controller.resume({
    ...measureRequest,
    workspace: selectedWorkspace,
  }, stored.run);

  assert.equal(completed.run.runId, "run-selection");
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.equal(getAgentRunRequiredInput(completed.run), null);
  assert.equal(completed.run.workspace.documentVersion, 8);
  assert.deepEqual(invocationSelections, [null, selectedWorkspace.selection]);
  assert.equal(completed.run.events.filter((event) => event.event.type === "run.resumed").length, 1);
  assert.equal(provider.exhausted, true);
});

test("controller resume rejects a mismatched or non-plannable persisted run", async () => {
  const controller = new AgentRunController({
    provider: new FakeAgentProvider([]),
    capabilities: { async invoke(): Promise<never> { throw new Error("must not be called"); } },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
  });
  const storedRun = {
    runId: "stored-run",
    workspace: runRequest().workspace,
    goal: runRequest().goal,
    state: { lifecycle: "active", phase: "planning" } as const,
    createdAt: 1,
    policy,
    intent: runRequest().intent,
    events: [],
    turns: [],
    invocations: [],
    contextItems: [],
  };

  await assert.rejects(
    controller.resume(runRequest(), storedRun),
    (error: unknown) => error instanceof AgentRunResumeError && error.code === "run-mismatch",
  );
  await assert.rejects(
    controller.resume(runRequest(), {
      ...storedRun,
      runId: runRequest().runId,
      state: { lifecycle: "recovering", phase: "planning", recoveryReason: "host-interrupted" },
    }),
    (error: unknown) => error instanceof AgentRunResumeError && error.code === "run-not-plannable",
  );
  await assert.rejects(
    controller.resume({
      ...runRequest(),
      workspace: { ...runRequest().workspace, workspaceId: "other-workspace" },
    }, {
      ...storedRun,
      runId: runRequest().runId,
    }),
    (error: unknown) => error instanceof AgentRunResumeError && error.code === "workspace-mismatch",
  );
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
    async invokeAgentCapability(request) {
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
