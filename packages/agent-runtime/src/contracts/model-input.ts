import type { AgentModelMessageV1 } from "./agent-model-stream.ts";
import type { AgentContextItem } from "../runtime/agent-contracts.ts";

export const DEFAULT_MODEL_INPUT_TOKEN_BUDGET = 8192;

/** Metadata only. No prompt, response text, URL, headers, or credential fields. */
export interface AgentModelInputDiagnosticV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly turnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelApi: string;
  readonly instructionsVersion: string | null;
  readonly roles: readonly AgentModelMessageV1["role"][];
  readonly retainedHistoryTurns: number;
  readonly omittedHistory: readonly {
    readonly contextItemId: string;
    readonly reason: "context-selection" | "model-input-budget";
  }[];
  readonly sources: readonly Pick<AgentContextItem, "contextItemId" | "kind" | "sourceType" | "sourceId"
    | "scope" | "documentId" | "documentVersion" | "trustLevel" | "priority">[];
  readonly toolCount: number;
  readonly estimatedInputTokens: number;
  readonly estimator: "utf8-json-bytes-div3-v1";
  readonly inputTokenBudget: number;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly status: "ready" | "budget-exceeded";
}
