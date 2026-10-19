/** Established ScorePropertiesDialog rules, shared by both UI carriers. */
export interface DocumentMetadataInput {
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempoBpm: number;
}
export interface MetadataFieldErrors {
  readonly title?: string;
  readonly authors?: string;
  readonly tempo?: string;
}
export const normalizeDocumentMetadata = (value: DocumentMetadataInput): DocumentMetadataInput => ({
  title: value.title.trim() || "未命名乐谱",
  authors: value.authors.map(author => author.trim()).filter(Boolean),
  tempoBpm: value.tempoBpm,
});
export const documentMetadataKey = (value: DocumentMetadataInput) => JSON.stringify(normalizeDocumentMetadata(value));
export function validateDocumentMetadataFields(title: string, authorText: string, tempoText: string): {
  readonly value?: DocumentMetadataInput; readonly errors: MetadataFieldErrors;
} {
  const cleanTitle = title.trim() || "未命名乐谱";
  const authors = authorText.split(/\r?\n/).map(author => author.trim()).filter(Boolean);
  const tempoBpm = Number(tempoText);
  const errors: MetadataFieldErrors = {
    ...(cleanTitle.length > 120 ? { title: "标题不能超过 120 个字符" } : {}),
    ...(authors.length > 16 ? { authors: "作者最多填写 16 位" }
      : authors.some(author => author.length > 120) ? { authors: "每位作者不能超过 120 个字符" } : {}),
    ...(!tempoText.trim() || !Number.isFinite(tempoBpm) || tempoBpm <= 0 ? { tempo: "请输入大于 0 的速度" } : {}),
  };
  return Object.keys(errors).length ? { errors } : { errors, value: { title: cleanTitle, authors, tempoBpm } };
}
export function isDocumentMetadataInput(value: unknown): value is DocumentMetadataInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return Object.keys(r).every(key => ["title", "authors", "tempoBpm"].includes(key))
    && typeof r.title === "string" && r.title.trim().length <= 120
    && Array.isArray(r.authors) && r.authors.length <= 16
    && r.authors.every(author => typeof author === "string" && !!author.trim() && author.trim().length <= 120)
    && typeof r.tempoBpm === "number" && Number.isFinite(r.tempoBpm) && r.tempoBpm > 0;
}
