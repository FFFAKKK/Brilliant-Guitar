import type { AgentProgressActivityKind } from "./run-progress.ts";

export type AgentConversationMessageRole = "user" | "assistant";

export type AgentConversationMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentConversationMessage {
  readonly messageId: string;
  readonly submissionId: string;
  readonly runId: string | null;
  readonly role: AgentConversationMessageRole;
  readonly status: AgentConversationMessageStatus;
  readonly content: string;
  readonly createdAt: number;
}

export type AgentConversationActivityKind = AgentProgressActivityKind;

export type AgentConversationActivityStatus = "active" | "waiting" | "completed" | "failed" | "cancelled";

export interface AgentConversationActivity {
  readonly activityId: string;
  readonly submissionId: string;
  readonly runId: string;
  readonly kind: AgentConversationActivityKind;
  readonly status: AgentConversationActivityStatus;
  readonly label: string;
}

export type AgentConversationIssueScope =
  | "conversation"
  | "submission"
  | "run"
  | "provider"
  | "capability";

export interface AgentConversationIssue {
  readonly code: string;
  readonly scope: AgentConversationIssueScope;
  readonly retryable: boolean;
  readonly message: string;
}

export interface AgentConversationComposer {
  readonly status: "ready" | "submitting" | "blocked";
  readonly message: string;
}

export interface AgentConversationSnapshot {
  readonly conversationId: string;
  readonly messages: readonly AgentConversationMessage[];
  readonly activities: readonly AgentConversationActivity[];
  readonly activeSubmissionId: string | null;
  readonly activeRunId: string | null;
  readonly composer: AgentConversationComposer;
  readonly issue: AgentConversationIssue | null;
}

export type AgentConversationEvent =
  | {
      readonly type: "submission.started";
      readonly submissionId: string;
      readonly runId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string;
      readonly content: string;
      readonly occurredAt: number;
    }
  | {
      readonly type: "message.delta";
      readonly submissionId: string;
      readonly runId: string;
      readonly messageId: string;
      readonly delta: string;
    }
  | {
      readonly type: "message.draft-replaced";
      readonly submissionId: string;
      readonly runId: string;
      readonly messageId: string;
      readonly content: string;
    }
  | {
      readonly type: "activity.started";
      readonly submissionId: string;
      readonly runId: string;
      readonly activityId: string;
      readonly kind: AgentConversationActivityKind;
      readonly label: string;
    }
  | {
      readonly type: "activity.completed";
      readonly submissionId: string;
      readonly runId: string;
      readonly activityId: string;
    }
  | {
      readonly type: "activity.failed";
      readonly submissionId: string;
      readonly runId: string;
      readonly activityId: string;
    }
  | {
      readonly type: "activity.waiting";
      readonly submissionId: string;
      readonly runId: string;
      readonly activityId: string;
    }
  | {
      readonly type: "activity.cancelled";
      readonly submissionId: string;
      readonly runId: string;
      readonly activityId: string;
    }
  | {
      readonly type: "submission.completed";
      readonly submissionId: string;
      readonly runId: string;
      readonly messageId: string;
      readonly content?: string;
    }
  | {
      readonly type: "submission.failed";
      readonly submissionId: string;
      readonly runId: string;
      readonly messageId: string;
      readonly issue: AgentConversationIssue;
    }
  | {
      readonly type: "submission.cancelled";
      readonly submissionId: string;
      readonly runId: string;
      readonly messageId: string;
    };

export type AgentConversationTransitionResult =
  | { readonly accepted: true; readonly snapshot: AgentConversationSnapshot }
  | {
      readonly accepted: false;
      readonly snapshot: AgentConversationSnapshot;
      readonly code: "invalid-transition" | "identity-mismatch" | "duplicate-id" | "invalid-content";
      readonly message: string;
    };

const READY_COMPOSER: AgentConversationComposer = Object.freeze({
  status: "ready",
  message: "Ready for a new task",
});

const SUBMITTING_COMPOSER: AgentConversationComposer = Object.freeze({
  status: "submitting",
  message: "Agent is working",
});

function freezeSnapshot(snapshot: AgentConversationSnapshot): AgentConversationSnapshot {
  return Object.freeze({
    ...snapshot,
    messages: Object.freeze(snapshot.messages.map((message) => Object.freeze({ ...message }))),
    activities: Object.freeze(snapshot.activities.map((activity) => Object.freeze({ ...activity }))),
    composer: Object.freeze(snapshot.composer),
    issue: snapshot.issue === null ? null : Object.freeze(snapshot.issue),
  });
}

