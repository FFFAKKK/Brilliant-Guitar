/** Host-owned compare-and-replace; absence is explicit, never an omitted guard. */
export type DocumentReplacementPrecondition =
  | { readonly kind: "empty" }
  | { readonly kind: "document"; readonly documentId: string; readonly documentVersion: number };

export function isDocumentReplacementPrecondition(value: unknown): value is DocumentReplacementPrecondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (r.kind === "empty") return Object.keys(r).length === 1;
  return r.kind === "document" && Object.keys(r).length === 3
    && typeof r.documentId === "string" && r.documentId.length > 0 && r.documentId.length <= 256
    && typeof r.documentVersion === "number" && Number.isSafeInteger(r.documentVersion) && r.documentVersion >= 0;
}
