import { isScoreSessionSummary } from "./new-score.ts";
import type { ScoreSessionSummary } from "./new-score.ts";
import { isNotationView } from "./notation.ts";
import type { NotationView } from "./notation.ts";
import { isPlaybackSourceProjection } from "./playback.ts";
import type { PlaybackSourceProjection } from "./playback.ts";

export interface ScoreDocumentMetadataProjection {
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempoBpm: number;
}

/** Metadata and notation always describe the same atomic Core read. */
export interface ScoreSessionRead extends ScoreSessionSummary {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly notation: NotationView;
  readonly playbackSource: PlaybackSourceProjection;
  /** Optional until every desktop host ships the metadata projection. */
  readonly metadata?: ScoreDocumentMetadataProjection;
}

export function isScoreSessionRead(value: unknown): value is ScoreSessionRead {
  if (!isScoreSessionSummary(value)) return false;
  const notation: unknown = (value as unknown as Record<string, unknown>).notation;
  const r = value as unknown as Record<string, unknown>;
  if (typeof r.undoDepth !== "number" || !Number.isSafeInteger(r.undoDepth) || r.undoDepth < 0 || typeof r.redoDepth !== "number" || !Number.isSafeInteger(r.redoDepth) || r.redoDepth < 0) return false;
  const metadata = r.metadata;
  const metadataValid = metadata === undefined || (typeof metadata === "object" && metadata !== null
    && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).title === "string"
    && (metadata as Record<string, unknown>).title === value.title
    && Array.isArray((metadata as Record<string, unknown>).authors)
    && ((metadata as Record<string, unknown>).authors as unknown[]).every((author) => typeof author === "string")
    && typeof (metadata as Record<string, unknown>).tempoBpm === "number"
    && Number.isFinite((metadata as Record<string, unknown>).tempoBpm)
    && ((metadata as Record<string, unknown>).tempoBpm as number) > 0);
  return metadataValid && isNotationView(notation) && isPlaybackSourceProjection(r.playbackSource)
    && r.playbackSource.documentId === value.documentId && r.playbackSource.documentVersion === value.documentVersion
    && (metadata === undefined || r.playbackSource.kind === "unsupported"
      || r.playbackSource.bpm === (metadata as ScoreDocumentMetadataProjection).tempoBpm)
    && (notation.kind === "unsupported" || notation.measures.length === value.measureCount);
}
