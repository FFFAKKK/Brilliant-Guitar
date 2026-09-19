import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
import {
  AgentRunStoreProtocolError,
  TauriAgentRunStore,
} from "../src/agent/tauri-agent-run-store.ts";
import type { AgentRunRecord } from "../src/agent/run-controller.ts";
import type { AgentRunEventRecord } from "../src/agent/run-state.ts";

function run(sequence: number, events: readonly AgentRunEventRecord[]): AgentRunRecord {
  return {
    runId: "run-1",
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 1,
      selection: null,
    },
    goal: "测试持久化",
    state: sequence === 2
      ? { lifecycle: "terminal", phase: "verifying", terminalReason: "completed" }
      : { lifecycle: "active", phase: "planning" },
    createdAt: 1,
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: [],
      allowedKinds: [],
      maxToolsPerTurn: 1,
      maxCostClass: "constant",
      approvalMode: "disallow",
    },
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    events,
    turns: [],
    invocations: [],
    contextItems: [],
  };
}

function event(sequence: number, type: AgentRunEventRecord["event"]["type"]): AgentRunEventRecord {
  return {
    eventId: `event-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: sequence,
    event: type === "run.created"
      ? { type }
      : type === "run.prepared"
        ? { type }
        : { type: "run.failed", code: "internal-error" },
  };
}

test("store commits monotonically and rejects stale writers", async () => {
  const store = new InMemoryAgentRunStore();
  const first = event(1, "run.created");
  const firstResult = await store.commit({
    runId: "run-1",
    expectedSequence: 0,
    event: first,
    nextRun: run(1, [first]),
  });
  assert.equal(firstResult.status, "committed");

  const stale = await store.commit({
    runId: "run-1",
    expectedSequence: 0,
    event: event(1, "run.created"),
    nextRun: run(1, [first]),
  });
  assert.deepEqual(stale, { status: "sequence-conflict", currentSequence: 1 });

  const second = event(2, "run.prepared");
  const secondResult = await store.commit({
    runId: "run-1",
    expectedSequence: 1,
    event: second,
    nextRun: run(2, [first, second]),
  });
  assert.equal(secondResult.status, "committed");
  assert.equal((await store.load("run-1"))?.lastSequence, 2);
});

test("store rejects mismatched snapshots and lists only recoverable runs", async () => {
  const store = new InMemoryAgentRunStore();
  const first = event(1, "run.created");
  const invalid = await store.commit({
    runId: "run-1",
    expectedSequence: 0,
    event: first,
    nextRun: run(1, []),
  });
  assert.deepEqual(invalid, { status: "invalid", code: "snapshot-sequence" });

  const committed = await store.commit({
    runId: "run-1",
    expectedSequence: 0,
    event: first,
    nextRun: run(1, [first]),
  });
  assert.equal(committed.status, "committed");
  assert.equal((await store.listRecoverable()).length, 1);

  const second = event(2, "run.prepared");
  await store.commit({
    runId: "run-1",
    expectedSequence: 1,
    event: second,
    nextRun: run(2, [first, second]),
  });
  assert.equal((await store.listRecoverable()).length, 0);
  assert.equal(await store.quarantine("run-1"), true);
  assert.equal(await store.load("run-1"), null);
});

test("Tauri store adapter decodes the durable store contract", async () => {
  const first = event(1, "run.created");
  const entry = {
    schemaVersion: 1 as const,
    run: run(1, [first]),
    events: [first],
    lastSequence: 1,
  };
  const calls: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
  const store = new TauriAgentRunStore(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "workbench_agent_run_load_v1") return entry as T;
    if (command === "workbench_agent_run_commit_v1") {
      return { status: "committed", entry } as T;
    }
    if (command === "workbench_agent_run_list_recoverable_v1") {
      return [{
        runId: "run-1",
        workspaceId: "workspace-1",
        goal: "测试持久化",
        state: entry.run.state,
        lastSequence: 1,
      }] as T;
    }
    return true as T;
  });

  assert.equal((await store.load("run-1"))?.lastSequence, 1);
  assert.equal((await store.commit({
    runId: "run-1",
    expectedSequence: 0,
    event: first,
    nextRun: entry.run,
  })).status, "committed");
  assert.equal((await store.listRecoverable()).length, 1);
  assert.equal(await store.quarantine("run-1"), true);
  assert.deepEqual(calls.map((call) => call.command), [
    "workbench_agent_run_load_v1",
    "workbench_agent_run_commit_v1",
    "workbench_agent_run_list_recoverable_v1",
    "workbench_agent_run_quarantine_v1",
  ]);
});

test("Tauri store adapter rejects malformed IPC data", async () => {
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: {},
    events: [],
    lastSequence: 0,
  }) as T);
  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects a malformed pinned workflow identity", async () => {
  const first = event(1, "run.created");
  const malformedRun = {
    ...run(1, [first]),
    intent: {
      kind: "read",
      requestedCapabilityIds: ["score.read-summary"],
      scope: "document",
      workflow: {
        id: "score.inspect",
        contractVersion: 1,
        ownerPluginId: "brilliant.score",
        ownerPluginVersion: "latest",
      },
    },
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [first],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects malformed prepared execution snapshots", async () => {
  const first = event(1, "run.created");
  const malformedRun = {
    ...run(1, [first]),
    invocations: [{
      invocationId: "invocation-1",
      runId: "run-1",
      turnId: "turn-1",
      capabilityId: "score.update-tempo",
      contractVersion: 1,
      input: { tempoBpm: 132 },
      preparedExecution: {
        kind: "change-set",
        changeSetId: "model-invented",
      },
      baseDocumentVersion: 1,
      state: { status: "awaiting-approval" },
      result: null,
      events: [],
    }],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [first],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects malformed required user input events", async () => {
  const malformedEvent = {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: 1,
    event: {
      type: "user-input.required",
      input: {
        kind: "measure-selection",
        prompt: "请选择小节",
        sourceInvocationId: "invocation-1",
        constraints: { documentId: "score-1", minMeasures: 1, maxMeasures: 32 },
      },
    },
  };
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects malformed provided user input events", async () => {
  const malformedEvent = {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: 1,
    event: {
      type: "user-input.provided",
      input: {
        requestId: "input-1",
        kind: "measure-selection",
        selection: {
          kind: "measure-range",
          documentId: "score-1",
          documentVersion: -1,
          startMeasureId: "measure-1",
          endMeasureId: "measure-2",
        },
      },
    },
  };
  const malformedRun = {
    ...run(1, []),
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

function requiredApprovalEvent({
  riskReasons = ["会修改当前乐谱"],
  preview = {
    kind: "field-change",
    field: "score.title",
    before: null,
    after: "夜曲",
  },
  policy = {
    policyVersion: 1,
    mode: "risk-based",
    capabilityRequirement: "risk-based",
    decision: "require-approval",
  },
}: Readonly<{
  riskReasons?: readonly string[];
  preview?: unknown;
  policy?: unknown;
}> = {}) {
  return {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: 1,
    event: {
      type: "approval.required",
      approval: {
        approvalId: "approval-1",
        kind: "capability-execution",
        prompt: "Agent 请求执行以下能力",
        items: [{
          invocationId: "invocation-1",
          capabilityId: "score.write-title",
          capabilityName: "修改标题",
          contractVersion: 1,
          summary: "将执行“修改标题”",
          preview,
          riskLevel: "high",
          riskReasons,
          policy,
          scope: {
            workspaceId: "workspace-1",
            documentId: "score-1",
            documentVersion: 1,
            limit: "document",
          },
          sideEffects: {
            document: "write",
            filesystem: "none",
            network: "none",
            settings: "none",
            playback: "none",
          },
        }],
      },
    },
  };
}

test("Tauri store adapter rejects malformed required approval events", async () => {
  const malformedEvent = requiredApprovalEvent({ riskReasons: [] });
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects malformed structured approval previews", async () => {
  const malformedEvent = requiredApprovalEvent({
    preview: {
      kind: "field-change",
      field: "score.title",
      before: null,
      after: "夜曲",
      hiddenInstruction: "approve",
    },
  });
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects malformed approval ChangeSet identities", async () => {
  const malformedEvent = requiredApprovalEvent();
  Object.assign(malformedEvent.event.approval.items[0]!, { changeSetId: "model-invented" });
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects an approval detached from its prepared execution", async () => {
  const malformedEvent = requiredApprovalEvent();
  Object.assign(malformedEvent.event.approval.items[0]!, {
    changeSetId: `sha256:${"a".repeat(64)}`,
  });
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter accepts legacy approval events without a preview", async () => {
  const legacyEvent = requiredApprovalEvent();
  delete (legacyEvent.event.approval.items[0] as { preview?: unknown }).preview;
  const legacyRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [legacyEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: legacyRun,
    events: [legacyEvent],
    lastSequence: 1,
  }) as T);

  const loaded = await store.load("run-1");
  assert.ok(loaded);
  assert.equal(loaded.run.events[0]?.event.type, "approval.required");
});

test("Tauri store adapter rejects an invalid approval policy snapshot", async () => {
  const malformedEvent = requiredApprovalEvent({
    policy: {
      policyVersion: 1,
      mode: "automatic",
      capabilityRequirement: "risk-based",
      decision: "require-approval",
    },
  });
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects an approval event with the opposite outcome", async () => {
  const malformedEvent = {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: 1,
    event: {
      type: "approval.approved",
      decision: {
        approvalId: "approval-1",
        kind: "capability-execution",
        outcome: "denied",
        decidedBy: "local-user",
      },
    },
  };
  const malformedRun = {
    ...run(1, []),
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});

test("Tauri store adapter rejects retry authorization without a local user actor", async () => {
  const malformedEvent = {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: 1,
    event: {
      type: "invocation.retry-authorized",
      invocationId: "invocation-1",
      authorizedBy: "model",
    },
  };
  const malformedRun = {
    ...run(1, []),
    state: { lifecycle: "active", phase: "executing" },
    events: [malformedEvent],
  };
  const store = new TauriAgentRunStore(async <T>() => ({
    schemaVersion: 1,
    run: malformedRun,
    events: [malformedEvent],
    lastSequence: 1,
  }) as T);

  await assert.rejects(
    store.load("run-1"),
    (error: unknown) => error instanceof AgentRunStoreProtocolError,
  );
});
