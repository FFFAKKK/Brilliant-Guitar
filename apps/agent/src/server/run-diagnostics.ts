import { decodeRunDiagnostics, summarizeModelInput, type AgentRunDiagnosticsV1 } from "../contracts/run-diagnostics.ts";

export interface DiagnosticsRunBinding {
  readonly sessionId: string;
  readonly runId: string;
  readonly selectedProfileId: string;
  readonly configurationEpoch: number;
}
export function projectRunDiagnostics(input: {
  readonly hostInstanceId: string; readonly hostSequence: number; readonly sessionId: string; readonly runId: string | null;
  readonly selectedProfileId: string; readonly configurationEpoch: number; readonly enabled: boolean;
  readonly binding: DiagnosticsRunBinding | null; readonly providerId: string; readonly modelId: string;
  readonly modelInput: unknown; readonly contextSelection: unknown; readonly admission: unknown; readonly omittedHistoryTurns: number;
}): AgentRunDiagnosticsV1 {
  const empty = { schemaVersion: 1 as const, hostInstanceId: input.hostInstanceId, hostSequence: input.hostSequence,
    sessionId: input.sessionId, runId: input.runId, selectedProfileId: input.selectedProfileId, configurationEpoch: input.configurationEpoch,
    modelInput: null, contextSelection: null, admission: null, omittedHistoryTurns: null, actualUsage: null };
  const unavailable = (availability: AgentRunDiagnosticsV1["availability"]) => decodeRunDiagnostics({ ...empty, availability });
  if (!input.enabled) return unavailable("disabled");
  if (!input.runId) return unavailable("no-current-run");
  const binding = input.binding;
  if (!binding || binding.sessionId !== input.sessionId || binding.runId !== input.runId) return unavailable("unavailable");
  if (binding.selectedProfileId !== input.selectedProfileId || binding.configurationEpoch !== input.configurationEpoch) return unavailable("configuration-changed");
  const modelInput = input.modelInput === null ? null : summarizeModelInput(input.modelInput);
  if (input.modelInput !== null && (!modelInput || modelInput.providerId !== input.providerId || modelInput.modelId !== input.modelId)) return unavailable("unavailable");
  if (input.modelInput === null && input.contextSelection === null && input.admission === null) return unavailable("pending");
  try {
    return decodeRunDiagnostics({ ...empty, availability: "available", modelInput, contextSelection: input.contextSelection,
      admission: input.admission, omittedHistoryTurns: input.omittedHistoryTurns });
  } catch { return unavailable("unavailable"); }
}
