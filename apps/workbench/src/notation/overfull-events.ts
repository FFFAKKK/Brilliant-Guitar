import { durationUnits } from "../contracts/note-input.ts";
import type { StaffMeasure } from "../contracts/notation.ts";
import { capacityUnits } from "./input-position.ts";

/** Events whose rhythmic end crosses or follows the nominal measure boundary. */
export function overfullEventIds(measure: StaffMeasure): ReadonlySet<string> {
  if (!measure.ruleWarnings.some((warning) => warning.code === "rule.sequence-exceeds-measure")) return new Set();
  const capacity = capacityUnits(measure);
  let offset = 0;
  const ids = new Set<string>();
  for (const event of measure.events) {
    offset += durationUnits(event.duration);
    if (offset > capacity) ids.add(event.id);
  }
  return ids;
}