export function createAgentConversation(conversationId: string): AgentConversationSnapshot {
  if (conversationId.trim().length === 0) throw new Error("Conversation ID is required");
  return freezeSnapshot({
    conversationId,
    messages: [],
    activities: [],
    activeSubmissionId: null,
    activeRunId: null,
    composer: READY_COMPOSER,
    issue: null,
  });
}

function reject(
  snapshot: AgentConversationSnapshot,
  event: AgentConversationEvent,
  code: Exclude<AgentConversationTransitionResult, { accepted: true }>["code"],
  detail: string,
): AgentConversationTransitionResult {
  return {
    accepted: false,
    snapshot,
    code,
    message: `Agent conversation cannot apply ${event.type}: ${detail}`,
  };
}

function matchesActiveSubmission(
  snapshot: AgentConversationSnapshot,
  event: Exclude<AgentConversationEvent, { type: "submission.started" }>,
): boolean {
  return snapshot.activeSubmissionId === event.submissionId && snapshot.activeRunId === event.runId;
}

function hasSurfaceIdentity(snapshot: AgentConversationSnapshot, identity: string): boolean {
  return snapshot.messages.some((message) => message.messageId === identity)
    || snapshot.activities.some((activity) => activity.activityId === identity);
}

function hasSubmissionIdentity(snapshot: AgentConversationSnapshot, submissionId: string): boolean {
  return snapshot.messages.some((message) => message.submissionId === submissionId)
    || snapshot.activities.some((activity) => activity.submissionId === submissionId);
}

function hasRunIdentity(snapshot: AgentConversationSnapshot, runId: string): boolean {
  return snapshot.messages.some((message) => message.runId === runId)
    || snapshot.activities.some((activity) => activity.runId === runId);
}

function updateAssistantMessage(
  snapshot: AgentConversationSnapshot,
  messageId: string,
  update: (message: AgentConversationMessage) => AgentConversationMessage,
): readonly AgentConversationMessage[] | null {
  let found = false;
  const messages = snapshot.messages.map((message) => {
    if (message.messageId !== messageId || message.role !== "assistant") return message;
    found = true;
    return update(message);
  });
  return found ? messages : null;
}

function finishActivities(
  snapshot: AgentConversationSnapshot,
  status: "completed" | "failed" | "cancelled",
): readonly AgentConversationActivity[] {
  return snapshot.activities.map((activity) => activity.submissionId === snapshot.activeSubmissionId
    && activity.runId === snapshot.activeRunId
    && (activity.status === "active" || activity.status === "waiting")
    ? { ...activity, status }
    : activity);
}

