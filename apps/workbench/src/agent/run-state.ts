import type {
  AgentRequiredUserInput,
  AgentRunFailureCode,
  AgentRunRecoveryReason,
  AgentRunState,
} from "./agent-contracts.ts";

export type AgentRunEvent =
  | { readonly type: "run.created" }
  | { readonly type: "run.prepared" }
  | { readonly type: "turn.tools-accepted" }
  | {
      readonly type: "invocation.dispatched";
      readonly invocationId: string;
      readonly capabilityId: string;
    }
  | {
      readonly type: "invocation.outcome-recorded";
      readonly invocationId: string;
      readonly status: "completed" | "failed" | "rejected" | "outcome-unknown";
    }
  | { readonly type: "turn.message-produced" }
  | { readonly type: "turn.finish-requested" }
  | { readonly type: "user-input.required"; readonly input: AgentRequiredUserInput }
  | { readonly type: "approval.required" }
  | { readonly type: "invocations.completed" }
  | { readonly type: "verification.continue" }
  | { readonly type: "verification.completed" }
  | { readonly type: "run.recovery-required"; readonly reason: AgentRunRecoveryReason }
  | { readonly type: "run.resumed" }
  | { readonly type: "cancellation.requested" }
  | { readonly type: "cancellation.confirmed" }
  | { readonly type: "run.failed"; readonly code: AgentRunFailureCode };

export interface AgentRunEventRecord {
  readonly eventId: string;
  readonly runId: string;
  readonly sequence: number;
  readonly occurredAt: number;
  readonly event: AgentRunEvent;
}

export type AgentRunTransitionResult =
  | { readonly accepted: true; readonly state: AgentRunState }
  | {
      readonly accepted: false;
      readonly state: AgentRunState | null;
      readonly code: "invalid-transition";
      readonly message: string;
    };

function reject(state: AgentRunState | null, event: AgentRunEvent): AgentRunTransitionResult {
  const from = state === null ? "not-created" : `${state.lifecycle}:${state.phase}`;
  return {
    accepted: false,
    state,
    code: "invalid-transition",
    message: `Agent Run cannot apply ${event.type} from ${from}`,
  };
}

export function reduceAgentRunState(
  state: AgentRunState | null,
  event: AgentRunEvent,
): AgentRunTransitionResult {
  if (state === null) {
    return event.type === "run.created"
      ? { accepted: true, state: { lifecycle: "active", phase: "preparing" } }
      : reject(state, event);
  }
  if (state.lifecycle === "terminal") return reject(state, event);

  if (event.type === "run.failed") return {
    accepted: true,
    state: {
      lifecycle: "terminal",
      phase: state.phase,
      terminalReason: "failed",
      failureCode: event.code,
    },
  };
  if (event.type === "cancellation.requested") {
    return state.lifecycle === "active" && state.phase === "executing"
      ? {
          accepted: true,
          state: { lifecycle: "waiting", phase: "executing", waitReason: "cancellation-pending" },
        }
      : {
          accepted: true,
          state: { lifecycle: "terminal", phase: state.phase, terminalReason: "cancelled" },
        };
  }
  if (event.type === "cancellation.confirmed") {
    return state.lifecycle === "waiting" && state.waitReason === "cancellation-pending"
      ? {
          accepted: true,
          state: { lifecycle: "terminal", phase: state.phase, terminalReason: "cancelled" },
        }
      : reject(state, event);
  }
  if (event.type === "run.recovery-required") {
    return state.lifecycle === "active"
      || (state.lifecycle === "waiting" && state.waitReason === "cancellation-pending")
      ? {
          accepted: true,
          state: { lifecycle: "recovering", phase: state.phase, recoveryReason: event.reason },
        }
      : reject(state, event);
  }
  if (event.type === "run.resumed") {
    return state.lifecycle === "waiting" || state.lifecycle === "recovering"
      ? { accepted: true, state: { lifecycle: "active", phase: state.phase } }
      : reject(state, event);
  }

  if (event.type === "run.prepared") {
    return state.lifecycle === "active" && state.phase === "preparing"
      ? { accepted: true, state: { lifecycle: "active", phase: "planning" } }
      : reject(state, event);
  }
  if (event.type === "turn.tools-accepted") {
    return state.lifecycle === "active" && state.phase === "planning"
      ? { accepted: true, state: { lifecycle: "active", phase: "executing" } }
      : reject(state, event);
  }
  if (event.type === "invocation.dispatched") {
    return state.lifecycle === "active" && state.phase === "executing"
      ? { accepted: true, state }
      : reject(state, event);
  }
  if (event.type === "invocation.outcome-recorded") {
    return state.phase === "executing"
      && (state.lifecycle === "active" || state.lifecycle === "waiting" || state.lifecycle === "recovering")
      ? { accepted: true, state }
      : reject(state, event);
  }
  if (event.type === "turn.message-produced") {
    return state.lifecycle === "active" && state.phase === "planning"
      ? {
          accepted: true,
          state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
        }
      : reject(state, event);
  }
  if (event.type === "turn.finish-requested") {
    return state.lifecycle === "active" && state.phase === "planning"
      ? { accepted: true, state: { lifecycle: "active", phase: "verifying" } }
      : reject(state, event);
  }
  if (event.type === "user-input.required") {
    return state.lifecycle === "active"
      && (state.phase === "planning" || state.phase === "executing")
      ? {
          accepted: true,
          state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
        }
      : reject(state, event);
  }
  if (event.type === "approval.required") {
    return state.lifecycle === "active" && state.phase === "executing"
      ? {
          accepted: true,
          state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
        }
      : reject(state, event);
  }
  if (event.type === "invocations.completed") {
    return state.lifecycle === "active" && state.phase === "executing"
      ? { accepted: true, state: { lifecycle: "active", phase: "verifying" } }
      : reject(state, event);
  }
  if (event.type === "verification.continue") {
    return state.lifecycle === "active" && state.phase === "verifying"
      ? { accepted: true, state: { lifecycle: "active", phase: "planning" } }
      : reject(state, event);
  }
  if (event.type === "verification.completed") {
    return state.lifecycle === "active" && state.phase === "verifying"
      ? {
          accepted: true,
          state: { lifecycle: "terminal", phase: "verifying", terminalReason: "completed" },
        }
      : reject(state, event);
  }
  return reject(state, event);
}
