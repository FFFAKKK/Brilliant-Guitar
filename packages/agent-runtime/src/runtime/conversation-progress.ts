import type { AgentConversationEvent } from "./agent-conversation.ts";
import type { AgentRunProgressEvent } from "./run-progress.ts";

export interface AgentConversationProgressTarget {
  readonly submissionId: string;
  readonly assistantMessageId: string;
}

export function projectRunProgressToConversation(
  event: AgentRunProgressEvent,
  target: AgentConversationProgressTarget,
): AgentConversationEvent | null {
  const identity = {
    submissionId: target.submissionId,
    runId: event.runId,
  } as const;

  if (event.type === "message.text-delta") return {
    type: "message.delta",
    ...identity,
    messageId: target.assistantMessageId,
    delta: event.delta,
  };
  if (event.type === "message.completed") return {
    type: "message.draft-replaced",
    ...identity,
    messageId: target.assistantMessageId,
    content: event.content,
  };
  if (event.type === "activity.started") return {
    type: "activity.started",
    ...identity,
    activityId: event.activityId,
    kind: event.kind,
    label: event.label,
  };
  if (event.type === "activity.completed") return {
    type: "activity.completed",
    ...identity,
    activityId: event.activityId,
  };
  if (event.type === "activity.failed") return {
    type: "activity.failed",
    ...identity,
    activityId: event.activityId,
  };
  if (event.type === "activity.waiting") return {
    type: "activity.waiting",
    ...identity,
    activityId: event.activityId,
  };
  if (event.type === "activity.cancelled") return {
    type: "activity.cancelled",
    ...identity,
    activityId: event.activityId,
  };

  // Message lifecycle progress is provisional. Only the authoritative Run outcome
  // may complete, fail, or cancel the visible submission.
  return null;
}
