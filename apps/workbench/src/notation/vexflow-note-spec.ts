import type { StaveNoteStruct } from "vexflow";
import type { StaffEvent } from "../contracts/notation.ts";

/** R lets VexFlow choose the conventional line for each rest duration.
 * A pitch key would override that rule (B4 puts a whole rest on the middle line).
 */
export function eventNoteSpec(event: StaffEvent): StaveNoteStruct {
  const pitch = event.content.kind === "note" ? event.content.pitch : null;
  return {
    keys: [pitch ? `${pitch.step.toLowerCase()}/${pitch.octave}` : "r/4"],
    duration: `${event.duration.base}${event.duration.dots ? "d" : ""}${pitch ? "" : "r"}`,
    autoStem: true,
  };
}
