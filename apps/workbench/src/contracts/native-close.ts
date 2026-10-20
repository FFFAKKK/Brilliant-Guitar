import type { ScoreSessionRead } from "./score-session.ts";
import { isDocumentReplacementPrecondition } from "./document-replacement.ts";

export type NativeClosePrecondition =
  | { readonly kind: "empty" }
  | { readonly kind: "document"; readonly sessionId: string; readonly documentId: string; readonly documentVersion: number };

export function isNativeClosePrecondition(value: unknown): value is NativeClosePrecondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (r.kind === "empty") return isDocumentReplacementPrecondition(r);
  return Object.keys(r).length === 4 && typeof r.sessionId === "string"
    && r.sessionId.length > 0 && r.sessionId.length <= 256
    && isDocumentReplacementPrecondition({ kind: r.kind, documentId: r.documentId, documentVersion: r.documentVersion });
}

export function nativeClosePrecondition(session: ScoreSessionRead | null): NativeClosePrecondition {
  if (!session) return { kind: "empty" };
  if (!session.persistence) throw new Error("当前宿主未提供关闭所需的会话身份，请更新宿主");
  return { kind: "document", sessionId: session.persistence.sessionId,
    documentId: session.documentId, documentVersion: session.documentVersion };
}
