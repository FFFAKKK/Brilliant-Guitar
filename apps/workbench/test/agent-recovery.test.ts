import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityResult } from "../src/contracts/capability.ts";
import type { AgentRequiredApproval, AgentRunState } from "../src/agent/agent-contracts.ts";
import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
import { reduceAgentInvocationState } from "../src/agent/invocation-state.ts";
import type {
  AgentInvocationEvent,
  AgentInvocationEventRecord,
} from "../src/agent/invocation-state.ts";
import {
  AgentRecoveryResumeError,
  AgentRecoveryCoordinator,
} from "../src/agent/recovery-coordinator.ts";
import type {
  AgentInvocationReceiptLookup,
  AgentInvocationReceiptPort,
} from "../src/agent/recovery-coordinator.ts";
import type { AgentInvocationRecord, AgentRunRecord } from "../src/agent/run-controller.ts";
import { reduceAgentRunState } from "../src/agent/run-state.ts";
import type { AgentRunEvent, AgentRunEventRecord } from "../src/agent/run-state.ts";
import { projectRecovery } from "../src/agent/recovery-projection.ts";
import {
  AgentInvocationReceiptProtocolError,
  TauriAgentInvocationReceiptPort,
} from "../src/agent/tauri-invocation-receipt.ts";

function invocation(events: readonly AgentInvocationEvent[]): AgentInvocationRecord {
  let state: AgentInvocationRecord["state"] | null = null;
  const records: AgentInvocationEventRecord[] = [];
  for (const event of events) {
    const transition = reduceAgentInvocationState(state, event);
    if (!transition.accepted) throw new Error(transition.message);
    assert.equal(transition.accepted, true);
    state = transition.state;
    records.push({
      eventId: `invocation-event-${records.length + 1}`,
      invocationId: "invocation-1",
      sequence: records.length + 1,
      occurredAt: records.length + 1,
      event,
    });
  }
  if (state === null) throw new Error("invocation was not created");
  return {
    invocationId: "invocation-1",
    runId: "run-1",
    turnId: "turn-1",
    capabilityId: "score.read-summary",
    contractVersion: 1,
    input: {},
    baseDocumentVersion: 7,
    state,
    result: null,
    events: records,
  };
}

function baseRun(state: AgentRunState, events: readonly AgentRunEventRecord[]): AgentRunRecord {
  return {
    runId: "run-1",
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 7,
      selection: null,
    },
    goal: "读取当前乐谱概要",
    state,
    createdAt: 1,
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: ["score.read-summary"],
      allowedKinds: ["query"],
      maxToolsPerTurn: 1,
      maxCostClass: "constant",
      approvalMode: "disallow",
    },
    intent: {
      kind: "read",
      requestedCapabilityIds: ["score.read-summary"],
      scope: "document",
    },
    events,
    turns: [],
    invocations: [],
    contextItems: [],
  };
}

async function seedRun(
  store: InMemoryAgentRunStore,
  events: readonly AgentRunEvent[],
  invocationRecord: AgentInvocationRecord | null = null,
): Promise<void> {
  let state: AgentRunState | null = null;
  const records: AgentRunEventRecord[] = [];
  for (const event of events) {
    const transition = reduceAgentRunState(state, event);
    if (!transition.accepted) throw new Error(transition.message);
    assert.equal(transition.accepted, true);
    state = transition.state;
    const record: AgentRunEventRecord = {
      eventId: `run-event-${records.length + 1}`,
      runId: "run-1",
      sequence: records.length + 1,
      occurredAt: records.length + 1,
      event,
    };
    records.push(record);
    const run = {
      ...baseRun(state, [...records]),
      invocations: invocationRecord === null ? [] : [invocationRecord],
    };
    const committed = await store.commit({
      runId: "run-1",
      expectedSequence: record.sequence - 1,
      event: record,
      nextRun: run,
    });
    assert.equal(committed.status, "committed");
  }
}

class FakeReceiptPort implements AgentInvocationReceiptPort {
  calls = 0;
  value: AgentInvocationReceiptLookup;

  constructor(value: AgentInvocationReceiptLookup) {
    this.value = value;
  }

  async lookup(): Promise<AgentInvocationReceiptLookup> {
    this.calls += 1;
    return this.value;
  }
}

