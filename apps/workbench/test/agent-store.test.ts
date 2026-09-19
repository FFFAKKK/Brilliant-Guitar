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
      exposeApprovalRequired: false,
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
