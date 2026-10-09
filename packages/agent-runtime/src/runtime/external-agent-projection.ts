import type { AgentDecision, AgentContextItem, AgentToolDescriptor } from "./agent-contracts.ts";
import type { AgentProviderRequest } from "./provider.ts";
import type {
  ExternalAgentDecisionV1, ExternalAgentNegotiatedLimitsV1,
  ExternalAgentTurnRequestV1, ExternalAgentTurnResponseV1,
} from "./external-protocol-v1.ts";
import { EXTERNAL_AGENT_PROTOCOL_LIMITS as LIMITS } from "./external-protocol-v1.ts";
import { ExternalAgentProtocolError, ExternalAgentInputLimitError, validateExternalDecision, validateTurnRequest, validateTurnResponse } from "./external-protocol-v1-validator.ts";
import type { AgentInputPreviewV1 } from "../contracts/tool-feedback-admission.ts";

function projectContextItem(item: AgentContextItem) {
  return {
    id: item.contextItemId,
    kind: item.kind,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    content: item.content,
    documentId: item.documentId,
    documentVersion: item.documentVersion,
    scope: item.scope,
    trustLevel: item.trustLevel,
  };
}

function projectTool(item: AgentToolDescriptor) {
  return {
    id: item.id,
    contractVersion: item.contractVersion,
    name: item.name,
    description: item.description,
    inputSchema: item.inputSchema,
    requiresApproval: item.requiresApproval,
  };
}

export function projectTurnRequest(request: AgentProviderRequest, pluginId: string, deadlineAt: string,
  requestId: string, limits?: ExternalAgentNegotiatedLimitsV1): ExternalAgentTurnRequestV1 {
  // Select fields explicitly. Validation snapshots the selected payload; invalid data is never replaced with null.
  return validateTurnRequest({
    schemaVersion: 1,
    messageType: "turn.request",
    requestId,
    runId: request.runId,
    turnId: request.turnId,
    pluginId,
    deadlineAt,
    goal: request.goal,
    context: { items: request.context.contextItems.map(projectContextItem) },
    tools: request.toolset.toolDescriptors.map(projectTool),
    maxToolCalls: Math.min(request.toolset.maxCalls, limits?.maxToolCalls ?? LIMITS.maxToolCalls),
  }, limits);
}

/** Pure host projection; reserves the largest legal request identity without generating one. */
export function previewExternalInput(request: AgentProviderRequest, pluginId: string, limits: ExternalAgentNegotiatedLimitsV1): AgentInputPreviewV1 {
  let tokens: number | null = null;
  let bytes: number | null = null;
  let status: AgentInputPreviewV1["status"] = "invalid-input";
  try {
    const wire = projectTurnRequest(request, pluginId, "9999-12-31T23:59:59.999Z", "\ud800".repeat(256), { ...limits, maxRequestBytes: LIMITS.maxMessageBytes });
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
    bytes = encode(wire);
    tokens = Math.ceil(encode({ goal: wire.goal, context: wire.context, tools: wire.tools }) / 3) + 32;
    status = bytes > limits.maxRequestBytes ? "input-limit-exceeded" : tokens > request.context.budget.tokenBudget ? "budget-exceeded" : "ready";
  } catch (error) { status = error instanceof ExternalAgentInputLimitError ? "input-limit-exceeded" : "invalid-input"; }
  return Object.freeze({ schemaVersion: 1, runId: request.runId, turnId: request.turnId, status, estimator: "external-host-projection-v1",
    estimatedInputTokens: tokens, inputTokenBudget: request.context.budget.tokenBudget, requestBytes: bytes, requestByteBudget: limits.maxRequestBytes });
}

export function mapExternalDecision(value: ExternalAgentDecisionV1, request: ExternalAgentTurnRequestV1): AgentDecision {
  const decision = validateExternalDecision(value, request.maxToolCalls);
  if (decision.kind === "tool-calls") {
    for (const call of decision.calls) {
      const tool = request.tools.find((entry) => entry.id === call.capabilityId);
      if (tool === undefined) throw new ExternalAgentProtocolError("capability-not-exposed", "External Agent requested an unavailable capability", false, request.requestId);
      if (tool.contractVersion !== call.contractVersion) throw new ExternalAgentProtocolError("decision-invalid", "External Agent capability version mismatch", false, request.requestId);
    }
  }
  // This does not validate capability inputs/policy: only the Controller has those authoritative validators.
  return decision;
}

export function createDecisionResponse(request: ExternalAgentTurnRequestV1, decision: AgentDecision): ExternalAgentTurnResponseV1 {
  return validateTurnResponse({
    schemaVersion: 1,
    messageType: "turn.response",
    requestId: request.requestId,
    runId: request.runId,
    turnId: request.turnId,
    result: { kind: "decision", decision },
  });
}