function coordinator(store: InMemoryAgentRunStore, receipts: FakeReceiptPort) {
  let event = 0;
  return new AgentRecoveryCoordinator({
    store,
    receipts,
    now: () => 100,
    nextEventId: () => `recovery-event-${++event}`,
  });
}

const completedResult: CapabilityResult<unknown> = {
  status: "completed",
  invocationId: "invocation-1",
  capabilityId: "score.read-summary",
  contractVersion: 1,
  data: {
    documentId: "score-1",
    documentVersion: 7,
    title: "练习曲",
    measureCount: 32,
  },
};

const requiredApproval: AgentRequiredApproval = {
  approvalId: "approval-1",
  kind: "capability-execution",
  prompt: "Agent 请求执行以下能力",
  items: [{
    invocationId: "invocation-1",
    capabilityId: "score.read-summary",
    capabilityName: "读取乐谱概要",
    contractVersion: 1,
    summary: "将执行“读取乐谱概要”",
    preview: null,
    riskLevel: "low",
    riskReasons: ["该能力需要显式确认后才能执行"],
    policy: {
      policyVersion: 1,
      mode: "risk-based",
      capabilityRequirement: "always",
      decision: "require-approval",
    },
    scope: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 7,
      limit: "document",
    },
    sideEffects: {
      document: "read",
      filesystem: "none",
      network: "none",
      settings: "none",
      playback: "none",
    },
  }],
};

test("an interrupted planning run becomes recoverable without asking the model", async () => {
  const store = new InMemoryAgentRunStore();
  await seedRun(store, [{ type: "run.created" }, { type: "run.prepared" }]);
  const receipts = new FakeReceiptPort({ status: "unavailable", message: "unused" });
  const recovery = coordinator(store, receipts);

  const result = await recovery.recover("run-1");

  assert.equal(result.status, "ready-to-resume");
  if (result.status !== "ready-to-resume") return;
  assert.deepEqual(result.run.state, {
    lifecycle: "recovering",
    phase: "planning",
    recoveryReason: "host-interrupted",
  });
  assert.equal(receipts.calls, 0);

  const resumed = await recovery.resume("run-1");
  assert.deepEqual(resumed.state, { lifecycle: "active", phase: "planning" });
  assert.equal(resumed.events.at(-1)?.event.type, "run.resumed");
});

test("resume normalizes interrupted preparing and verifying checkpoints to planning", async () => {
  const cases: ReadonlyArray<{
    events: readonly AgentRunEvent[];
    suffix: readonly AgentRunEvent["type"][];
  }> = [
    {
      events: [{ type: "run.created" }],
      suffix: ["run.resumed", "run.prepared"],
    },
    {
      events: [
        { type: "run.created" },
        { type: "run.prepared" },
        { type: "turn.finish-requested" },
      ],
      suffix: ["run.resumed", "verification.continue"],
    },
  ];

  for (const item of cases) {
    const store = new InMemoryAgentRunStore();
    await seedRun(store, item.events);
    const recovery = coordinator(
      store,
      new FakeReceiptPort({ status: "unavailable", message: "unused" }),
    );
    const recovered = await recovery.recover("run-1");
    assert.equal(recovered.status, "ready-to-resume");

    const resumed = await recovery.resume("run-1");
    assert.deepEqual(resumed.state, { lifecycle: "active", phase: "planning" });
    assert.deepEqual(
      resumed.events.slice(-item.suffix.length).map((event) => event.event.type),
      item.suffix,
    );
  }
});

test("waiting approval is re-emitted instead of being auto-approved", async () => {
  const store = new InMemoryAgentRunStore();
  const pending = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "approval.required" },
  ]);
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "approval.required", approval: requiredApproval },
  ], pending);
  const receipts = new FakeReceiptPort({ status: "unavailable", message: "unused" });

  const result = await coordinator(store, receipts).recover("run-1");

  assert.equal(result.status, "awaiting-user");
  assert.equal(result.status === "awaiting-user" && result.waitReason, "approval");
  assert.equal(receipts.calls, 0);
  assert.deepEqual(projectRecovery(result), {
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "读取当前乐谱概要",
    kind: "awaiting-user",
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    invocationId: "invocation-1",
    requiredInput: null,
    requiredApproval,
    action: "approve",
    message: "Agent 正在等待你的批准",
    isBlocking: true,
  });
});

