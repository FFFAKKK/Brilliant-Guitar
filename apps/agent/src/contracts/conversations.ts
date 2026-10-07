import { MAX_SESSIONS, MAX_SESSION_MESSAGES, isSessionId, parseSessionTitle } from "@brilliant-guitar/agent-runtime";

export interface ConversationSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived: boolean;
  readonly messageCount: number;
}
export interface ConversationsSnapshot {
  readonly selectedSessionId: string;
  readonly items: readonly ConversationSummary[];
  readonly storage: "memory" | "file";
  readonly saving: boolean;
  readonly notice: string | null;
}
export function isConversationsSnapshot(value: unknown): value is ConversationsSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["selectedSessionId", "items", "storage", "saving", "notice"];
  if (Object.keys(item).length !== keys.length || !keys.every((key) => Object.hasOwn(item, key)) || !isSessionId(item.selectedSessionId)
    || !["memory", "file"].includes(String(item.storage)) || typeof item.saving !== "boolean" || !(item.notice === null || (typeof item.notice === "string" && item.notice.length <= 1024))
    || !Array.isArray(item.items) || !item.items.length || item.items.length > MAX_SESSIONS) return false;
  const ids = new Set<string>();
  for (const value of item.items) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 6 || !["sessionId", "title", "createdAt", "updatedAt", "archived", "messageCount"].every((key) => Object.hasOwn(record, key))
      || !isSessionId(record.sessionId) || ids.has(record.sessionId) || typeof record.archived !== "boolean"
      || !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 0 || !Number.isSafeInteger(record.updatedAt) || Number(record.updatedAt) < Number(record.createdAt)
      || !Number.isSafeInteger(record.messageCount) || Number(record.messageCount) < 0 || Number(record.messageCount) > MAX_SESSION_MESSAGES || Number(record.messageCount) % 2 !== 0) return false;
    try { parseSessionTitle(record.title); } catch { return false; }
    ids.add(record.sessionId);
  }
  return item.items.some((record: ConversationSummary) => record.sessionId === item.selectedSessionId && !record.archived);
}
