import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentTaskHistoryEntry,
  projectAgentTaskHistoryContext,
} from "../src/agent/task-history.ts";

const workspace = {
  workspaceId: "workspace-1",
  documentId: "score-1",
  documentVersion: 7,
  selection: null,
};

test("task history stores a compact derived summary instead of the conversation object", () => {
  const entry = createAgentTaskHistoryEntry({
    submissionId: "submission:run-1",
    runId: "run-1",
    goal: `读取   ${"标题".repeat(240)}`,
    state: { lifecycle: "terminal", phase: "verifying", terminalReason: "completed" },
    response: `结果 ${"完成".repeat(500)}`,
    workspace,
    completedAt: 10,
  });

  assert.ok(entry);
  assert.equal(entry.goal.length <= 400, true);
  assert.equal((entry.response?.length ?? 0) <= 800, true);
  const context = projectAgentTaskHistoryContext([entry], workspace);
  assert.equal(context[0]?.kind, "task-history");
  assert.equal(context[0]?.trustLevel, "derived");
  assert.equal(context[0]?.priority, "low");
  assert.equal(context[0]?.documentVersion, 7);
});

test("failed task history keeps only a stable failure classification", () => {
  const entry = createAgentTaskHistoryEntry({
    submissionId: "submission:run-failed",
    runId: "run-failed",
    goal: "读取概要",
    state: {
      lifecycle: "terminal",
      phase: "verifying",
      terminalReason: "failed",
      failureCode: "completion-rejected",
    },
    response: "不应保存的流式草稿",
    workspace,
    completedAt: 11,
  });

  assert.deepEqual(entry, {
    submissionId: "submission:run-failed",
    runId: "run-failed",
    goal: "读取概要",
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 7,
    completedAt: 11,
    outcome: "failed",
    response: null,
    failureCode: "completion-rejected",
  });
  assert.equal(JSON.stringify(projectAgentTaskHistoryContext(entry === null ? [] : [entry], workspace))
    .includes("不应保存"), false);
});

test("task history does not cross workspace or document boundaries implicitly", () => {
  const entry = createAgentTaskHistoryEntry({
    submissionId: "submission:run-other-document",
    runId: "run-other-document",
    goal: "读取另一份乐谱",
    state: { lifecycle: "terminal", phase: "verifying", terminalReason: "completed" },
    response: "另一份乐谱的结果",
    workspace,
    completedAt: 12,
  });

  assert.ok(entry);
  assert.deepEqual(projectAgentTaskHistoryContext([entry], {
    ...workspace,
    documentId: "score-2",
  }), []);
  assert.deepEqual(projectAgentTaskHistoryContext([entry], {
    ...workspace,
    workspaceId: "workspace-2",
  }), []);
});

test("cancelled and non-terminal tasks never enter model history", () => {
  assert.equal(createAgentTaskHistoryEntry({
    submissionId: "submission:run-cancelled",
    runId: "run-cancelled",
    goal: "读取概要",
    state: { lifecycle: "terminal", phase: "planning", terminalReason: "cancelled" },
    response: "取消前草稿",
    workspace,
    completedAt: 12,
  }), null);
  assert.equal(createAgentTaskHistoryEntry({
    submissionId: "submission:run-waiting",
    runId: "run-waiting",
    goal: "读取概要",
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    response: "等待时草稿",
    workspace,
    completedAt: 13,
  }), null);
});
