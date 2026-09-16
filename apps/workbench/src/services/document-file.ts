import type { ScoreSessionRead } from "../contracts/score-session";

export interface SavedFileCheckpoint {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly name: string;
}

const STORAGE_KEY = "brilliant.workbench.file-checkpoint.v1";

export function fileStem(value: string): string {
  const stem = value.replace(/(?:\.bgp\.json|\.json|\.svg)$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  return stem.slice(0, 80).trim().replace(/[. ]+$/g, "") || "未命名乐谱";
}

export function checkpointMatches(session: ScoreSessionRead | null, checkpoint: SavedFileCheckpoint | null): boolean {
  return Boolean(session && checkpoint && checkpoint.documentId === session.documentId
    && checkpoint.documentVersion === session.documentVersion);
}

export function hasUnsavedDocument(session: ScoreSessionRead | null, checkpoint: SavedFileCheckpoint | null): boolean {
  if (!session || checkpointMatches(session, checkpoint)) return false;
  return session.documentVersion > 0 || session.measureCount !== 1 || session.title !== "未命名乐谱";
}

export function readFileCheckpoint(): SavedFileCheckpoint | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return typeof record.documentId === "string" && record.documentId.length > 0
      && Number.isSafeInteger(record.documentVersion) && Number(record.documentVersion) >= 0
      && typeof record.name === "string" && record.name.length > 0
      ? { documentId: record.documentId, documentVersion: Number(record.documentVersion), name: fileStem(record.name) } : null;
  } catch { return null; }
}

export function writeFileCheckpoint(value: SavedFileCheckpoint | null): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Save state is still correct until this tab closes. */ }
}

export function downloadText(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 0); }
}
