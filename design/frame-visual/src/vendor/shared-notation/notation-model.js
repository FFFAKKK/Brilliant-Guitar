// Generated from shared/notation; run npm run notation:build.
import { isEventProperties } from "./note-properties.js";
export function isExactFraction(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const fraction = value;
    return typeof fraction.numerator === "number" && Number.isSafeInteger(fraction.numerator)
        && typeof fraction.denominator === "number" && Number.isSafeInteger(fraction.denominator)
        && fraction.denominator > 0;
}
function isStaffRuleWarning(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const warning = value;
    return warning.code === "rule.sequence-exceeds-measure"
        && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration)
        && isExactFraction(warning.overflow);
}
export function isNotationView(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const view = value;
    if (view.kind === "unsupported")
        return typeof view.message === "string" && view.message.length > 0;
    if (view.kind !== "staff" || !["treble", "bass", "alto", "tenor"].includes(view.clef)
        || typeof view.partId !== "string" || !view.partId || typeof view.staffId !== "string" || !view.staffId
        || typeof view.tempoBpm !== "number" || !Number.isFinite(view.tempoBpm) || view.tempoBpm <= 0
        || (view.keySignatureChanges !== undefined && !Array.isArray(view.keySignatureChanges))
        || !Array.isArray(view.measures) || !view.measures.length)
        return false;
    const ids = new Set();
    const measuresValid = view.measures.every((measure) => {
        if (typeof measure !== "object" || measure === null)
            return false;
        const item = measure;
        if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.voiceId !== "string" || !item.voiceId
            || ids.has(item.voiceId) || typeof item.meter !== "object" || item.meter === null)
            return false;
        ids.add(item.id);
        ids.add(item.voiceId);
        if (!Array.isArray(item.events) || !Array.isArray(item.ruleWarnings)
            || !item.ruleWarnings.every(isStaffRuleWarning))
            return false;
        for (const raw of item.events) {
            if (typeof raw !== "object" || raw === null)
                return false;
            const event = raw;
            if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !isEventProperties(event))
                return false;
            ids.add(event.id);
        }
        const meter = item.meter;
        return typeof meter.numerator === "number" && Number.isInteger(meter.numerator) && meter.numerator >= 1 && meter.numerator <= 32
            && typeof meter.denominator === "number" && [1, 2, 4, 8, 16, 32, 64].includes(meter.denominator);
    });
    if (!measuresValid)
        return false;
    const measures = view.measures;
    let previousIndex = -1;
    return (view.keySignatureChanges ?? []).every((raw) => {
        if (typeof raw !== "object" || raw === null)
            return false;
        const change = raw;
        if (typeof change.measureId !== "string" || !change.measureId
            || typeof change.measureIndex !== "number" || !Number.isSafeInteger(change.measureIndex)
            || change.measureIndex <= previousIndex || change.measureIndex >= measures.length
            || measures[change.measureIndex]?.id !== change.measureId
            || typeof change.fifths !== "number" || !Number.isSafeInteger(change.fifths)
            || change.fifths < -7 || change.fifths > 7)
            return false;
        previousIndex = change.measureIndex;
        return true;
    });
}
