import type { Model, Api } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AgentCapabilityPort } from "../capability-port.ts";
import type { AgentWorkspaceScope } from "../agent-contracts.ts";

export type PiAgentModel = Model<Api>;
export type PiAgentStreamFn = StreamFn;

export type PiAgentTerminalStatus = "completed" | "failed" | "aborted";

export interface PiAgentError {
  readonly code: string;
  readonly message: string;
}

export type PiAgentEvent =
  | {
      readonly type: "run.started";
      readonly runId: string;
      readonly goal: string;
    }
  | {
      readonly type: "tool.started";
      readonly runId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool.finished";
      readonly runId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly status: "completed" | "failed" | "aborted";
      readonly output?: unknown;
      readonly error?: PiAgentError;
    }
  | {
      readonly type: "assistant.completed";
      readonly runId: string;
      readonly content: string;
    }
  | {
      readonly type: "run.finished";
      readonly runId: string;
      readonly status: PiAgentTerminalStatus;
      readonly answer?: string;
      readonly error?: PiAgentError;
    };

export interface PiAgentRunInput {
  readonly runId: string;
  readonly goal: string;
  readonly workspace: AgentWorkspaceScope;
  readonly capabilities: AgentCapabilityPort;
  readonly model: PiAgentModel;
  readonly streamFn: PiAgentStreamFn;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: PiAgentEvent) => void | Promise<void>;
}

export interface PiAgentRunResult {
  readonly runId: string;
  readonly status: PiAgentTerminalStatus;
  readonly answer?: string;
  readonly error?: PiAgentError;
  readonly events: readonly PiAgentEvent[];
}

export class PiAgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiAgentInputError";
  }
}