export function reduceAgentConversation(
  snapshot: AgentConversationSnapshot,
  event: AgentConversationEvent,
): AgentConversationTransitionResult {
  if (event.type === "submission.started") {
    if (snapshot.activeSubmissionId !== null || snapshot.activeRunId !== null) {
      return reject(snapshot, event, "invalid-transition", "another submission is active");
    }
    const content = event.content.trim();
    if (content.length === 0) return reject(snapshot, event, "invalid-content", "submission content is empty");
    const identities = [event.submissionId, event.runId, event.userMessageId, event.assistantMessageId];
    if (identities.some((identity) => identity.trim().length === 0)) {
      return reject(snapshot, event, "invalid-content", "submission identities are required");
    }
    if (event.userMessageId === event.assistantMessageId
      || hasSurfaceIdentity(snapshot, event.userMessageId)
      || hasSurfaceIdentity(snapshot, event.assistantMessageId)
      || hasSubmissionIdentity(snapshot, event.submissionId)
      || hasRunIdentity(snapshot, event.runId)) {
      return reject(snapshot, event, "duplicate-id", "submission identities must be unique");
    }
    return {
      accepted: true,
      snapshot: freezeSnapshot({
        ...snapshot,
        messages: [
          ...snapshot.messages,
          {
            messageId: event.userMessageId,
            submissionId: event.submissionId,
            runId: event.runId,
            role: "user",
            status: "completed",
            content,
            createdAt: event.occurredAt,
          },
          {
            messageId: event.assistantMessageId,
            submissionId: event.submissionId,
            runId: event.runId,
            role: "assistant",
            status: "pending",
            content: "",
            createdAt: event.occurredAt,
          },
        ],
        activeSubmissionId: event.submissionId,
        activeRunId: event.runId,
        composer: SUBMITTING_COMPOSER,
        issue: null,
      }),
    };
  }

  if (!matchesActiveSubmission(snapshot, event)) {
    return reject(snapshot, event, "identity-mismatch", "event does not belong to the active submission");
  }

  if (event.type === "message.delta") {
    if (event.delta.length === 0) return reject(snapshot, event, "invalid-content", "message delta is empty");
    const messages = updateAssistantMessage(snapshot, event.messageId, (message) => ({
      ...message,
      status: "streaming",
      content: `${message.content}${event.delta}`,
    }));
    if (messages === null) return reject(snapshot, event, "identity-mismatch", "assistant message was not found");
    return { accepted: true, snapshot: freezeSnapshot({ ...snapshot, messages }) };
  }

  if (event.type === "message.draft-replaced") {
    const messages = updateAssistantMessage(snapshot, event.messageId, (message) => ({
      ...message,
      status: event.content.length > 0 ? "streaming" : "pending",
      content: event.content,
    }));
    if (messages === null) return reject(snapshot, event, "identity-mismatch", "assistant message was not found");
    return { accepted: true, snapshot: freezeSnapshot({ ...snapshot, messages }) };
  }

  if (event.type === "activity.started") {
    if (event.activityId.trim().length === 0 || event.label.trim().length === 0) {
      return reject(snapshot, event, "invalid-content", "activity identity and label are required");
    }
    if (hasSurfaceIdentity(snapshot, event.activityId)) {
      return reject(snapshot, event, "duplicate-id", "activity identity must be unique");
    }
    return {
      accepted: true,
      snapshot: freezeSnapshot({
        ...snapshot,
        activities: [...snapshot.activities, {
          activityId: event.activityId,
          submissionId: event.submissionId,
          runId: event.runId,
          kind: event.kind,
          status: "active",
          label: event.label.trim(),
        }],
      }),
    };
  }

  if (event.type === "activity.completed"
    || event.type === "activity.waiting"
    || event.type === "activity.failed"
    || event.type === "activity.cancelled") {
    const status = event.type === "activity.completed"
      ? "completed" as const
      : event.type === "activity.waiting"
        ? "waiting" as const
      : event.type === "activity.failed"
        ? "failed" as const
        : "cancelled" as const;
    let found = false;
    const activities = snapshot.activities.map((activity) => {
      if (activity.activityId !== event.activityId
        || activity.submissionId !== event.submissionId
        || activity.runId !== event.runId
        || (activity.status !== "active"
          && !(event.type === "activity.completed" && activity.status === "waiting"))) return activity;
      found = true;
      return { ...activity, status };
    });
    if (!found) return reject(snapshot, event, "invalid-transition", "active activity was not found");
    return { accepted: true, snapshot: freezeSnapshot({ ...snapshot, activities }) };
  }

  if (event.type === "submission.completed") {
    const messages = updateAssistantMessage(snapshot, event.messageId, (message) => ({
      ...message,
      status: "completed",
      content: event.content ?? message.content,
    }));
    if (messages === null) return reject(snapshot, event, "identity-mismatch", "assistant message was not found");
    if (snapshot.activities.some((activity) => activity.submissionId === event.submissionId
      && activity.runId === event.runId && activity.status === "active")) {
      return reject(snapshot, event, "invalid-transition", "an activity is still active");
    }
    return {
      accepted: true,
      snapshot: freezeSnapshot({
        ...snapshot,
        messages,
        activities: finishActivities(snapshot, "completed"),
        activeSubmissionId: null,
        activeRunId: null,
        composer: READY_COMPOSER,
        issue: null,
      }),
    };
  }

  if (event.type === "submission.failed") {
    const messages = updateAssistantMessage(snapshot, event.messageId, (message) => ({
      ...message,
      status: "failed",
    }));
    if (messages === null) return reject(snapshot, event, "identity-mismatch", "assistant message was not found");
    return {
      accepted: true,
      snapshot: freezeSnapshot({
        ...snapshot,
        messages,
        activities: finishActivities(snapshot, "failed"),
        activeSubmissionId: null,
        activeRunId: null,
        composer: READY_COMPOSER,
        issue: event.issue,
      }),
    };
  }

  const messages = updateAssistantMessage(snapshot, event.messageId, (message) => ({
    ...message,
    status: "cancelled",
  }));
  if (messages === null) return reject(snapshot, event, "identity-mismatch", "assistant message was not found");
  return {
    accepted: true,
    snapshot: freezeSnapshot({
      ...snapshot,
      messages,
      activities: finishActivities(snapshot, "cancelled"),
      activeSubmissionId: null,
      activeRunId: null,
      composer: READY_COMPOSER,
      issue: null,
    }),
  };
}
