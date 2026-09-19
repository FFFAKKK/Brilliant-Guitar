import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRecoveryResult } from "../src/agent/recovery-coordinator.ts";
import { AgentRecoveryResumeError } from "../src/agent/recovery-coordinator.ts";
import type { AgentRecoveryCoordinatorPort } from "../src/agent/agent-recovery-session.ts";
import { AgentRecoverySession } from "../src/agent/agent-recovery-session.ts";
import type { AgentRunRecord } from "../src/agent/run-controller.ts";

function runRecord(lifecycle: "recovering" | "active" = "recovering"): AgentRunRecord {
  return {
    runId: "run-1",
    workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 7, selection: null },
    goal: "分析当前乐谱",
    state: lifecycle === "recovering"
      ? { lifecycle: "recovering", phase: "planning", recoveryReason: "host-interrupted" }
      : { lifecycle: "active", phase: "planning" },
    createdAt: 1,
    policy: { policyVersion: 1, allowedCapabilityIds: ["score.read-summary"], allowedKinds: ["query"],
      maxToolsPerTurn: 1, maxCostClass: "constant", exposeApprovalRequired: false },
    intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
    events: [],
    turns: [],
    invocations: [],
    contextItems: [],
  };
}

const readyResult = (): AgentRunRecoveryResult => ({
  status: "ready-to-resume",
  run: runRecord(),
  reason: "host-interrupted",
});

class FakeCoordinator implements AgentRecoveryCoordinatorPort {
  recoverCalls = 0;
  resumeCalls: string[] = [];
  results: readonly AgentRunRecoveryResult[] = [readyResult()];
  resumeError: Error | null = null;

  async recoverAll(): Promise<readonly AgentRunRecoveryResult[]> {
    this.recoverCalls += 1;
    return this.results;
  }

  async resume(runId: string): Promise<AgentRunRecord> {
    this.resumeCalls.push(runId);
    if (this.resumeError) throw this.resumeError;
    return runRecord("active");
  }
}

test("recovery session keeps browser hosts structurally unavailable", async () => {
  const session = new AgentRecoverySession(null, "desktop only");
  assert.deepEqual(session.getSnapshot(), {
    status: "unavailable",
    items: [],
    message: "desktop only",
  });
  await session.refresh();
  assert.equal(await session.resume("run-1"), false);
  assert.equal(session.getSnapshot().status, "unavailable");
});

test("recovery session publishes only UI recovery projections", async () => {
  const coordinator = new FakeCoordinator();
  const session = new AgentRecoverySession(coordinator);
  let notifications = 0;
  const unsubscribe = session.subscribe(() => { notifications += 1; });

  await session.refresh();

  assert.equal(coordinator.recoverCalls, 1);
  assert.equal(session.getSnapshot().status, "ready");
  assert.deepEqual(session.getSnapshot().items, [{
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "分析当前乐谱",
    kind: "ready-to-resume",
    state: { lifecycle: "recovering", phase: "planning", recoveryReason: "host-interrupted" },
    invocationId: null,
    requiredInput: null,
    action: "resume",
    message: "Agent 已完成恢复核对，可以继续",
    isBlocking: true,
  }]);
  assert.equal(notifications, 2);
  unsubscribe();
});

test("a resumed run is claimed by this host session and is not recovered again", async () => {
  const coordinator = new FakeCoordinator();
  const session = new AgentRecoverySession(coordinator);
  await session.refresh();

  assert.equal(await session.resume("run-1"), true);
  assert.deepEqual(coordinator.resumeCalls, ["run-1"]);
  assert.deepEqual(session.getSnapshot().items, []);
  assert.equal(session.getSnapshot().message, "控制状态已恢复，等待 Agent 执行器接管");

  await session.refresh();
  assert.equal(coordinator.recoverCalls, 2);
  assert.deepEqual(session.getSnapshot().items, []);
});

test("session refuses actions that are not projected as resume", async () => {
  const coordinator = new FakeCoordinator();
  coordinator.results = [{
    status: "retry-available",
    run: runRecord(),
    invocationId: "invocation-1",
  }];
  const session = new AgentRecoverySession(coordinator);
  await session.refresh();

  assert.equal(await session.resume("run-1"), false);
  assert.deepEqual(coordinator.resumeCalls, []);
  assert.equal(session.getSnapshot().status, "error");
  assert.equal(session.getSnapshot().message, "这个恢复项当前不能准备继续");
});

test("resume failures remain visible without discarding the recovery item", async () => {
  const coordinator = new FakeCoordinator();
  coordinator.resumeError = new AgentRecoveryResumeError(
    "invocation-reconciliation-required",
    "outstanding invocation",
  );
  const session = new AgentRecoverySession(coordinator);
  await session.refresh();

  assert.equal(await session.resume("run-1"), false);
  assert.equal(session.getSnapshot().status, "error");
  assert.equal(session.getSnapshot().message, "能力调用结果尚未核对，已阻止继续");
  assert.equal(session.getSnapshot().items[0]?.runId, "run-1");
});
