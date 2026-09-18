import type { NoteOverview, NoteControlChange } from "../editor/note-overview.ts";
import type { ScorePosition } from "../editor/score-position.ts";
import type { StaffViewProps } from "../components/staff-view.tsx";
import { defineUiProjection } from "./projection-registry.ts";
import type { PlaybackSnapshot } from "../playback/playback-session.ts";
import type { LocalSampleBankFile, PlaybackOutputSnapshot } from "../playback/playback-output.ts";

export interface NoteControlProjection {
  readonly viewModel: Readonly<{
    value: NoteOverview;
    position: ScorePosition | null;
    disabled: boolean;
    pending: boolean;
    message: string;
  }>;
  readonly actions: Readonly<{
    change(change: NoteControlChange, completionFocus?: HTMLElement): void;
    focusScore(): void;
  }>;
}

export interface HistoryProjection {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly blocked: boolean;
  readonly activity: Readonly<{ kind: "undo" | "redo"; sequence: number }> | undefined;
  execute(kind: "undo" | "redo"): void;
}

export interface PaperZoomProjection {
  readonly zoom: number;
  readonly enabled: boolean;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
}

export type StaffProjection = StaffViewProps;

export interface PlaybackControlProjection {
  readonly snapshot: PlaybackSnapshot;
  readonly canPrevious: boolean;
  readonly canNext: boolean;
  toggle(): Promise<void>;
  stop(): void;
  previous(): void;
  next(): void;
}

export interface PlaybackOutputProjection {
  readonly snapshot: PlaybackOutputSnapshot;
  select(id: string): Promise<void>;
  importSoundFont(file: LocalSampleBankFile): Promise<void>;
  removeSampleBank(id: string): void;
}

export const STAFF_PROJECTION = defineUiProjection<StaffProjection>("score.staff-view");
export const NOTE_CONTROL_PROJECTION = defineUiProjection<NoteControlProjection>("score.note-control");
export const HISTORY_PROJECTION = defineUiProjection<HistoryProjection>("score.history");
export const PAPER_ZOOM_PROJECTION = defineUiProjection<PaperZoomProjection>("view.paper-zoom");
export const PLAYBACK_PROJECTION = defineUiProjection<PlaybackControlProjection>("playback.transport");
export const PLAYBACK_OUTPUT_PROJECTION = defineUiProjection<PlaybackOutputProjection>("playback.output");

export const FIRST_PARTY_UI_PROJECTIONS = [
  STAFF_PROJECTION,
  NOTE_CONTROL_PROJECTION,
  HISTORY_PROJECTION,
  PAPER_ZOOM_PROJECTION,
  PLAYBACK_PROJECTION,
  PLAYBACK_OUTPUT_PROJECTION,
] as const;
