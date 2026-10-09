import type { AgentRunDiagnosticsV1, ModelInputSummaryV1 } from "../src/contracts/run-diagnostics.ts";

export const inputSummary = (patch: Partial<ModelInputSummaryV1> = {}): ModelInputSummaryV1 => ({ runId: "run-1", turnId: "turn-1", providerId: "deepseek", modelId: "fixture-model",
  status: "ready", estimator: "utf8-json-bytes-div3-v1", estimatedInputTokens: 1000, inputTokenBudget: 8192, retainedHistoryTurns: 2, toolCount: 1, maxOutputTokens: 1500, ...patch });
export const runDiagnostics = (patch: Partial<AgentRunDiagnosticsV1> = {}): AgentRunDiagnosticsV1 => ({ schemaVersion: 1, hostInstanceId: "host-1", hostSequence: 1,
  sessionId: "session-1", runId: "run-1", selectedProfileId: "profile-1", configurationEpoch: 0, availability: "available", modelInput: inputSummary(),
  contextSelection: null, admission: null, omittedHistoryTurns: 0, actualUsage: null, ...patch });