test("recovery projection rebuilds the persisted required input contract", async () => {
  const store = new InMemoryAgentRunStore();
  const requiredInput = {
    requestId: "input-selection-1",
    kind: "measure-selection" as const,
    prompt: "请在当前乐谱中选择要读取的小节",
    sourceInvocationId: "invocation-1",
    constraints: { documentId: "score-1", minMeasures: 1, maxMeasures: 32 },
  };
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "invocation.dispatched", invocationId: "invocation-1", capabilityId: "score.read-measures" },
    { type: "invocation.outcome-recorded", invocationId: "invocation-1", status: "rejected" },
    { type: "user-input.required", input: requiredInput },
  ]);

  const result = await coordinator(
    store,
    new FakeReceiptPort({ status: "unavailable", message: "unused" }),
  ).recover("run-1");

  assert.equal(result.status, "awaiting-user");
  assert.deepEqual(projectRecovery(result), {
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "读取当前乐谱概要",
    kind: "awaiting-user",
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    invocationId: "invocation-1",
    requiredInput,
    requiredApproval: null,
    action: "provide-input",
    message: requiredInput.prompt,
    isBlocking: true,
  });
});

test("a resolved receipt restores the original invocation without dispatching it again", async () => {
  const store = new InMemoryAgentRunStore();
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "invocation.dispatched", invocationId: "invocation-1", capabilityId: "score.read-summary" },
  ], running);
  const receipts = new FakeReceiptPort({ status: "resolved", result: completedResult });

  const recovery = coordinator(store, receipts);
  const result = await recovery.recover("run-1");

  assert.equal(result.status, "ready-to-resume");
  if (result.status !== "ready-to-resume") return;
  assert.equal(result.reason, "invocation-resolved");
  assert.equal(result.run.invocations[0]?.state.status, "succeeded");
  assert.deepEqual(result.run.invocations[0]?.result, completedResult);
  assert.equal(result.run.state.lifecycle, "recovering");
  assert.deepEqual(result.run.events.slice(-2).map((item) => item.event.type), [
    "invocation.outcome-recorded",
    "run.recovery-required",
  ]);
  assert.equal(receipts.calls, 1);

  const resumed = await recovery.resume("run-1");
  assert.deepEqual(resumed.state, { lifecycle: "active", phase: "planning" });
  assert.deepEqual(resumed.events.slice(-3).map((item) => item.event.type), [
    "run.resumed",
    "invocations.completed",
    "verification.continue",
  ]);
});

test("an unknown outcome stays reconcilable and can later resolve", async () => {
  const store = new InMemoryAgentRunStore();
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "invocation.dispatched", invocationId: "invocation-1", capabilityId: "score.read-summary" },
  ], running);
  const receipts = new FakeReceiptPort({ status: "started" });
  const recovery = coordinator(store, receipts);

  const uncertain = await recovery.recover("run-1");
  assert.equal(uncertain.status, "reconciliation-required");
  assert.equal(uncertain.status === "reconciliation-required"
    && uncertain.run.invocations[0]?.state.status, "outcome-unknown");

  receipts.value = { status: "resolved", result: completedResult };
  const resolved = await recovery.recover("run-1");
  assert.equal(resolved.status, "ready-to-resume");
  assert.equal(resolved.status === "ready-to-resume"
    && resolved.run.invocations[0]?.state.status, "succeeded");
});

test("an input identity conflict blocks automatic recovery and stays visible to the UI", async () => {
  const store = new InMemoryAgentRunStore();
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "invocation.dispatched", invocationId: "invocation-1", capabilityId: "score.read-summary" },
  ], running);
  const result = await coordinator(
    store,
    new FakeReceiptPort({ status: "identity-conflict", message: "input hash mismatch" }),
  ).recover("run-1");

  assert.equal(result.status, "reconciliation-required");
  if (result.status !== "reconciliation-required") return;
  assert.equal(result.receiptStatus, "identity-conflict");
  assert.equal(result.run.state.lifecycle, "recovering");
  assert.equal(projectRecovery(result).message, "能力调用身份发生冲突，已阻止自动恢复");
});

