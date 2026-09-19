export type AgentProgressActivityKind =
  | "planning"
  | "reading"
  | "executing"
  | "validating"
  | "waiting"
  | "recovering";

interface AgentRunProgressBase {
  readonly runId: string;
  readonly turnId: string;
}

export type AgentRunProgressEvent =
  | (AgentRunProgressBase & {
      readonly type: "activity.started";
      readonly activityId: string;
      readonly kind: AgentProgressActivityKind;
      readonly label: string;
    })
  | (AgentRunProgressBase & {
      readonly type: "activity.completed";
      readonly activityId: string;
    })
  | (AgentRunProgressBase & {
      readonly type: "activity.failed";
      readonly activityId: string;
      readonly code: string;
    })
  | (AgentRunProgressBase & {
      readonly type: "activity.waiting";
      readonly activityId: string;
      readonly code: string;
    })
  | (AgentRunProgressBase & {
      readonly type: "activity.cancelled";
      readonly activityId: string;
    })
  | (AgentRunProgressBase & { readonly type: "message.started" })
  | (AgentRunProgressBase & { readonly type: "message.text-delta"; readonly delta: string })
  | (AgentRunProgressBase & { readonly type: "message.completed"; readonly content: string })
  | (AgentRunProgressBase & { readonly type: "message.failed"; readonly code: string })
  | (AgentRunProgressBase & { readonly type: "message.cancelled" });

export type AgentRunProgressObserver = (event: AgentRunProgressEvent) => void;

export function publishAgentRunProgress(
  observer: AgentRunProgressObserver | null,
  event: AgentRunProgressEvent,
  reportError: ((error: unknown) => void) | null = null,
): void {
  if (observer === null) return;
  try {
    observer(Object.freeze(event));
  } catch (error) {
    try {
      reportError?.(error);
    } catch {
      // Progress reporting is non-authoritative and must not change Run semantics.
    }
  }
}
