import type { AgentProviderRequest } from "../agent/provider.ts";
import type {
  AgentContextItem,
  AgentRunState,
  AgentToolDescriptor,
  ContextVersionWarning,
} from "../agent/agent-contracts.ts";

export interface AgentProviderTurnLimitsV1 {
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export type AgentProviderContextItemV1 = Pick<AgentContextItem,
  "kind" | "content" | "sourceType" | "sourceId" | "documentId" | "documentVersion"
  | "scope" | "trustLevel" | "priority">;

export type AgentProviderToolV1 = Pick<AgentToolDescriptor,
  "id" | "contractVersion" | "name" | "description" | "inputSchema" | "outputSummary"
  | "preconditions" | "sideEffects" | "scopeLimit" | "requiresApproval" | "costClass" | "failureModes">;

export interface AgentProviderDecideRequestV1 {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly modelId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly goal: string;
  readonly runState: AgentRunState;
  readonly contextItems: readonly AgentProviderContextItemV1[];
  readonly versionWarnings: readonly ContextVersionWarning[];
  readonly tools: readonly AgentProviderToolV1[];
  readonly maxCalls: number;
  readonly limits: AgentProviderTurnLimitsV1;
}

export interface AgentProviderUsageV1 {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface AgentProviderDecisionEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly modelId: string;
  readonly providerRequestId: string;
  readonly decision: unknown;
  readonly usage: AgentProviderUsageV1 | null;
}

export type AgentProviderStreamEventV1 = {
  readonly runId: string;
  readonly turnId: string;
  readonly sequence: number;
} & (
  | { readonly type: "response.started" }
  | { readonly type: "response.text-delta"; readonly delta: string }
  | { readonly type: "response.tool-input-delta"; readonly callId: string; readonly delta: string }
  | ({ readonly type: "response.usage" } & AgentProviderUsageV1)
  | { readonly type: "response.completed" }
  | { readonly type: "response.failed"; readonly code: string }
);

export const DEFAULT_AGENT_PROVIDER_TURN_LIMITS: AgentProviderTurnLimitsV1 = Object.freeze({
  timeoutMs: 45_000,
  maxOutputTokens: 1_500,
});

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function validTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function createAgentProviderDecideRequestV1(
  providerId: string,
  modelId: string,
  request: AgentProviderRequest,
  limits: AgentProviderTurnLimitsV1 = DEFAULT_AGENT_PROVIDER_TURN_LIMITS,
): AgentProviderDecideRequestV1 {
  return {
    schemaVersion: 1,
    providerId,
    modelId,
    runId: request.runId,
    turnId: request.turnId,
    goal: request.goal,
    runState: request.runState,
    contextItems: request.context.contextItems.map((item) => ({
      kind: item.kind,
      content: item.content,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      documentId: item.documentId,
      documentVersion: item.documentVersion,
      scope: item.scope,
      trustLevel: item.trustLevel,
      priority: item.priority,
    })),
    versionWarnings: request.context.versionWarnings,
    tools: request.toolset.toolDescriptors.map((tool) => ({
      id: tool.id,
      contractVersion: tool.contractVersion,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSummary: tool.outputSummary,
      preconditions: tool.preconditions,
      sideEffects: tool.sideEffects,
      scopeLimit: tool.scopeLimit,
      requiresApproval: tool.requiresApproval,
      costClass: tool.costClass,
      failureModes: tool.failureModes,
    })),
    maxCalls: request.toolset.maxCalls,
    limits,
  };
}

export function isAgentProviderDecisionEnvelopeV1(value: unknown): value is AgentProviderDecisionEnvelopeV1 {
  const envelope = record(value);
  if (envelope === null
    || !onlyKeys(envelope, ["schemaVersion", "providerId", "modelId", "providerRequestId", "decision", "usage"])
    || envelope.schemaVersion !== 1
    || !validText(envelope.providerId, 160)
    || !validText(envelope.modelId, 160)
    || !validText(envelope.providerRequestId, 256)) return false;
  if (envelope.usage === null) return true;
  const usage = record(envelope.usage);
  return usage !== null
    && onlyKeys(usage, ["inputTokens", "outputTokens", "totalTokens"])
    && validTokenCount(usage.inputTokens)
    && validTokenCount(usage.outputTokens)
    && validTokenCount(usage.totalTokens)
    && usage.totalTokens >= usage.inputTokens
    && usage.totalTokens >= usage.outputTokens;
}

export function isAgentProviderStreamEventV1(value: unknown): value is AgentProviderStreamEventV1 {
  const event = record(value);
  if (event === null
    || !validText(event.runId, 160)
    || !validText(event.turnId, 160)
    || !Number.isSafeInteger(event.sequence)
    || (event.sequence as number) < 1
    || typeof event.type !== "string") return false;
  const base = ["type", "runId", "turnId", "sequence"] as const;
  if (event.type === "response.started" || event.type === "response.completed") {
    return onlyKeys(event, base);
  }
  if (event.type === "response.text-delta") {
    return onlyKeys(event, [...base, "delta"])
      && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.tool-input-delta") {
    return onlyKeys(event, [...base, "callId", "delta"])
      && validText(event.callId, 256)
      && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.usage") {
    return onlyKeys(event, [...base, "inputTokens", "outputTokens", "totalTokens"])
      && validTokenCount(event.inputTokens)
      && validTokenCount(event.outputTokens)
      && validTokenCount(event.totalTokens)
      && event.totalTokens === event.inputTokens + event.outputTokens;
  }
  if (event.type === "response.failed") {
    return onlyKeys(event, [...base, "code"])
      && validText(event.code, 256);
  }
  return false;
}
