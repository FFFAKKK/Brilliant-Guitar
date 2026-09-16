export const NEW_SCORE_LIMITS = { titleLength: 120, minMeasures: 1, maxMeasures: 128 } as const;

export interface NewScoreInput {
  readonly title: string;
  readonly measureCount: number;
}

export interface ScoreSessionSummary {
  readonly documentId: string;
  readonly title: string;
  readonly measureCount: number;
  readonly documentVersion: number;
}

export type NewScoreErrors = Partial<Record<"title" | "measureCount", string>>;

export function validateNewScoreInput(input: NewScoreInput): NewScoreErrors {
  const errors: NewScoreErrors = {};
  if (input.title.trim().length > NEW_SCORE_LIMITS.titleLength) errors.title = "标题最多 120 个字符";
  if (!Number.isInteger(input.measureCount) || input.measureCount < NEW_SCORE_LIMITS.minMeasures || input.measureCount > NEW_SCORE_LIMITS.maxMeasures) {
    errors.measureCount = "请输入 1–128 之间的整数";
  }
  return errors;
}

export function isScoreSessionSummary(value: unknown): value is ScoreSessionSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.documentId === "string" && record.documentId.length > 0
    && typeof record.title === "string"
    && typeof record.measureCount === "number" && Number.isInteger(record.measureCount) && record.measureCount >= 1
    && typeof record.documentVersion === "number" && Number.isInteger(record.documentVersion) && record.documentVersion >= 0;
}
