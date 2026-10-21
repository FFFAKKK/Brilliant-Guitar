import { isScoreSessionSummary } from "./new-score.ts";
import type { ScoreSessionSummary } from "./new-score.ts";
import { isNotationView } from "./notation.ts";
import type { NotationView } from "./notation.ts";
import { isPlaybackSourceProjection } from "./playback.ts";
import type { PlaybackSourceProjection } from "./playback.ts";
import { isTablatureProjection, pairedNotationMatches } from "../../../../shared/notation/tablature-model.ts";
import type { TablatureProjection } from "../../../../shared/notation/tablature-model.ts";
import { isWorkbenchIssue } from "./workbench-issue.ts";
import type { WorkbenchIssue } from "./workbench-issue.ts";

export interface ScoreDocumentMetadataProjection {
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempoBpm: number;
}

/** Host checkpoint identity; browser downloads retain their local checkpoint. */
export interface ScorePersistenceState {
  readonly sessionId: string;
  readonly savedVersion: number | null;
  readonly dirty: boolean;
}

/** Metadata and notation always describe the same atomic Core read. */
export interface ScoreSessionRead extends ScoreSessionSummary {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly notation: NotationView;
  /** Current hosts return both projections from one snapshot; absent only on older hosts. */
  readonly tablature?: TablatureProjection;
  readonly playbackSource: PlaybackSourceProjection;
  /** Optional until every desktop host ships the metadata projection. */
  readonly metadata?: ScoreDocumentMetadataProjection;
  readonly persistence?: ScorePersistenceState;
  /** Observed host-side recovery warnings; not an acknowledgement of durability. */
  readonly warnings?: readonly WorkbenchIssue[];
}

export function isScoreSessionRead(value: unknown): value is ScoreSessionRead {
  if (!isScoreSessionSummary(value)) return false;
  const notation: unknown = (value as unknown as Record<string, unknown>).notation;
  const r = value as unknown as Record<string, unknown>;
  if (typeof r.undoDepth !== "number" || !Number.isSafeInteger(r.undoDepth) || r.undoDepth < 0 || typeof r.redoDepth !== "number" || !Number.isSafeInteger(r.redoDepth) || r.redoDepth < 0) return false;
  const metadata = r.metadata;
  if (r.warnings !== undefined && (!Array.isArray(r.warnings) || r.warnings.length > 4
    || r.warnings.some(warning => !isWorkbenchIssue(warning) || warning.severity !== "warning"))) return false;
  const persistence = r.persistence;
  if (persistence !== undefined) {
    if (typeof persistence !== "object" || persistence === null || Array.isArray(persistence)) return false;
    const state = persistence as Record<string, unknown>;
    if (typeof state.sessionId !== "string" || !state.sessionId || typeof state.dirty !== "boolean"
      || (state.savedVersion !== null && (typeof state.savedVersion !== "number"
        || !Number.isSafeInteger(state.savedVersion) || state.savedVersion < 0
        || state.savedVersion > value.documentVersion))) return false;
  }
  const metadataValid = metadata === undefined || (typeof metadata === "object" && metadata !== null
    && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).title === "string"
    && (metadata as Record<string, unknown>).title === value.title
    && Array.isArray((metadata as Record<string, unknown>).authors)
    && ((metadata as Record<string, unknown>).authors as unknown[]).every((author) => typeof author === "string")
    && typeof (metadata as Record<string, unknown>).tempoBpm === "number"
    && Number.isFinite((metadata as Record<string, unknown>).tempoBpm)
    && ((metadata as Record<string, unknown>).tempoBpm as number) > 0);
  const tablature = r.tablature;
  const tabValid = tablature === undefined || (isTablatureProjection(tablature)
    && (tablature.kind === "unsupported" || (tablature.measures.length === value.measureCount
      && (metadata === undefined || tablature.tempoBpm === (metadata as ScoreDocumentMetadataProjection).tempoBpm)
      && (!isNotationView(notation) || notation.kind === "unsupported" || pairedNotationMatches(notation, tablature)))));
  return metadataValid && tabValid && isNotationView(notation) && isPlaybackSourceProjection(r.playbackSource)
    && (tablature === undefined || !isTablatureProjection(tablature) || tablature.kind === "unsupported"
      || r.playbackSource.kind === "unsupported" || tablature.tempoBpm === r.playbackSource.bpm)
    && r.playbackSource.documentId === value.documentId && r.playbackSource.documentVersion === value.documentVersion
    && (metadata === undefined || r.playbackSource.kind === "unsupported"
      || r.playbackSource.bpm === (metadata as ScoreDocumentMetadataProjection).tempoBpm)
    && (metadata === undefined || notation.kind === "unsupported"
      || notation.tempoBpm === (metadata as ScoreDocumentMetadataProjection).tempoBpm)
    && (notation.kind === "unsupported" || notation.measures.length === value.measureCount);
}
