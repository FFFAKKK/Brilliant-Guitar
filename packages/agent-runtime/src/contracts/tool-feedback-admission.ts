import type { CapabilityResult } from "./capability.ts";
import type { AgentProviderRequest } from "../runtime/provider.ts";

export interface ReadAdmissionPolicyV1 { readonly schemaVersion: 1; readonly maxResultJsonBytes: number }
export interface AgentReadResultLimitV1 extends ReadAdmissionPolicyV1 {}
export type AgentReadPreview =
  | { readonly status: "unsupported" | "insufficient-limit" }
  | { readonly status: "ready"; readonly result: Extract<CapabilityResult<unknown>, { readonly status: "completed" }> };
export interface AgentInputPreviewV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly turnId: string;
  readonly status: "ready" | "budget-exceeded" | "input-limit-exceeded" | "invalid-input";
  readonly estimator: "utf8-json-bytes-div3-v1" | "external-host-projection-v1";
  readonly estimatedInputTokens: number | null;
  readonly inputTokenBudget: number;
  readonly requestBytes: number | null;
  readonly requestByteBudget: number | null;
}
export interface AgentInputPreviewPort { preview(request: AgentProviderRequest): AgentInputPreviewV1 }

/**
 * A host-side rejection which can be shown to a capable decision provider.
 * This is deliberately separate from AgentToolFeedbackGroup: no capability
 * invocation was dispatched and therefore there is no result or activity to
 * replay. Inputs are retained only so a Pi-style provider can correlate the
 * rejected call with its tool-call message and choose a smaller alternative.
 */
export interface AgentToolRejectionFeedbackV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly turnId: string;
  readonly nextTurnId: string;
  readonly status: "blocked" | "unsupported";
  readonly reason: "input-budget" | "input-limit" | "unsupported-tool" | "unsupported-provider";
  readonly retryable: boolean;
  readonly recovery: "reduce-input" | "choose-alternative" | "explain-limit";
  readonly calls: readonly {
    readonly callId: string;
    readonly capabilityId: string;
    readonly contractVersion: number;
    readonly input: unknown;
  }[];
}

function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 16 || value === null) return value === null;
  if (typeof value === "string") return value.length <= 16384;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1024 && Object.keys(value).length === value.length
    && value.every((item) => jsonValue(item, depth + 1));
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1024 && entries.every(([key, item]) => key.length <= 512 && jsonValue(item, depth + 1));
}

function freezeJsonValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJsonValue(item);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as Record<string, unknown>)) freezeJsonValue(item);
  }
  return Object.freeze(value);
}

export function isAgentToolRejectionFeedbackV1(value: unknown): value is AgentToolRejectionFeedbackV1 {
  if (!record(value, ["schemaVersion", "runId", "turnId", "nextTurnId", "status", "reason", "retryable", "recovery", "calls"])
    || value.schemaVersion !== 1 || !id(value.runId) || !id(value.turnId) || !id(value.nextTurnId)
    || !["blocked", "unsupported"].includes(value.status as string)
    || !["input-budget", "input-limit", "unsupported-tool", "unsupported-provider"].includes(value.reason as string)
    || typeof value.retryable !== "boolean"
    || !["reduce-input", "choose-alternative", "explain-limit"].includes(value.recovery as string)
    || !Array.isArray(value.calls) || value.calls.length === 0 || value.calls.length > 4) return false;
  if (!value.calls.every((call) => record(call, ["callId", "capabilityId", "contractVersion", "input"])
    && id(call.callId) && id(call.capabilityId) && positive(call.contractVersion) && jsonValue(call.input))) return false;
  const calls = value.calls;
  const retryableReason = value.reason === "input-budget" || value.reason === "input-limit";
  const recovery = retryableReason ? "reduce-input" : value.reason === "unsupported-tool" ? "choose-alternative" : "explain-limit";
  return new Set(calls.map((call) => call.callId)).size === calls.length
    && value.status === (retryableReason ? "blocked" : "unsupported")
    && value.retryable === retryableReason
    && value.recovery === recovery;
}

export function freezeAgentToolRejectionFeedbackV1(feedback: AgentToolRejectionFeedbackV1): AgentToolRejectionFeedbackV1 {
  if (!isAgentToolRejectionFeedbackV1(feedback)) throw new Error("Invalid Agent Tool Rejection Feedback");
  return Object.freeze({ ...feedback,
    calls: Object.freeze(feedback.calls.map((call) => Object.freeze({ ...call, input: freezeJsonValue(call.input) }))),
  });
}

