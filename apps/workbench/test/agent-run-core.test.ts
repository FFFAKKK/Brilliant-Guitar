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
  getAgentRunRequiredApproval,
  getAgentRunRequiredInput,
} from "../src/agent/run-controller.ts";
import type { AgentRunProgressEvent } from "../src/agent/run-progress.ts";
import { reduceAgentRunState } from "../src/agent/run-state.ts";
import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
import type {
  AgentRunStoreCommitInput,
  AgentRunStoreCommitResult,
  AgentRunStorePort,
} from "../src/agent/agent-store.ts";
import { AgentRecoveryCoordinator } from "../src/agent/recovery-coordinator.ts";
import {
  getAgentApprovalAudit,
  projectAgentApprovalAudits,
} from "../src/agent/approval-audit.ts";
import {
  getAgentUserInputConsumption,
  projectAgentUserInputConsumptions,
} from "../src/agent/user-input-consumption.ts";
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
  approvalMode: "disallow",
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

function approvalRunRequest() {
  return {
    ...runRequest(),
    policy: { ...policy, approvalMode: "risk-based" as const },
  };
}

function approvalCatalog() {
  const descriptor = FIRST_PARTY_CAPABILITY_CATALOG.find(
    (item) => item.id === "score.read-summary",
  );
  if (descriptor === undefined) throw new Error("score.read-summary descriptor is missing");
  return [{
    ...descriptor,
    approvalRequirement: "risk-based" as const,
    sideEffects: { ...descriptor.sideEffects, document: "write" as const },
  }];
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

test("controller persists a control-plane approval contract before dispatch", async () => {
  const provider = new FakeAgentProvider([{
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
  }]);
  let invocationCalls = 0;
  const store = new InMemoryAgentRunStore();
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke() {
        invocationCalls += 1;
        throw new Error("approval must happen before dispatch");
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });

  const outcome = await controller.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(outcome.run);

  assert.deepEqual(outcome.run.state, {
    lifecycle: "waiting",
    phase: "executing",
    waitReason: "approval",
  });
  assert.equal(invocationCalls, 0);
  assert.equal(outcome.run.invocations[0]?.state.status, "awaiting-approval");
  assert.equal(approval?.items[0]?.invocationId, outcome.run.invocations[0]?.invocationId);
  assert.equal(approval?.items[0]?.capabilityName, "读取乐谱概要");
  assert.equal(approval?.items[0]?.riskLevel, "high");
  assert.deepEqual(approval?.items[0]?.riskReasons, ["会修改当前乐谱"]);
  assert.deepEqual(approval?.items[0]?.policy, {
    policyVersion: 1,
    mode: "risk-based",
    capabilityRequirement: "risk-based",
    decision: "require-approval",
  });
  assert.deepEqual(approval?.items[0]?.scope, {
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 7,
    limit: "document",
  });
  assert.deepEqual(
    (await store.load("run-summary"))?.run.events.at(-1)?.event,
    { type: "approval.required", approval },
  );
});

test("approved invocation executes its persisted input and resumes the same Run", async () => {
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
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text: "批准的能力已完成。" },
    },
  ]);
  const requests: CapabilityTransportRequest[] = [];
  const store = new InMemoryAgentRunStore();
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(request) {
        requests.push(request);
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 8, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await controller.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);

  const completed = await controller.continueWithApproval(
    approvalRunRequest(),
    waiting.run,
    { approvalId: approval.approvalId, kind: "capability-execution", outcome: "approved", decidedBy: "local-user" },
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]?.input, {});
  assert.equal(requests[0]?.invocationId, waiting.run.invocations[0]?.invocationId);
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.equal(completed.run.invocations[0]?.state.status, "succeeded");
  assert.deepEqual(completed.run.invocations[0]?.events.map((event) => event.event.type), [
    "invocation.requested",
    "invocation.validated",
    "approval.required",
    "approval.granted",
    "invocation.dispatched",
    "invocation.started",
    "invocation.succeeded",
  ]);
  assert.equal(completed.run.events.some((event) => event.event.type === "approval.approved"), true);
  assert.equal(provider.exhausted, true);
});

