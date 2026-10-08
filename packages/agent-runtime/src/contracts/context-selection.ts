import type { ContextBudgetReport, ContextOmissionReason } from "../runtime/agent-contracts.ts";

export const STANDALONE_CONTEXT_POLICY = "standalone-context-v1";
export type ContextSelectionPolicyId = typeof STANDALONE_CONTEXT_POLICY;
export type ContextSelectionOmission = ContextOmissionReason | "out-of-scope" | "identity-conflict" | "invalid-content" | "version-mismatch" | "model-input-budget";
export interface ContextSelectionReportV1 {
  readonly schemaVersion: 1;
  readonly policyVersion: ContextSelectionPolicyId;
  readonly runId: string;
  readonly turnId: string;
  readonly stage: "context-selection" | "model-input";
  readonly status: "ready" | "budget-exceeded" | "invalid-context";
  readonly estimator: "json-characters-div4-v1" | "utf8-json-bytes-div3-v1";
  readonly selected: readonly { readonly contextItemId: string; readonly protected: boolean; readonly reason: "required" | "recent-conversation" | "executed-result" | "priority" }[];
  readonly omitted: readonly { readonly contextItemId: string; readonly reason: ContextSelectionOmission }[];
  readonly budget: ContextBudgetReport;
}

/** Request-local sidecar. Never added to ContextBuildResult or stored Run DTOs. */
export interface ContextSelectionPlan {
  readonly report: ContextSelectionReportV1;
  readonly optionalRemovalOrder: readonly string[];
}

const omissionReasons = new Set<string>(["duplicate", "item-count-budget", "token-budget", "history-turn-budget", "expired",
  "invalid-estimate", "out-of-scope", "identity-conflict", "invalid-content", "version-mismatch", "model-input-budget"]);
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function isContextSelectionReportV1(value: unknown): value is ContextSelectionReportV1 {
  if (!record(value, ["schemaVersion", "policyVersion", "runId", "turnId", "stage", "status", "estimator", "selected", "omitted", "budget"])
    || value.schemaVersion !== 1 || value.policyVersion !== STANDALONE_CONTEXT_POLICY || !id(value.runId) || !id(value.turnId)
    || !["context-selection", "model-input"].includes(value.stage as string)
    || !["ready", "budget-exceeded", "invalid-context"].includes(value.status as string)
    || value.estimator !== (value.stage === "model-input" ? "utf8-json-bytes-div3-v1" : "json-characters-div4-v1")
    || !Array.isArray(value.selected) || !Array.isArray(value.omitted) || value.selected.length > 4096 || value.omitted.length > 4096) return false;
  if (!value.selected.every((item) => record(item, ["contextItemId", "protected", "reason"]) && id(item.contextItemId)
    && typeof item.protected === "boolean" && ["required", "recent-conversation", "executed-result", "priority"].includes(item.reason as string)
    && item.protected === (item.reason !== "priority"))) return false;
  if (!value.omitted.every((item) => record(item, ["contextItemId", "reason"]) && id(item.contextItemId) && omissionReasons.has(item.reason as string))) return false;
  const budget = value.budget;
  return record(budget, ["estimatedTokens", "itemCount", "tokenBudget", "itemCountBudget", "exceeded"])
    && count(budget.estimatedTokens) && count(budget.itemCount) && count(budget.tokenBudget) && count(budget.itemCountBudget)
    && budget.itemCount === value.selected.length && typeof budget.exceeded === "boolean"
    && budget.exceeded === (budget.estimatedTokens > budget.tokenBudget || budget.itemCount > budget.itemCountBudget)
    && (value.status === "invalid-context" || (value.status === "budget-exceeded") === budget.exceeded)
    && new Set(value.selected.map((item) => item.contextItemId)).size === value.selected.length;
}

export function freezeContextSelectionReport(report: ContextSelectionReportV1): ContextSelectionReportV1 {
  return Object.freeze({ ...report, selected: Object.freeze(report.selected.map((item) => Object.freeze({ ...item }))),
    omitted: Object.freeze(report.omitted.map((item) => Object.freeze({ ...item }))), budget: Object.freeze({ ...report.budget }) });
}
