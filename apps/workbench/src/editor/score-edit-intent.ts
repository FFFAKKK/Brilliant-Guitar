import type { DeleteTimePolicy, InputSequenceAnchor, MeasureInsertPosition, ScoreEditAction, ScoreEventRange } from "../contracts/note-input.ts";
import type { ScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { staffIntentToAction } from "./staff-input-adapter.ts";
import type { StaffEditIntent } from "./staff-input-adapter.ts";

export type ScoreEditIntent = StaffEditIntent
  | { readonly kind: "history"; readonly direction: "undo" | "redo" }
  | { readonly kind: "document"; readonly action: Extract<ScoreEditAction, {
      readonly kind: "set-title" | "set-document-metadata";
    }> }
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "paste"; readonly measureId: string; readonly voiceId: string;
      readonly anchor: InputSequenceAnchor; readonly offsetUnits?: number; readonly fragment: ScoreClipboardFragmentV1 }
  | { readonly kind: "insert-measure"; readonly measureId: string; readonly position: MeasureInsertPosition }
  | { readonly kind: "remove-measure"; readonly measureId: string };

/** Application commands remain independent of notation-specific input grammar. */
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
  return staffIntentToAction(intent, point, deleteTimePolicy);
}
