export interface RecentDocumentV1 {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly lastOpenedAt: number;
}
export interface RecentDocumentsSnapshotV1 {
  readonly apiVersion: 1;
  readonly entries: readonly RecentDocumentV1[];
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isRecentRecordId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function isRecentDocumentsSnapshotV1(value: unknown): value is RecentDocumentsSnapshotV1 {
  if (!record(value) || value.apiVersion !== 1 || Object.keys(value).length !== 2 || !Array.isArray(value.entries) || value.entries.length > 20) return false;
  const ids = new Set<string>();
  return value.entries.every(entry => {
    if (!record(entry) || Object.keys(entry).length !== 4 || !isRecentRecordId(entry.id)
      || typeof entry.name !== "string" || !entry.name || entry.name.length > 1024
      || typeof entry.location !== "string" || !entry.location || entry.location.length > 32768
      || typeof entry.lastOpenedAt !== "number" || !Number.isSafeInteger(entry.lastOpenedAt) || entry.lastOpenedAt < 0
      || ids.has(entry.id.toLowerCase())) return false;
    ids.add(entry.id.toLowerCase()); return true;
  });
}
