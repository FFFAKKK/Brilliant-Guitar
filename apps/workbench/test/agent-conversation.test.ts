import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentConversation,
  reduceAgentConversation,
  type AgentConversationEvent,
  type AgentConversationSnapshot,
} from "../src/agent/agent-conversation.ts";

function apply(snapshot: AgentConversationSnapshot, event: AgentConversationEvent): AgentConversationSnapshot {
  const result = reduceAgentConversation(snapshot, event);
  if (!result.accepted) assert.fail(result.message);
  return result.snapshot;
}

const startEvent: AgentConversationEvent = {
  type: "submission.started",
  submissionId: "submission-1",
  runId: "run-1",
  userMessageId: "message-user-1",
  assistantMessageId: "message-assistant-1",
  content: "Read the current score summary",
  occurredAt: 100,
};

test("conversation projects one submission through streaming, activity and completion", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "activity.started",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-read",
    kind: "reading",
    label: "Reading score summary",
  });
  snapshot = apply(snapshot, {
    type: "message.delta",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    delta: "The score has ",
  });
  snapshot = apply(snapshot, {
    type: "message.delta",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    delta: "32 measures.",
  });
  snapshot = apply(snapshot, {
    type: "activity.completed",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-read",
  });
  snapshot = apply(snapshot, {
    type: "submission.completed",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
  });

  assert.equal(snapshot.activeRunId, null);
  assert.equal(snapshot.composer.status, "ready");
  assert.deepEqual(snapshot.messages.map(({ role, status, content }) => ({ role, status, content })), [
    { role: "user", status: "completed", content: "Read the current score summary" },
    { role: "assistant", status: "completed", content: "The score has 32 measures." },
  ]);
  assert.equal(snapshot.activities[0]?.status, "completed");
});

test("conversation rejects stale events from an earlier run", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "submission.cancelled",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
  });
  snapshot = apply(snapshot, {
    type: "submission.started",
    submissionId: "submission-2",
    runId: "run-2",
    userMessageId: "message-user-2",
    assistantMessageId: "message-assistant-2",
    content: "Read it again",
    occurredAt: 200,
  });

  const result = reduceAgentConversation(snapshot, {
    type: "message.delta",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    delta: "late data",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "identity-mismatch");
  assert.equal(result.snapshot.messages.at(-1)?.content, "");
});

test("conversation never reuses an earlier submission or run identity", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "submission.cancelled",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
  });

  const reusedSubmission = reduceAgentConversation(snapshot, {
    ...startEvent,
    runId: "run-2",
    userMessageId: "message-user-2",
    assistantMessageId: "message-assistant-2",
  });
  const reusedRun = reduceAgentConversation(snapshot, {
    ...startEvent,
    submissionId: "submission-2",
    userMessageId: "message-user-2",
    assistantMessageId: "message-assistant-2",
  });

  assert.equal(reusedSubmission.accepted, false);
  assert.equal(reusedSubmission.code, "duplicate-id");
  assert.equal(reusedRun.accepted, false);
  assert.equal(reusedRun.code, "duplicate-id");
});

test("failure closes active activities and retains only a structured issue", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "activity.started",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-plan",
    kind: "planning",
    label: "Planning",
  });
  snapshot = apply(snapshot, {
    type: "submission.failed",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    issue: {
      code: "provider.unavailable",
      scope: "provider",
      retryable: true,
      message: "The model service is temporarily unavailable",
    },
  });

  assert.equal(snapshot.messages.at(-1)?.status, "failed");
  assert.equal(snapshot.activities.at(-1)?.status, "failed");
  assert.equal(snapshot.issue?.code, "provider.unavailable");
  assert.equal(snapshot.activeSubmissionId, null);
});

test("completion is rejected while a visible activity remains active", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "activity.started",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-validate",
    kind: "validating",
    label: "Validating result",
  });

  const result = reduceAgentConversation(snapshot, {
    type: "submission.completed",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.code, "invalid-transition");
  assert.equal(result.snapshot.activeRunId, "run-1");
});

test("a waiting activity keeps the submission active and can complete after input arrives", () => {
  let snapshot = apply(createAgentConversation("conversation-waiting"), startEvent);
  snapshot = apply(snapshot, {
    type: "activity.started",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-selection",
    kind: "reading",
    label: "读取所选小节",
  });
  snapshot = apply(snapshot, {
    type: "activity.waiting",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-selection",
  });

  assert.equal(snapshot.activities[0]?.status, "waiting");
  assert.equal(snapshot.activeRunId, "run-1");

  snapshot = apply(snapshot, {
    type: "activity.completed",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-selection",
  });
  snapshot = apply(snapshot, {
    type: "submission.completed",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    content: "已读取当前选择。",
  });

  assert.equal(snapshot.activities[0]?.status, "completed");
  assert.equal(snapshot.activeRunId, null);
});

test("conversation reconciles a streamed draft and records explicit activity failure", () => {
  let snapshot = apply(createAgentConversation("conversation-1"), startEvent);
  snapshot = apply(snapshot, {
    type: "message.delta",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    delta: "provisional text",
  });
  snapshot = apply(snapshot, {
    type: "message.draft-replaced",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    content: "validated draft",
  });
  snapshot = apply(snapshot, {
    type: "activity.started",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-read",
    kind: "reading",
    label: "Reading score summary",
  });
  snapshot = apply(snapshot, {
    type: "activity.failed",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-read",
  });

  assert.equal(snapshot.messages.at(-1)?.content, "validated draft");
  assert.equal(snapshot.messages.at(-1)?.status, "streaming");
  assert.equal(snapshot.activities.at(-1)?.status, "failed");
  assert.equal(snapshot.activeSubmissionId, "submission-1");
});
