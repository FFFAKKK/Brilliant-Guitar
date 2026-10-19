import type { EventProperties } from "../note-properties.ts";

export type DeleteTimePolicy = "preserve" | "collapse";
export interface ScoreEventRange {
  readonly measureId: string;
  readonly voiceId: string;
  readonly startEventId: string;
  readonly endEventId: string;
}

/** Musical output only; the application supplies identity, version and transport. */
export type SelectedNoteAction =
  | { readonly kind: "delete-event"; readonly eventId: string; readonly timePolicy?: DeleteTimePolicy }
  | { readonly kind: "set-event-properties"; readonly eventId: string; readonly properties: EventProperties };
