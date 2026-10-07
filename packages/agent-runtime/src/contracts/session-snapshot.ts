import type { AgentSessionSnapshot, AgentChatMessage } from "../session/agent-session.ts";

export function isAgentSessionSnapshot(value: unknown): value is AgentSessionSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["sessionId", "sequence", "enabled", "status", "runId", "messages", "message", "omittedHistoryTurns"];
  return Object.keys(item).length === keys.length && Object.keys(item).every((key) => keys.includes(key))
    && typeof item.sessionId === "string" && item.sessionId.length > 0 && item.sessionId.length <= 160 && Number.isSafeInteger(item.sequence) && Number(item.sequence) >= 0
    && typeof item.enabled === "boolean" && ["idle", "running", "cancelling", "completed", "failed", "cancelled", "disabled"].includes(String(item.status))
    && (item.runId === null || (typeof item.runId === "string" && item.runId.length > 0 && item.runId.length <= 160)) && typeof item.message === "string" && item.message.length <= 1024
    && Number.isSafeInteger(item.omittedHistoryTurns) && Number(item.omittedHistoryTurns) >= 0
    && Array.isArray(item.messages) && item.messages.length <= 128 && item.messages.every(isMessage);
}

function isMessage(value: unknown): value is AgentChatMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["id", "runId", "role", "content", "status"];
  return Object.keys(item).length === keys.length && Object.keys(item).every((key) => keys.includes(key))
    && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160 && typeof item.runId === "string" && item.runId.length > 0 && item.runId.length <= 160
    && typeof item.content === "string" && item.content.length <= 32768
    && ["user", "assistant"].includes(String(item.role)) && ["complete", "streaming", "failed", "cancelled"].includes(String(item.status));
}
