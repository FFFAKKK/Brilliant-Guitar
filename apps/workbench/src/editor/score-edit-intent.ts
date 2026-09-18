import type { DeleteTimePolicy, InputSequenceAnchor, ScoreEditAction, ScoreEventRange } from "../contracts/note-input.ts";
import type { ScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { staffIntentToAction } from "./staff-input-adapter.ts";
import type { StaffEditIntent } from "./staff-input-adapter.ts";

export type ScoreEditIntent = StaffEditIntent
  | { readonly kind: "history"; readonly direction: "undo" | "redo" }
  | { readonly kind: "document"; readonly title: string }
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "paste"; readonly measureId: string; readonly voiceId: string;
      readonly anchor: InputSequenceAnchor; readonly offsetUnits?: number; readonly fragment: ScoreClipboardFragmentV1 };

/** Application commands remain independent of notation-specific input grammar. */
export function scoreIntentToAction(intent: ScoreEditIntent, point: ScoreEditPoint | null,
  deleteTimePolicy: DeleteTimePolicy = "preserve"): ScoreEditAction | null {
  if (intent.kind === "history") return { kind: intent.direction };
  if (intent.kind === "document") return { kind: "set-title", title: intent.title };
  if (intent.kind === "delete-range") return { kind: "delete-range", range: intent.range };
  if (intent.kind === "paste") return { kind: "paste-fragment", measureId: intent.measureId,
    voiceId: intent.voiceId, anchor: intent.anchor, ...(intent.offsetUnits === undefined ? {} : { offsetUnits: intent.offsetUnits }),
    fragment: intent.fragment };
  return staffIntentToAction(intent, point, deleteTimePolicy);
}
