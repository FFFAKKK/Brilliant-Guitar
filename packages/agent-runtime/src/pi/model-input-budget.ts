import type { AgentProviderRequest } from "../runtime/provider.ts";
import type { AgentModelStreamRequestV1 } from "../contracts/agent-model-stream.ts";
import type { AgentModelInputDiagnosticV1 } from "../contracts/model-input.ts";
import { conversationInputTurns, PI_BASE_INSTRUCTIONS, PI_INSTRUCTIONS_VERSION } from "./input-projection.ts";

/** Heuristic input estimate, not a tokenizer or a supplier context-window guarantee. */
function estimate(request: AgentModelStreamRequestV1): number {
  const bytes = new TextEncoder().encode(JSON.stringify({ messages: request.messages, tools: request.tools })).length;
  return Math.ceil(bytes / 3) + request.messages.length * 8 + request.tools.length * 12 + 32;
}

export function budgetModelInput(input: AgentModelStreamRequestV1, decision: AgentProviderRequest, modelApi: string): {
  readonly request: AgentModelStreamRequestV1;
  readonly diagnostic: AgentModelInputDiagnosticV1;
} {
  const budget = decision.context.budget.tokenBudget;
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("模型输入预算无效");
  const messages = [...input.messages];
  const turns = conversationInputTurns(decision);
  const selectedIds = new Set(decision.context.contextItems.map((item) => item.contextItemId));
  const omitted: AgentModelInputDiagnosticV1["omittedHistory"][number][] = [...new Set(decision.context.omittedItems
    .filter((item) => item.contextItemId.startsWith("conversation:") && !selectedIds.has(item.contextItemId))
    .map((item) => item.contextItemId))].map((contextItemId) => ({ contextItemId, reason: "context-selection" }));
  const removed = new Set<string>();
  let tokens = estimate(input);
  let retainedHistoryTurns = turns.length;
  let offset = messages[0]?.role === "system" ? 1 : 0;
  for (const turn of turns) {
    const user = messages[offset];
    const assistant = messages[offset + 1];
    // Never remove a tool call/result or an unrelated message by guessing its role.
    const matches = user?.role === "user" && user.content === turn.user && assistant?.role === "assistant"
      && assistant.content.length === 1 && assistant.content[0]?.type === "text"
      && assistant.content[0].text === turn.assistant;
    if (!matches) break;
    if (tokens > budget && turn.item.priority !== "required") {
      messages.splice(offset, 2);
      removed.add(turn.item.contextItemId);
      omitted.push({ contextItemId: turn.item.contextItemId, reason: "model-input-budget" });
      --retainedHistoryTurns;
      tokens = estimate({ ...input, messages });
    } else { offset += 2; }
  }
  const diagnostic: AgentModelInputDiagnosticV1 = Object.freeze({
    schemaVersion: 1, runId: input.runId, turnId: input.turnId, providerId: input.providerId,
    modelId: input.modelId, modelApi,
    instructionsVersion: messages.some((item) => item.role === "system" && item.content.includes(PI_BASE_INSTRUCTIONS))
      ? PI_INSTRUCTIONS_VERSION : null,
    roles: Object.freeze(messages.map((item) => item.role)), retainedHistoryTurns,
    omittedHistory: Object.freeze(omitted.map((item) => Object.freeze(item))),
    sources: Object.freeze([...new Map([
      ...decision.context.contextItems.filter((item) => !removed.has(item.contextItemId)),
      ...(decision.toolFeedback ?? []).flatMap((group) => group.calls.map((entry) => entry.source)),
    ].map((item) => [item.contextItemId, item])).values()].map((item) =>
      Object.freeze({ contextItemId: item.contextItemId, kind: item.kind, sourceType: item.sourceType,
        sourceId: item.sourceId, scope: item.scope, documentId: item.documentId, documentVersion: item.documentVersion,
        trustLevel: item.trustLevel, priority: item.priority }))),
    toolCount: input.tools.length, estimatedInputTokens: tokens, estimator: "utf8-json-bytes-div3-v1",
    inputTokenBudget: budget, timeoutMs: input.limits.timeoutMs, maxOutputTokens: input.limits.maxOutputTokens,
    status: tokens > budget ? "budget-exceeded" : "ready",
  });
  return { request: { ...input, messages }, diagnostic };
}
