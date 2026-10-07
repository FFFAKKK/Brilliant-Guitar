import { isAgentChatMessage } from "../contracts/session-snapshot.ts";
import type { AgentChatMessage } from "./agent-session.ts";
import { MAX_SESSION_MESSAGES } from "../contracts/chat-limits.ts";
export { MAX_SESSION_MESSAGES } from "../contracts/chat-limits.ts";

export const MAX_SESSIONS = 200;
export const MAX_SESSION_LIBRARY_BYTES = 16 * 1024 * 1024;

export interface AgentSessionRecord {
  readonly sessionId: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived: boolean;
  readonly messages: readonly AgentChatMessage[];
}
export interface AgentSessionLibrary {
  readonly schemaVersion: 1;
  readonly selectedSessionId: string;
  readonly sessions: readonly AgentSessionRecord[];
}
/** Chat persistence carries no authority to replay Controller runs or tools. */
export interface SessionStorePort {
  readonly kind: "memory" | "file";
  load(): Promise<AgentSessionLibrary | null>;
  save(library: AgentSessionLibrary): Promise<void>;
  dispose?(): Promise<void>;
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}
export function parseSessionTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("会话名称需为1到80个字符");
  return value.trim();
}
export function parseTranscript(value: unknown): readonly AgentChatMessage[] {
  if (!Array.isArray(value) || value.length > MAX_SESSION_MESSAGES || value.length % 2 !== 0 || !value.every(isAgentChatMessage)) throw new Error("会话消息格式或数量无效");
  const ids = new Set<string>();
  const runs = new Set<string>();
  for (let i = 0; i < value.length; i += 2) {
    const user = value[i]!;
    const assistant = value[i + 1]!;
    if (user.role !== "user" || user.status !== "complete" || assistant.role !== "assistant" || user.runId !== assistant.runId || runs.has(user.runId)) throw new Error("会话轮次无效");
    runs.add(user.runId);
    for (const message of [user, assistant]) { if (ids.has(message.id)) throw new Error("消息ID重复"); ids.add(message.id); }
  }
  return Object.freeze(value.map((message) => Object.freeze({ ...message })));
}
export function parseSessionLibrary(value: unknown): AgentSessionLibrary {
  const item = exactObject(value, ["schemaVersion", "selectedSessionId", "sessions"]);
  if (item.schemaVersion !== 1 || !isSessionId(item.selectedSessionId) || !Array.isArray(item.sessions) || !item.sessions.length || item.sessions.length > MAX_SESSIONS) throw new Error("会话版本或数量无效");
  const ids = new Set<string>();
  const sessions = item.sessions.map((value: unknown): AgentSessionRecord => {
    const record = exactObject(value, ["sessionId", "title", "createdAt", "updatedAt", "archived", "messages"]);
    if (!isSessionId(record.sessionId) || ids.has(record.sessionId) || typeof record.archived !== "boolean"
      || !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 0 || !Number.isSafeInteger(record.updatedAt) || Number(record.updatedAt) < Number(record.createdAt)) throw new Error("会话元数据无效");
    ids.add(record.sessionId);
    return Object.freeze({ sessionId: record.sessionId, title: parseSessionTitle(record.title), createdAt: Number(record.createdAt), updatedAt: Number(record.updatedAt), archived: record.archived, messages: parseTranscript(record.messages) });
  });
  if (!sessions.some((record) => record.sessionId === item.selectedSessionId && !record.archived)) throw new Error("当前会话无效");
  return Object.freeze({ schemaVersion: 1, selectedSessionId: item.selectedSessionId, sessions: Object.freeze(sessions) });
}
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) throw new Error("会话格式无效");
  return value as Record<string, unknown>;
}
