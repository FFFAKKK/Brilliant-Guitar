import type { DeleteTimePolicy, EventProperties, InputContent, InputDuration } from "../contracts/note-input.ts";

export interface EventDraft {
  readonly duration: InputDuration;
  readonly content: InputContent;
}

/** Shared document intent used by notation-specific input adapters. */
export type EditIntent<Event = EventDraft, Properties = EventProperties> =
  | { readonly kind: "insert-event"; readonly event: Event }
  | { readonly kind: "update-event"; readonly eventId: string; readonly properties: Properties }
  | { readonly kind: "delete-event"; readonly eventId: string; readonly timePolicy?: DeleteTimePolicy };
