import { isScoreSessionSummary } from "./new-score.ts";
import type { ScoreSessionSummary } from "./new-score.ts";
import { isNotationView } from "./notation.ts";
import type { NotationView } from "./notation.ts";

/** Metadata and notation always describe the same atomic Core read. */
export interface ScoreSessionRead extends ScoreSessionSummary {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly notation: NotationView;
}

export function isScoreSessionRead(value: unknown): value is ScoreSessionRead {
  if (!isScoreSessionSummary(value)) return false;
  const notation: unknown = (value as unknown as Record<string, unknown>).notation;
  const r = value as unknown as Record<string, unknown>;
  if (typeof r.undoDepth !== "number" || !Number.isSafeInteger(r.undoDepth) || r.undoDepth < 0 || typeof r.redoDepth !== "number" || !Number.isSafeInteger(r.redoDepth) || r.redoDepth < 0) return false;
  return isNotationView(notation) && (notation.kind === "unsupported" || notation.measures.length === value.measureCount);
}
