import type { NoteOverview, NoteControlChange } from "../editor/note-overview.ts";
import type { ScorePosition } from "../editor/score-position.ts";
import type { StaffViewProps } from "../components/staff-view.tsx";
import { defineUiProjection } from "./projection-registry.ts";

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

export const STAFF_PROJECTION = defineUiProjection<StaffProjection>("score.staff-view");
export const NOTE_CONTROL_PROJECTION = defineUiProjection<NoteControlProjection>("score.note-control");
export const HISTORY_PROJECTION = defineUiProjection<HistoryProjection>("score.history");
export const PAPER_ZOOM_PROJECTION = defineUiProjection<PaperZoomProjection>("view.paper-zoom");

export const FIRST_PARTY_UI_PROJECTIONS = [
  STAFF_PROJECTION,
  NOTE_CONTROL_PROJECTION,
  HISTORY_PROJECTION,
  PAPER_ZOOM_PROJECTION,
] as const;
