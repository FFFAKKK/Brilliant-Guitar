import type { DeleteTimePolicy, EventProperties, InputContent, InputDuration, ScoreEditAction } from "../contracts/note-input.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { advancePitchEntry } from "./pitch-entry.ts";
import type { PitchDraft } from "./pitch-entry.ts";
import type { EditIntent, EventDraft } from "./editor-machine.ts";

export type StaffEventDraft = EventDraft<InputDuration, InputContent>;

export type StaffEditIntent = EditIntent<StaffEventDraft, EventProperties>;

export function resolveStaffKey(draft: PitchDraft, key: string, repeat = false) {
  return advancePitchEntry(draft, key, repeat);
}

/** Translate notation-specific input into the existing application write contract. */
export function staffIntentToAction(intent: StaffEditIntent, point: ScoreEditPoint | null,
  deleteTimePolicy: DeleteTimePolicy = "preserve"): ScoreEditAction | null {
  switch (intent.kind) {
    case "insert": return point ? { kind: "append", measureId: point.measureId, anchor: point.anchor,
      offsetUnits: point.offsetUnits, duration: intent.event.duration, content: intent.event.content } : null;
    case "update": return { kind: "set-event-properties", eventId: intent.eventId, properties: intent.properties };
    case "delete": return { kind: "delete-event", eventId: intent.eventId, timePolicy: deleteTimePolicy };
  }
}
