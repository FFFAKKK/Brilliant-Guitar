// Generated from shared/notation; run npm run notation:build.
import { isInputDuration, isMeterInput } from "./note-properties.js";
import { isExactFraction } from "./notation-model.js";
export function isTablatureProjection(value) {
    return isTablatureView(value) || (record(value) && value.kind === "unsupported"
        && typeof value.message === "string" && value.message.length > 0);
}
/** Reject accidentally mixed reads even when the outer receipt looks current. */
export function pairedNotationMatches(staff, tab) {
    return staff.partId === tab.partId && staff.staffId === tab.staffId && staff.tempoBpm === tab.tempoBpm
        && staff.measures.length === tab.measures.length && staff.measures.every((measure, index) => {
        const other = tab.measures[index];
        return measure.id === other.id && measure.voiceId === other.voiceId
            && measure.meter.numerator === other.meter.numerator && measure.meter.denominator === other.meter.denominator
            && measure.events.length === other.events.length && measure.events.every((event, i) => {
            const item = other.events[i];
            return event.id === item.id && event.duration.base === item.duration.base && event.duration.dots === item.duration.dots
                && event.content.kind === item.content.kind;
        }) && measure.ruleWarnings.length === other.ruleWarnings.length && measure.ruleWarnings.every((warning, i) => {
            const item = other.ruleWarnings[i];
            return ["nominalDuration", "actualDuration", "overflow"].every(key => {
                const field = key;
                return warning[field].numerator === item[field].numerator && warning[field].denominator === item[field].denominator;
            });
        });
    });
}
const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
export function isFrettedDimensions(value) {
    return record(value) && typeof value.stringCount === "number" && Number.isSafeInteger(value.stringCount)
        && value.stringCount >= 1 && value.stringCount <= 32
        && (value.fretCount === null || (typeof value.fretCount === "number" && Number.isSafeInteger(value.fretCount)
            && value.fretCount >= 1))
        && typeof value.capoFret === "number" && Number.isSafeInteger(value.capoFret)
        && value.capoFret >= 0;
}
export function isFrettedPosition(value, dimensions) {
    return isFrettedDimensions(dimensions) && record(value)
        && typeof value.stringNumber === "number" && Number.isSafeInteger(value.stringNumber)
        && value.stringNumber >= 1 && value.stringNumber <= dimensions.stringCount
        && typeof value.fret === "number" && Number.isSafeInteger(value.fret)
        && value.fret >= 0 && value.fret <= Number.MAX_SAFE_INTEGER - dimensions.capoFret;
}
export function isTablatureDuration(value, rest) {
    return isInputDuration(value) || (rest && record(value) && value.base === 32 && value.dots === 0);
}
export function isTablatureView(value) {
    if (!record(value) || !isFrettedDimensions(value) || value.kind !== "tablature"
        || typeof value.partId !== "string" || !value.partId || typeof value.staffId !== "string" || !value.staffId
        || typeof value.tempoBpm !== "number" || !Number.isFinite(value.tempoBpm) || value.tempoBpm <= 0
        || !Array.isArray(value.measures) || !value.measures.length)
        return false;
    const ids = new Set([value.partId, value.staffId]);
    const unique = (id) => {
        if (typeof id !== "string" || !id || ids.has(id))
            return false;
        ids.add(id);
        return true;
    };
    return value.measures.every(raw => {
        if (!record(raw) || !unique(raw.id) || !unique(raw.voiceId) || !isMeterInput(raw.meter)
            || !Array.isArray(raw.events) || !Array.isArray(raw.ruleWarnings)
            || !raw.ruleWarnings.every(warning => record(warning) && warning.code === "rule.sequence-exceeds-measure"
                && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration)
                && isExactFraction(warning.overflow)))
            return false;
        return raw.events.every(event => {
            if (!record(event) || !unique(event.id) || !record(event.content))
                return false;
            const content = event.content;
            if (!isTablatureDuration(event.duration, content.kind === "rest"))
                return false;
            return content.kind === "rest" || (content.kind === "note" && unique(content.noteId)
                && isFrettedPosition(content.position, value));
        });
    });
}
