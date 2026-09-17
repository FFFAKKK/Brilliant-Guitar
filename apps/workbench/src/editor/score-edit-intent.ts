import type { DeleteTimePolicy, ScoreEditAction } from "../contracts/note-input.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { staffIntentToAction } from "./staff-input-adapter.ts";
import type { StaffEditIntent } from "./staff-input-adapter.ts";

export type ScoreEditIntent = StaffEditIntent
  | { readonly kind: "history"; readonly direction: "undo" | "redo" }
  | { readonly kind: "document"; readonly title: string };

/** Application commands remain independent of notation-specific input grammar. */
export function scoreIntentToAction(intent: ScoreEditIntent, point: ScoreEditPoint | null,
  deleteTimePolicy: DeleteTimePolicy = "preserve"): ScoreEditAction | null {
  if (intent.kind === "history") return { kind: intent.direction };
  if (intent.kind === "document") return { kind: "set-title", title: intent.title };
  return staffIntentToAction(intent, point, deleteTimePolicy);
}