export interface ToolFeedbackAdmissionReportV1 {
  readonly schemaVersion: 1;
  readonly policyVersion: "immutable-query-v1";
  readonly runId: string;
  readonly turnId: string;
  readonly nextTurnId: string;
  readonly status: "admitted" | "blocked" | "unsupported" | "contract-error";
  readonly reason: "fit" | "context-budget" | "input-budget" | "input-limit" | "unsupported-provider" | "unsupported-tool" | "invalid-context" | "invalid-preview" | "preview-execution-mismatch";
  readonly inputPreview: AgentInputPreviewV1 | null;
  readonly calls: readonly {
    readonly callId: string;
    readonly capabilityId: string;
    readonly contractVersion: number;
    readonly candidateInvocationId: string;
    readonly resultJsonByteLimit: number | null;
    readonly previewResultJsonBytes: number | null;
  }[];
}

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
export function isReadAdmissionPolicyV1(value: unknown): value is ReadAdmissionPolicyV1 {
  return record(value, ["schemaVersion", "maxResultJsonBytes"]) && value.schemaVersion === 1
    && positive(value.maxResultJsonBytes) && value.maxResultJsonBytes <= 65536;
}
export function isAgentInputPreviewV1(value: unknown): value is AgentInputPreviewV1 {
  return record(value, ["schemaVersion", "runId", "turnId", "status", "estimator", "estimatedInputTokens", "inputTokenBudget", "requestBytes", "requestByteBudget"])
    && value.schemaVersion === 1 && id(value.runId) && id(value.turnId)
    && ["ready", "budget-exceeded", "input-limit-exceeded", "invalid-input"].includes(value.status as string)
    && ["utf8-json-bytes-div3-v1", "external-host-projection-v1"].includes(value.estimator as string)
    && (count(value.estimatedInputTokens) || value.estimatedInputTokens === null && ["input-limit-exceeded", "invalid-input"].includes(value.status as string)) && positive(value.inputTokenBudget)
    && (value.requestBytes === null || count(value.requestBytes)) && (value.requestByteBudget === null || positive(value.requestByteBudget))
    && (value.status !== "budget-exceeded" || typeof value.estimatedInputTokens === "number" && value.estimatedInputTokens > value.inputTokenBudget)
    && (value.status !== "ready" || typeof value.estimatedInputTokens === "number" && value.estimatedInputTokens <= value.inputTokenBudget
      && (value.requestBytes === null || value.requestByteBudget === null || value.requestBytes <= value.requestByteBudget));
}
export function isToolFeedbackAdmissionReportV1(value: unknown): value is ToolFeedbackAdmissionReportV1 {
  if (!record(value, ["schemaVersion", "policyVersion", "runId", "turnId", "nextTurnId", "status", "reason", "inputPreview", "calls"])
    || value.schemaVersion !== 1 || value.policyVersion !== "immutable-query-v1" || !id(value.runId) || !id(value.turnId) || !id(value.nextTurnId)
    || !["admitted", "blocked", "unsupported", "contract-error"].includes(value.status as string)
    || !["fit", "context-budget", "input-budget", "input-limit", "unsupported-provider", "unsupported-tool", "invalid-context", "invalid-preview", "preview-execution-mismatch"].includes(value.reason as string)
    || value.inputPreview !== null && (!isAgentInputPreviewV1(value.inputPreview) || value.inputPreview.runId !== value.runId || value.inputPreview.turnId !== value.nextTurnId)
    || !Array.isArray(value.calls) || value.calls.length > 4) return false;
  if (!value.calls.every((call) => record(call, ["callId", "capabilityId", "contractVersion", "candidateInvocationId", "resultJsonByteLimit", "previewResultJsonBytes"])
    && id(call.callId) && id(call.capabilityId) && positive(call.contractVersion) && id(call.candidateInvocationId)
    && (call.resultJsonByteLimit === null || positive(call.resultJsonByteLimit) && call.resultJsonByteLimit <= 65536)
    && (call.previewResultJsonBytes === null || count(call.previewResultJsonBytes) && typeof call.resultJsonByteLimit === "number" && call.previewResultJsonBytes <= call.resultJsonByteLimit))) return false;
  return new Set(value.calls.map((call) => call.callId)).size === value.calls.length
    && new Set(value.calls.map((call) => call.candidateInvocationId)).size === value.calls.length
    && (value.status !== "blocked" || ["context-budget", "input-budget", "input-limit"].includes(value.reason as string))
    && (value.status !== "unsupported" || ["unsupported-provider", "unsupported-tool"].includes(value.reason as string))
    && (value.status !== "contract-error" || ["invalid-context", "invalid-preview", "preview-execution-mismatch"].includes(value.reason as string))
    && (value.status !== "admitted" || value.reason === "fit" && value.inputPreview !== null && value.inputPreview.status === "ready"
      && value.calls.every((call) => call.resultJsonByteLimit !== null && call.previewResultJsonBytes !== null));
}
export function freezeToolFeedbackAdmissionReport(report: ToolFeedbackAdmissionReportV1): ToolFeedbackAdmissionReportV1 {
  return Object.freeze({ ...report, inputPreview: report.inputPreview && Object.freeze({ ...report.inputPreview }),
    calls: Object.freeze(report.calls.map((call) => Object.freeze({ ...call }))) });
}

export function resultJsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Read preview must contain JSON data");
  return new TextEncoder().encode(json).length;
}
