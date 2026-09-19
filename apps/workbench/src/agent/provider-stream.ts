export type AgentProviderStreamEventPayload =
  | { readonly type: "response.started" }
  | { readonly type: "response.text-delta"; readonly delta: string }
  | {
      readonly type: "response.tool-input-delta";
      readonly callId: string;
      readonly delta: string;
    }
  | {
      readonly type: "response.usage";
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly totalTokens: number;
    }
  | { readonly type: "response.completed" }
  | { readonly type: "response.failed"; readonly code: string };

export type AgentProviderStreamEvent = AgentProviderStreamEventPayload & {
  readonly runId: string;
  readonly turnId: string;
  readonly sequence: number;
};

export type AgentProviderStreamState =
  | {
      readonly lifecycle: "streaming";
      readonly runId: string;
      readonly turnId: string;
      readonly lastSequence: number;
    }
  | {
      readonly lifecycle: "terminal";
      readonly runId: string;
      readonly turnId: string;
      readonly lastSequence: number;
      readonly reason: "completed" | "failed";
    };

export type AgentProviderStreamTransitionResult =
  | { readonly accepted: true; readonly state: AgentProviderStreamState }
  | {
      readonly accepted: false;
      readonly state: AgentProviderStreamState | null;
      readonly code: "invalid-transition" | "identity-mismatch" | "sequence-mismatch" | "invalid-payload";
      readonly message: string;
    };

function reject(
  state: AgentProviderStreamState | null,
  event: AgentProviderStreamEvent,
  code: Exclude<AgentProviderStreamTransitionResult, { accepted: true }>["code"],
  detail: string,
): AgentProviderStreamTransitionResult {
  return {
    accepted: false,
    state,
    code,
    message: `Agent Provider stream cannot apply ${event.type}: ${detail}`,
  };
}

function validUsage(event: Extract<AgentProviderStreamEvent, { type: "response.usage" }>): boolean {
  return Number.isSafeInteger(event.inputTokens)
    && Number.isSafeInteger(event.outputTokens)
    && Number.isSafeInteger(event.totalTokens)
    && event.inputTokens >= 0
    && event.outputTokens >= 0
    && event.totalTokens === event.inputTokens + event.outputTokens;
}

function validPayload(event: AgentProviderStreamEvent): boolean {
  if (event.runId.trim().length === 0 || event.turnId.trim().length === 0) return false;
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) return false;
  if (event.type === "response.text-delta") return event.delta.length > 0;
  if (event.type === "response.tool-input-delta") {
    return event.callId.trim().length > 0 && event.delta.length > 0;
  }
  if (event.type === "response.usage") return validUsage(event);
  if (event.type === "response.failed") return event.code.trim().length > 0;
  return true;
}

export function reduceAgentProviderStream(
  state: AgentProviderStreamState | null,
  event: AgentProviderStreamEvent,
): AgentProviderStreamTransitionResult {
  if (!validPayload(event)) return reject(state, event, "invalid-payload", "event payload is invalid");

  if (state === null) {
    return event.type === "response.started" && event.sequence === 1
      ? {
          accepted: true,
          state: Object.freeze({
            lifecycle: "streaming",
            runId: event.runId,
            turnId: event.turnId,
            lastSequence: event.sequence,
          }),
        }
      : reject(state, event, event.sequence === 1 ? "invalid-transition" : "sequence-mismatch",
        "the first event must be response.started at sequence 1");
  }

  if (state.lifecycle === "terminal") {
    return reject(state, event, "invalid-transition", "the stream is already terminal");
  }
  if (state.runId !== event.runId || state.turnId !== event.turnId) {
    return reject(state, event, "identity-mismatch", "event does not belong to this run turn");
  }
  if (event.sequence !== state.lastSequence + 1) {
    return reject(state, event, "sequence-mismatch", "event sequence is not contiguous");
  }
  if (event.type === "response.started") {
    return reject(state, event, "invalid-transition", "the stream has already started");
  }
  if (event.type === "response.completed" || event.type === "response.failed") {
    return {
      accepted: true,
      state: Object.freeze({
        lifecycle: "terminal",
        runId: state.runId,
        turnId: state.turnId,
        lastSequence: event.sequence,
        reason: event.type === "response.completed" ? "completed" : "failed",
      }),
    };
  }
  return {
    accepted: true,
    state: Object.freeze({ ...state, lastSequence: event.sequence }),
  };
}