test("a receipt proving no execution makes retry available but never retries automatically", async () => {
  const store = new InMemoryAgentRunStore();
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  await seedRun(store, [
    { type: "run.created" },
    { type: "run.prepared" },
    { type: "turn.tools-accepted" },
    { type: "invocation.dispatched", invocationId: "invocation-1", capabilityId: "score.read-summary" },
  ], running);
  const receipts = new FakeReceiptPort({ status: "not-started" });

  const result = await coordinator(store, receipts).recover("run-1");

  assert.equal(result.status, "retry-available");
  assert.equal(result.status === "retry-available" && result.invocationId, "invocation-1");
  assert.equal(result.status === "retry-available"
    && result.run.invocations[0]?.state.status, "running");
  assert.equal(result.status === "retry-available" && result.run.state.lifecycle, "recovering");
});

test("recovery projection exposes explicit user actions instead of implementation details", async () => {
  const store = new InMemoryAgentRunStore();
  await seedRun(store, [{ type: "run.created" }, { type: "run.prepared" }]);
  const result = await coordinator(
    store,
    new FakeReceiptPort({ status: "unavailable", message: "unused" }),
  ).recover("run-1");

  assert.deepEqual(projectRecovery(result), {
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "读取当前乐谱概要",
    kind: "ready-to-resume",
    state: { lifecycle: "recovering", phase: "planning", recoveryReason: "host-interrupted" },
    invocationId: null,
    requiredInput: null,
    requiredApproval: null,
    action: "resume",
    message: "Agent 已完成恢复核对，可以继续",
    isBlocking: true,
  });
});

test("resume refuses missing, non-recovering and unresolved runs", async () => {
  const store = new InMemoryAgentRunStore();
  const recovery = coordinator(
    store,
    new FakeReceiptPort({ status: "unavailable", message: "unused" }),
  );
  await assert.rejects(
    recovery.resume("missing"),
    (error: unknown) => error instanceof AgentRecoveryResumeError
      && error.code === "run-missing",
  );

  await seedRun(store, [{ type: "run.created" }, { type: "run.prepared" }]);
  await assert.rejects(
    recovery.resume("run-1"),
    (error: unknown) => error instanceof AgentRecoveryResumeError
      && error.code === "run-not-recovering",
  );
});

test("Tauri receipt adapter decodes host receipts and keeps host failure recoverable", async () => {
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
  const port = new TauriAgentInvocationReceiptPort(async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    calls.push({ command, args });
    return { status: "resolved", result: completedResult } as T;
  });
  const workspace = {
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 1,
    selection: null,
  } as const;

  const result = await port.lookup({
    runId: "run-1",
    workspace,
    invocation: running,
  });
  assert.deepEqual(result, { status: "resolved", result: completedResult });
  assert.deepEqual(calls, [{
    command: "workbench_agent_invocation_receipt_v1",
    args: {
      request: {
        invocationId: "invocation-1",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        workspaceId: "workspace-1",
        documentPrecondition: { documentId: "score-1", documentVersion: 1 },
        input: {},
      },
    },
  }]);

  const unavailable = new TauriAgentInvocationReceiptPort(async () => {
    throw new Error("host offline");
  });
  assert.deepEqual(await unavailable.lookup({
    runId: "run-1",
    workspace,
    invocation: running,
  }), { status: "unavailable", message: "host offline" });

  const conflict = new TauriAgentInvocationReceiptPort(async () => {
    throw {
      message: "能力调用回执与原调用不一致",
      status: 409,
      issue: { code: "capability-receipt.identity-conflict" },
    };
  });
  assert.deepEqual(await conflict.lookup({
    runId: "run-1",
    workspace,
    invocation: running,
  }), {
    status: "identity-conflict",
    message: "能力调用回执与原调用不一致",
  });
});

test("Tauri receipt adapter rejects malformed successful IPC data", async () => {
  const running = invocation([
    { type: "invocation.requested" },
    { type: "invocation.validated" },
    { type: "invocation.dispatched" },
    { type: "invocation.started" },
  ]);
  const port = new TauriAgentInvocationReceiptPort(async <T>() => ({
    status: "resolved",
    result: { status: "completed" },
  }) as T);

  await assert.rejects(port.lookup({
    runId: "run-1",
    workspace: {
      workspaceId: "workspace-1",
      documentId: null,
      documentVersion: null,
      selection: null,
    },
    invocation: running,
  }), (error: unknown) => error instanceof AgentInvocationReceiptProtocolError);
});
