import type { AgentContextItem } from "./agent-contracts.ts";

export function conversationContent(item: AgentContextItem, sessionId: string): { user: string; assistant: string } | null {
  const value = item.content;
  if (item.kind !== "task-history" || item.sourceType !== "conversation" || item.contextItemId !== `conversation:${item.sourceId}`
    || item.scope !== sessionId || item.documentId !== null || item.documentVersion !== null || item.trustLevel !== "user-provided"
    || typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const content = value as Record<string, unknown>;
  return Object.keys(content).length === 2 && typeof content.user === "string" && content.user.trim()
    && typeof content.assistant === "string" && content.assistant.trim() ? { user: content.user, assistant: content.assistant } : null;
}

export function isInvocationContext(item: AgentContextItem): boolean {
  return item.kind === "capability-result" && item.sourceType === "capability-result"
    && item.trustLevel === "authoritative" && item.contextItemId.startsWith("capability-result:");
}
