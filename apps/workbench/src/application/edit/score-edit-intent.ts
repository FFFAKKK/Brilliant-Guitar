import type { DeleteTimePolicy, InputSequenceAnchor, KeySignatureChangeInput, MeasureInsertPosition, MeterChangeScope, MeterInput,
  ScoreEditAction, ScoreEventRange, StaffClef } from "../../contracts/note-input.ts";
import type { ScoreClipboardFragmentV1 } from "../../contracts/score-clipboard.ts";
import type { ScoreEditPoint } from "../../editor/score-navigation.ts";
import type { EditIntent } from "../../input/edit-intent.ts";

export type ScoreEditIntent = EditIntent
  | { readonly kind: "history"; readonly direction: "undo" | "redo" }
  | { readonly kind: "document"; readonly action: Extract<ScoreEditAction, {
      readonly kind: "set-title" | "set-document-metadata";
    }> }
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "paste"; readonly measureId: string; readonly voiceId: string;
      readonly anchor: InputSequenceAnchor; readonly offsetUnits?: number; readonly fragment: ScoreClipboardFragmentV1 }
  | { readonly kind: "insert-measure"; readonly measureId: string; readonly position: MeasureInsertPosition }
  | { readonly kind: "remove-measure"; readonly measureId: string }
  | { readonly kind: "set-measure-meter"; readonly measureId: string; readonly meter: MeterInput;
      readonly scope: MeterChangeScope }
  | { readonly kind: "set-key-signature"; readonly partId: string; readonly measureId: string;
      readonly change: KeySignatureChangeInput }
  | { readonly kind: "set-staff-clef"; readonly staffId: string; readonly clef: StaffClef };

/** The application maps shared intents onto the current kernel transport contract. */
export function scoreIntentToAction(intent: ScoreEditIntent, point: ScoreEditPoint | null,
  deleteTimePolicy: DeleteTimePolicy = "preserve"): ScoreEditAction | null {
  if (intent.kind === "history") return { kind: intent.direction };
  if (intent.kind === "document") return intent.action;
  if (intent.kind === "delete-range") return { kind: "delete-range", range: intent.range };
  if (intent.kind === "paste") return { kind: "paste-fragment", measureId: intent.measureId,
    voiceId: intent.voiceId, anchor: intent.anchor, ...(intent.offsetUnits === undefined ? {} : { offsetUnits: intent.offsetUnits }),
    fragment: intent.fragment };
  if (intent.kind === "insert-measure") return { kind: "insert-measure", measureId: intent.measureId, position: intent.position };
  if (intent.kind === "remove-measure") return { kind: "remove-measure", measureId: intent.measureId };
  if (intent.kind === "set-measure-meter") return { kind: "set-measure-meter", measureId: intent.measureId,
    meter: intent.meter, scope: intent.scope };
  if (intent.kind === "set-key-signature") return { kind: "set-key-signature", partId: intent.partId,
    measureId: intent.measureId, change: intent.change };
  if (intent.kind === "set-staff-clef") return { kind: "set-staff-clef", staffId: intent.staffId, clef: intent.clef };
  if (intent.kind === "insert-event") return point ? { kind: "append", measureId: point.measureId, anchor: point.anchor,
    offsetUnits: point.offsetUnits, duration: intent.event.duration, content: intent.event.content } : null;
  if (intent.kind === "update-event") return { kind: "set-event-properties", eventId: intent.eventId, properties: intent.properties };
  return { kind: "delete-event", eventId: intent.eventId, timePolicy: intent.timePolicy ?? deleteTimePolicy };
}
