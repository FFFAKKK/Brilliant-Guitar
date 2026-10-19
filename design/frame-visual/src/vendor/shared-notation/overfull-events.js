// Generated from shared/notation; run npm run notation:build.
import { durationUnits } from "./note-properties.js";
import { capacityUnits } from "./note-properties.js";
/** Events whose rhythmic end crosses or follows the nominal measure boundary. */
export function overfullEventIds(measure) {
    if (!measure.ruleWarnings.some((warning) => warning.code === "rule.sequence-exceeds-measure"))
        return new Set();
    const capacity = capacityUnits(measure);
    let offset = 0;
    const ids = new Set();
    for (const event of measure.events) {
        offset += durationUnits(event.duration);
        if (offset > capacity)
            ids.add(event.id);
    }
    return ids;
}
