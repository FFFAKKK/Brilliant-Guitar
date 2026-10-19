import { durationUnits } from "./note-properties.ts";
import type { StaffMeasure } from "./notation-model.ts";
import { capacityUnits } from "./note-properties.ts";

/** Events whose rhythmic end crosses or follows the nominal measure boundary. */
export function overfullEventIds(measure: Pick<StaffMeasure, "meter" | "ruleWarnings"> & {
  readonly events: readonly { readonly id: string; readonly duration: StaffMeasure["events"][number]["duration"] }[];
}): ReadonlySet<string> {
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
