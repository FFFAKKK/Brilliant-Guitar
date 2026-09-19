import assert from "node:assert/strict";
import test from "node:test";

import { projectRunProgressToConversation } from "../src/agent/conversation-progress.ts";

const target = {
  submissionId: "submission-1",
  assistantMessageId: "message-assistant-1",
};

test("run progress projects only stable product events into conversation events", () => {
  assert.deepEqual(projectRunProgressToConversation({
    type: "message.text-delta",
    runId: "run-1",
    turnId: "turn-1",
    delta: "hello",
  }, target), {
    type: "message.delta",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    delta: "hello",
  });

  assert.deepEqual(projectRunProgressToConversation({
    type: "message.completed",
    runId: "run-1",
    turnId: "turn-1",
    content: "final draft",
  }, target), {
    type: "message.draft-replaced",
    submissionId: "submission-1",
    runId: "run-1",
    messageId: "message-assistant-1",
    content: "final draft",
  });

  assert.deepEqual(projectRunProgressToConversation({
    type: "activity.failed",
    runId: "run-1",
    turnId: "turn-1",
    activityId: "activity-1",
    code: "capability-failed",
  }, target), {
    type: "activity.failed",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-1",
  });

  assert.deepEqual(projectRunProgressToConversation({
    type: "activity.waiting",
    runId: "run-1",
    turnId: "turn-1",
    activityId: "activity-2",
    code: "selection-unavailable",
  }, target), {
    type: "activity.waiting",
    submissionId: "submission-1",
    runId: "run-1",
    activityId: "activity-2",
  });
});

test("provisional message lifecycle events cannot settle a conversation submission", () => {
  assert.equal(projectRunProgressToConversation({
    type: "message.started",
    runId: "run-1",
    turnId: "turn-1",
  }, target), null);
  assert.equal(projectRunProgressToConversation({
    type: "message.failed",
    runId: "run-1",
    turnId: "turn-1",
    code: "provider-failed",
  }, target), null);
  assert.equal(projectRunProgressToConversation({
    type: "message.cancelled",
    runId: "run-1",
    turnId: "turn-1",
  }, target), null);
});
