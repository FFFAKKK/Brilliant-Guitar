import { isSessionId, isAgentModelId, isContextSelectionReportV1, freezeContextSelectionReport, isToolFeedbackAdmissionReportV1, freezeToolFeedbackAdmissionReport,
  type ContextSelectionReportV1, type ToolFeedbackAdmissionReportV1 } from "@brilliant-guitar/agent-runtime";
import { isConnectionId } from "./connection-settings.ts";

export interface ModelInputSummaryV1 {
  readonly runId: string;
  readonly turnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly status: "ready" | "budget-exceeded";
  readonly estimator: "utf8-json-bytes-div3-v1";
  readonly estimatedInputTokens: number;
  readonly inputTokenBudget: number;
  readonly retainedHistoryTurns: number;
  readonly toolCount: number;
  readonly maxOutputTokens: number;
}
export interface AgentRunDiagnosticsV1 {
  readonly schemaVersion: 1;
  readonly hostInstanceId: string;
  readonly hostSequence: number;
  readonly sessionId: string;
  readonly runId: string | null;
  readonly selectedProfileId: string;
  readonly configurationEpoch: number;
  readonly availability: "available" | "pending" | "no-current-run" | "disabled" | "configuration-changed" | "unavailable";
  readonly modelInput: ModelInputSummaryV1 | null;
  readonly contextSelection: ContextSelectionReportV1 | null;
  readonly admission: ToolFeedbackAdmissionReportV1 | null;
  readonly omittedHistoryTurns: number | null;
  readonly actualUsage: null;
}
const summaryKeys = ["runId", "turnId", "providerId", "modelId", "status", "estimator", "estimatedInputTokens", "inputTokenBudget", "retainedHistoryTurns", "toolCount", "maxOutputTokens"];
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;

export function isModelInputSummaryV1(value: unknown): value is ModelInputSummaryV1 {
  return record(value, summaryKeys) && id(value.runId) && id(value.turnId) && id(value.providerId) && isAgentModelId(value.modelId)
    && ["ready", "budget-exceeded"].includes(value.status as string) && value.estimator === "utf8-json-bytes-div3-v1"
    && count(value.estimatedInputTokens) && positive(value.inputTokenBudget) && count(value.retainedHistoryTurns)
    && count(value.toolCount) && positive(value.maxOutputTokens)
    && (value.status === "budget-exceeded") === (value.estimatedInputTokens > value.inputTokenBudget);
}
export function isAgentRunDiagnosticsV1(value: unknown): value is AgentRunDiagnosticsV1 {
  if (!record(value, ["schemaVersion", "hostInstanceId", "hostSequence", "sessionId", "runId", "selectedProfileId", "configurationEpoch", "availability", "modelInput", "contextSelection", "admission", "omittedHistoryTurns", "actualUsage"])
    || value.schemaVersion !== 1 || !isSessionId(value.hostInstanceId) || !count(value.hostSequence) || !isSessionId(value.sessionId)
    || value.runId !== null && !id(value.runId) || !isConnectionId(value.selectedProfileId) || !count(value.configurationEpoch) || value.actualUsage !== null
    || !["available", "pending", "no-current-run", "disabled", "configuration-changed", "unavailable"].includes(value.availability as string)) return false;
  const reports = [value.modelInput, value.contextSelection, value.admission];
  if (value.availability !== "available") return reports.every((item) => item === null) && value.omittedHistoryTurns === null
    && (value.availability !== "pending" && value.availability !== "configuration-changed" || value.runId !== null)
    && (value.availability !== "no-current-run" || value.runId === null);
  return value.runId !== null && count(value.omittedHistoryTurns) && reports.some((item) => item !== null)
    && (value.modelInput === null || isModelInputSummaryV1(value.modelInput) && value.modelInput.runId === value.runId)
    && (value.contextSelection === null || isContextSelectionReportV1(value.contextSelection) && value.contextSelection.runId === value.runId)
    && (value.admission === null || isToolFeedbackAdmissionReportV1(value.admission) && value.admission.runId === value.runId);
}
export function decodeRunDiagnostics(value: unknown): AgentRunDiagnosticsV1 {
  if (!isAgentRunDiagnosticsV1(value)) throw new Error("运行说明格式无效，请刷新诊断");
  return Object.freeze({ ...value, modelInput: value.modelInput && Object.freeze({ ...value.modelInput }),
    contextSelection: value.contextSelection && freezeContextSelectionReport(value.contextSelection),
    admission: value.admission && freezeToolFeedbackAdmissionReport(value.admission) });
}

/** White-list projection of an internal diagnostic; never spread the source at the HTTP boundary. */
export function summarizeModelInput(value: unknown): ModelInputSummaryV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("schemaVersion" in value) || value.schemaVersion !== 1) return null;
  const source = value as Record<string, unknown>;
  const summary = Object.fromEntries(summaryKeys.map((key) => [key, source[key]]));
  return isModelInputSummaryV1(summary) ? Object.freeze(summary) : null;
}
