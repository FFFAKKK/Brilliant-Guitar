export type AgentInvocationStatus =
  | "requested"
  | "validated"
  | "awaiting-approval"
  | "dispatched"
  | "running"
  | "succeeded"
  | "rejected"
  | "cancelled"
  | "timed-out"
  | "failed"
  | "outcome-unknown";

export interface AgentInvocationState {
  readonly status: AgentInvocationStatus;
}

export type AgentInvocationEvent =
  | { readonly type: "invocation.requested" }
  | { readonly type: "invocation.validated" }
  | { readonly type: "approval.required" }
  | { readonly type: "approval.granted" }
  | { readonly type: "approval.denied" }
  | { readonly type: "invocation.retry-authorized" }
  | { readonly type: "invocation.dispatched" }
  | { readonly type: "invocation.started" }
  | { readonly type: "invocation.succeeded" }
  | { readonly type: "invocation.rejected" }
  | { readonly type: "invocation.cancelled" }
  | { readonly type: "invocation.timed-out" }
  | { readonly type: "invocation.failed" }
  | { readonly type: "invocation.outcome-unknown" };

export interface AgentInvocationEventRecord {
  readonly eventId: string;
  readonly invocationId: string;
  readonly sequence: number;
  readonly occurredAt: number;
  readonly event: AgentInvocationEvent;
}

export type AgentInvocationTransitionResult =
  | { readonly accepted: true; readonly state: AgentInvocationState }
  | {
      readonly accepted: false;
      readonly state: AgentInvocationState | null;
      readonly code: "invalid-transition";
      readonly message: string;
    };

const TERMINAL = new Set<AgentInvocationStatus>([
  "succeeded",
  "rejected",
  "cancelled",
  "timed-out",
  "failed",
]);

function reject(
  state: AgentInvocationState | null,
  event: AgentInvocationEvent,
): AgentInvocationTransitionResult {
  return {
    accepted: false,
    state,
    code: "invalid-transition",
    message: `Capability Invocation cannot apply ${event.type} from ${state?.status ?? "not-created"}`,
  };
}

export function reduceAgentInvocationState(
  state: AgentInvocationState | null,
  event: AgentInvocationEvent,
): AgentInvocationTransitionResult {
  if (state === null) return event.type === "invocation.requested"
    ? { accepted: true, state: { status: "requested" } }
    : reject(state, event);
  if (TERMINAL.has(state.status)) return reject(state, event);

  if (event.type === "invocation.cancelled") return {
    accepted: true,
    state: { status: "cancelled" },
  };
  if (event.type === "invocation.failed") return {
    accepted: true,
    state: { status: "failed" },
  };
  if (event.type === "invocation.timed-out") return {
    accepted: true,
    state: { status: "timed-out" },
  };
  if (event.type === "invocation.outcome-unknown") return {
    accepted: true,
    state: { status: "outcome-unknown" },
  };
  if (event.type === "invocation.rejected") return {
    accepted: true,
    state: { status: "rejected" },
  };

  if (state.status === "requested" && event.type === "invocation.validated") {
    return { accepted: true, state: { status: "validated" } };
  }
  if (state.status === "validated" && event.type === "approval.required") {
    return { accepted: true, state: { status: "awaiting-approval" } };
  }
  if (state.status === "awaiting-approval" && event.type === "approval.granted") {
    return { accepted: true, state: { status: "validated" } };
  }
  if (state.status === "awaiting-approval" && event.type === "approval.denied") {
    return { accepted: true, state: { status: "rejected" } };
  }
  if ((state.status === "dispatched" || state.status === "running" || state.status === "outcome-unknown")
    && event.type === "invocation.retry-authorized") {
    return { accepted: true, state: { status: "validated" } };
  }
  if (state.status === "validated" && event.type === "invocation.dispatched") {
    return { accepted: true, state: { status: "dispatched" } };
  }
  if (state.status === "dispatched" && event.type === "invocation.started") {
    return { accepted: true, state: { status: "running" } };
  }
  if ((state.status === "dispatched" || state.status === "running" || state.status === "outcome-unknown")
    && event.type === "invocation.succeeded") {
    return { accepted: true, state: { status: "succeeded" } };
  }
  return reject(state, event);
}