test("approval barrier resumes every Invocation in a mixed tool-call batch", async () => {
  const metadataDescriptor = FIRST_PARTY_CAPABILITY_CATALOG.find(
    (item) => item.id === "score.read-metadata",
  );
  assert.ok(metadataDescriptor);
  const catalog = [...approvalCatalog(), metadataDescriptor];
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.read-summary", "score.read-metadata"],
        contextSourceIds: [],
      },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "read-summary",
          capabilityId: "score.read-summary",
          contractVersion: 1,
          input: {},
        }, {
          callId: "read-metadata",
          capabilityId: "score.read-metadata",
          contractVersion: 1,
          input: {},
        }],
      },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.read-summary", "score.read-metadata"],
        contextSourceIds: ["score.read-summary", "score.read-metadata"],
      },
      decision: { kind: "finish", reason: "completed", text: "批量读取完成。" },
    },
  ]);
  const requests: CapabilityTransportRequest[] = [];
  const store = new InMemoryAgentRunStore();
  const persistedInvocationStates: string[][] = [];
  const persistedContextSources: string[][] = [];
  const persistedDocumentVersions: Array<number | null> = [];
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke(request) {
        requests.push(request);
        const persisted = await store.load("run-summary");
        persistedInvocationStates.push(
          persisted?.run.invocations.map(
            (invocation) => invocation.state.status,
          ) ?? [],
        );
        persistedContextSources.push(
          persisted?.run.contextItems.map((item) => item.sourceId) ?? [],
        );
        persistedDocumentVersions.push(persisted?.run.workspace.documentVersion ?? null);
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: request.capabilityId === "score.read-summary"
            ? { documentId: "score-1", documentVersion: 8, title: "练习曲", measureCount: 32 }
            : {
                documentId: "score-1",
                documentVersion: 8,
                title: "练习曲",
                authors: [],
                tempoBpm: 120,
              },
        };
      },
    },
    catalog,
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  const request = {
    ...approvalRunRequest(),
    intent: {
      kind: "read" as const,
      requestedCapabilityIds: ["score.read-summary", "score.read-metadata"],
      scope: "document" as const,
    },
    policy: {
      ...approvalRunRequest().policy,
      allowedCapabilityIds: ["score.read-summary", "score.read-metadata"],
      maxToolsPerTurn: 2,
    },
  };
  const waiting = await controller.run(request);
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  assert.deepEqual(approval.items.map((item) => item.capabilityId), ["score.read-summary"]);
  assert.deepEqual(waiting.run.invocations.map((invocation) => invocation.state.status), [
    "awaiting-approval",
    "validated",
  ]);

  const completed = await controller.continueWithApproval(
    request,
    waiting.run,
    { approvalId: approval.approvalId, kind: "capability-execution", outcome: "approved", decidedBy: "local-user" },
  );

  assert.deepEqual(requests.map((item) => item.capabilityId), [
    "score.read-summary",
    "score.read-metadata",
  ]);
  assert.deepEqual(persistedInvocationStates, [
    ["running", "validated"],
    ["succeeded", "running"],
  ]);
  assert.deepEqual(persistedContextSources, [[], ["score.read-summary"]]);
  assert.deepEqual(persistedDocumentVersions, [7, 8]);
  assert.deepEqual(completed.run.invocations.map((invocation) => invocation.state.status), [
    "succeeded",
    "succeeded",
  ]);
});

test("denied invocation is never dispatched and returns the Run to planning", async () => {
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
        contextSourceIds: ["approval:run-summary:turn-3"],
      },
      decision: { kind: "message", text: "已按你的决定停止这项操作。" },
    },
  ]);
  let invocationCalls = 0;
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke() {
        invocationCalls += 1;
        throw new Error("denied invocation must not execute");
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await controller.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);

  const denied = await controller.continueWithApproval(
    approvalRunRequest(),
    waiting.run,
    { approvalId: approval.approvalId, kind: "capability-execution", outcome: "denied", decidedBy: "local-user" },
  );

  assert.equal(invocationCalls, 0);
  assert.equal(denied.run.invocations[0]?.state.status, "rejected");
  assert.deepEqual(denied.run.invocations[0]?.events.map((event) => event.event.type), [
    "invocation.requested",
    "invocation.validated",
    "approval.required",
    "approval.denied",
  ]);
  assert.equal(denied.run.events.some((event) => event.event.type === "approval.denied"), true);
  const audit = getAgentApprovalAudit(denied.run, approval.approvalId);
  assert.equal(audit?.decision?.decidedBy, "local-user");
  assert.equal(audit?.requestedAt, 100);
  assert.equal(audit?.decidedAt, 100);
  assert.equal(audit?.executionOutcome, "denied");
  assert.equal(audit?.items[0]?.attemptCount, 0);
  assert.equal(audit?.items[0]?.finalStatus, "rejected");
  assert.equal(denied.response, "已按你的决定停止这项操作。");
  assert.deepEqual(denied.run.state, {
    lifecycle: "waiting",
    phase: "planning",
    waitReason: "user-input",
  });
});

test("approval refuses a stale document version before Capability dispatch", async () => {
  const provider = new FakeAgentProvider([{
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
  }]);
  let invocationCalls = 0;
  const controller = new AgentRunController({
    provider,
    capabilities: {
      async invoke() {
        invocationCalls += 1;
        throw new Error("stale approval must not execute");
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await controller.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);

  await assert.rejects(
    controller.continueWithApproval(
      {
        ...approvalRunRequest(),
        workspace: { ...approvalRunRequest().workspace, documentVersion: 8 },
      },
      waiting.run,
      { approvalId: approval.approvalId, kind: "capability-execution", outcome: "approved", decidedBy: "local-user" },
    ),
    (error: unknown) => error instanceof AgentRunResumeError
      && error.code === "approval-decision-mismatch",
  );
  assert.equal(invocationCalls, 0);
});

test("Run Store sequence CAS allows only one cross-process approval decision", async () => {
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
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text: "完成" },
    },
  ]);
  const store = new InMemoryAgentRunStore();
  let approvedCalls = 0;
  const winner = new AgentRunController({
    provider,
    capabilities: {
      async invoke(request) {
        approvedCalls += 1;
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 8, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await winner.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  const staleRun = waiting.run;

  const completed = await winner.continueWithApproval(
    approvalRunRequest(),
    staleRun,
    { approvalId: approval.approvalId, kind: "capability-execution", outcome: "approved", decidedBy: "local-user" },
  );
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.equal(approvedCalls, 1);

  let losingCalls = 0;
  const loser = new AgentRunController({
    provider: new FakeAgentProvider([]),
    capabilities: {
      async invoke() {
        losingCalls += 1;
        throw new Error("stale writer must not dispatch");
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  await assert.rejects(
    loser.continueWithApproval(
      approvalRunRequest(),
      staleRun,
      { approvalId: approval.approvalId, kind: "capability-execution", outcome: "denied", decidedBy: "local-user" },
    ),
    /sequence conflict/,
  );
  assert.equal(losingCalls, 0);
});

test("approved Invocation can be safely retried after a persisted pre-dispatch crash", async () => {
  const innerStore = new InMemoryAgentRunStore();
  let crashAfterApprovalCommit = true;
  const crashStore: AgentRunStorePort = {
    load: (runId) => innerStore.load(runId),
    listRecoverable: () => innerStore.listRecoverable(),
    quarantine: (runId) => innerStore.quarantine(runId),
    async commit(input: AgentRunStoreCommitInput): Promise<AgentRunStoreCommitResult> {
      const result = await innerStore.commit(input);
      if (crashAfterApprovalCommit
        && result.status === "committed"
        && input.event.event.type === "approval.approved") {
        crashAfterApprovalCommit = false;
        throw new Error("simulated process crash after approval commit");
      }
      return result;
    },
  };
  const approvalProvider = new FakeAgentProvider([{
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
  }]);
  let preCrashCapabilityCalls = 0;
  const approvalController = new AgentRunController({
    provider: approvalProvider,
    capabilities: {
      async invoke(): Promise<never> {
        preCrashCapabilityCalls += 1;
        throw new Error("Capability must not start before the simulated crash");
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store: crashStore,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await approvalController.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  await assert.rejects(
    approvalController.continueWithApproval(
      approvalRunRequest(),
      waiting.run,
      { approvalId: approval.approvalId, kind: "capability-execution", outcome: "approved", decidedBy: "local-user" },
    ),
    /simulated process crash/,
  );
  assert.equal(preCrashCapabilityCalls, 0);

  const crashed = await innerStore.load(waiting.run.runId);
  assert.ok(crashed);
  assert.equal(crashed.run.state.lifecycle, "active");
  assert.equal(crashed.run.invocations[0]?.state.status, "running");
  const recovery = new AgentRecoveryCoordinator({
    store: innerStore,
    receipts: { async lookup() { return { status: "not-started" }; } },
    now: () => 101,
    nextEventId: () => "event-recovery",
  });
  const retryAvailable = await recovery.recover(waiting.run.runId);
  assert.equal(retryAvailable.status, "retry-available");
  assert.ok(retryAvailable.status === "retry-available");

  let retryCapabilityCalls = 0;
  const retryController = new AgentRunController({
    provider: new FakeAgentProvider([{
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text: "恢复后的调用已完成。" },
    }]),
    capabilities: {
      async invoke(request) {
        retryCapabilityCalls += 1;
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store: innerStore,
    now: () => 102,
    nextId: idSource(),
  });
  const completed = await retryController.retryInvocation(
    approvalRunRequest(),
    retryAvailable.run,
    retryAvailable.invocationId,
  );

  assert.equal(retryCapabilityCalls, 1);
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.deepEqual(completed.run.invocations[0]?.events.map((event) => event.event.type), [
    "invocation.requested",
    "invocation.validated",
    "approval.required",
    "approval.granted",
    "invocation.dispatched",
    "invocation.started",
    "invocation.retry-authorized",
    "invocation.dispatched",
    "invocation.started",
    "invocation.succeeded",
  ]);
  const audit = getAgentApprovalAudit(completed.run, approval.approvalId);
  assert.equal(audit?.decision?.decidedBy, "local-user");
  assert.equal(audit?.requestedAt, 100);
  assert.equal(audit?.decidedAt, 100);
  assert.equal(audit?.executionOutcome, "succeeded");
  assert.equal(audit?.items[0]?.attemptCount, 2);
  assert.equal(audit?.items[0]?.retryCount, 1);
  assert.equal(projectAgentApprovalAudits(completed.run).length, 1);
});

test("Run Store sequence CAS rejects a duplicate retry before Capability dispatch", async () => {
  const store = new InMemoryAgentRunStore();
  const seedController = new AgentRunController({
    provider: new FakeAgentProvider([{
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
    }]),
    capabilities: { async invoke(): Promise<never> { throw new Error("not used"); } },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await seedController.run(approvalRunRequest());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  const invocation = waiting.run.invocations[0];
  assert.ok(invocation);
  const approvedInvocation = [
    { type: "approval.granted" as const },
    { type: "invocation.dispatched" as const },
    { type: "invocation.started" as const },
  ].reduce((record, event) => {
    const transition = reduceAgentInvocationState(record.state, event);
    assert.ok(transition.accepted);
    return {
      ...record,
      state: transition.state,
      events: [...record.events, {
        eventId: `seed-${record.events.length + 1}`,
        invocationId: record.invocationId,
        sequence: record.events.length + 1,
        occurredAt: 101,
        event,
      }],
    };
  }, invocation);
  const approvalTransition = reduceAgentRunState(waiting.run.state, {
    type: "approval.approved",
    decision: {
      approvalId: approval.approvalId,
      kind: "capability-execution",
      outcome: "approved",
      decidedBy: "local-user",
    },
  });
  assert.ok(approvalTransition.accepted);
  const recoveringTransition = reduceAgentRunState(approvalTransition.state, {
    type: "run.recovery-required",
    reason: "host-interrupted",
  });
  assert.ok(recoveringTransition.accepted);
  const latest = await store.load(waiting.run.runId);
  assert.ok(latest);
  const approvalEvent = {
    eventId: "seed-approval",
    runId: waiting.run.runId,
    sequence: latest.lastSequence + 1,
    occurredAt: 101,
    event: {
      type: "approval.approved" as const,
      decision: {
        approvalId: approval.approvalId,
        kind: "capability-execution" as const,
        outcome: "approved" as const,
        decidedBy: "local-user" as const,
      },
    },
  };
  const approvedRun = {
    ...waiting.run,
    state: approvalTransition.state,
    invocations: [approvedInvocation],
    events: [...waiting.run.events, approvalEvent],
  };
  const approvedCommit = await store.commit({
    runId: waiting.run.runId,
    expectedSequence: latest.lastSequence,
    event: approvalEvent,
    nextRun: approvedRun,
  });
  assert.equal(approvedCommit.status, "committed");
  assert.ok(approvedCommit.status === "committed");
  const recoveryEvent = {
    eventId: "seed-recovery",
    runId: waiting.run.runId,
    sequence: approvedCommit.entry.lastSequence + 1,
    occurredAt: 102,
    event: { type: "run.recovery-required" as const, reason: "host-interrupted" as const },
  };
  const recoveringRun = {
    ...approvedRun,
    state: recoveringTransition.state,
    events: [...approvedRun.events, recoveryEvent],
  };
  const recoveryCommit = await store.commit({
    runId: waiting.run.runId,
    expectedSequence: approvedCommit.entry.lastSequence,
    event: recoveryEvent,
    nextRun: recoveringRun,
  });
  assert.equal(recoveryCommit.status, "committed");
  assert.ok(recoveryCommit.status === "committed");
  const staleRun = recoveryCommit.entry.run;

  const createRetryController = (onInvoke: () => void, text: string) => new AgentRunController({
    provider: new FakeAgentProvider([{
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text },
    }]),
    capabilities: {
      async invoke(request) {
        onInvoke();
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    },
    catalog: approvalCatalog(),
    completionVerifier: verifyScoreSummaryCompletion,
    store,
    now: () => 103,
    nextId: idSource(),
  });
  let winnerCalls = 0;
  const winner = createRetryController(() => { winnerCalls += 1; }, "重试完成");
  await winner.retryInvocation(approvalRunRequest(), staleRun, invocation.invocationId);
  assert.equal(winnerCalls, 1);

  let loserCalls = 0;
  const loser = createRetryController(() => { loserCalls += 1; }, "不应执行");
  await assert.rejects(
    loser.retryInvocation(approvalRunRequest(), staleRun, invocation.invocationId),
    /sequence conflict/,
  );
  assert.equal(loserCalls, 0);
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
  await assert.rejects(
    controller.continueWithInput({
      ...measureRequest,
      workspace: selectedWorkspace,
    }, stored.run, {
      requestId: "stale-input-request",
      kind: "measure-selection",
      selection: selectedWorkspace.selection,
    }),
    (error: unknown) => error instanceof AgentRunResumeError
      && error.code === "provided-input-mismatch",
  );
  const completed = await controller.continueWithInput({
    ...measureRequest,
    workspace: selectedWorkspace,
  }, stored.run, {
    requestId: requiredInput.requestId,
    kind: "measure-selection",
    selection: selectedWorkspace.selection,
  });

  assert.equal(completed.run.runId, "run-selection");
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.equal(getAgentRunRequiredInput(completed.run), null);
  assert.equal(completed.run.workspace.documentVersion, 8);
  assert.deepEqual(invocationSelections, [null, selectedWorkspace.selection]);
  assert.equal(completed.run.events.filter((event) => event.event.type === "user-input.provided").length, 1);
  const consumption = getAgentUserInputConsumption(completed.run, requiredInput.requestId);
  assert.equal(consumption?.requiredInput.sourceInvocationId, requiredInput.sourceInvocationId);
  assert.deepEqual(consumption?.providedInput, {
    requestId: requiredInput.requestId,
    kind: "measure-selection",
    selection: selectedWorkspace.selection,
  });
  await assert.rejects(
    controller.continueWithInput({
      ...measureRequest,
      workspace: selectedWorkspace,
    }, stored.run, {
      requestId: requiredInput.requestId,
      kind: "measure-selection",
      selection: selectedWorkspace.selection,
    }),
    /sequence conflict/,
  );
  assert.equal(projectAgentUserInputConsumptions(
    (await store.load("run-selection"))?.run ?? completed.run,
  ).length, 1);
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
  const illegalProvidedInput = reduceAgentRunState(prepared.state, {
    type: "user-input.provided",
    input: {
      requestId: "input-without-request",
      kind: "measure-selection",
      selection: {
        kind: "measure-range",
        documentId: "score-1",
        documentVersion: 7,
        startMeasureId: "measure-1",
        endMeasureId: "measure-1",
      },
    },
  });
  assert.equal(illegalProvidedInput.accepted, false);
  const illegalRun = reduceAgentRunState(prepared.state, { type: "invocations.completed" });
  assert.equal(illegalRun.accepted, false);
  const illegalRetry = reduceAgentRunState(prepared.state, {
    type: "invocation.retry-authorized",
    invocationId: "invocation-1",
    authorizedBy: "local-user",
  });
  assert.equal(illegalRetry.accepted, false);

  const requested = reduceAgentInvocationState(null, { type: "invocation.requested" });
  assert.equal(requested.accepted, true);
  if (!requested.accepted) return;
  const illegalInvocation = reduceAgentInvocationState(requested.state, { type: "invocation.succeeded" });
  assert.equal(illegalInvocation.accepted, false);
  const illegalInvocationRetry = reduceAgentInvocationState(requested.state, {
    type: "invocation.retry-authorized",
  });
  assert.equal(illegalInvocationRetry.accepted, false);
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
    documentPrecondition: null,
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
