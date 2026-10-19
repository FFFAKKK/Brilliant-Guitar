// Generated from shared/notation; run npm run notation:build.
// Shared read-only notation properties, extracted from the established Workbench.
const record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
export const NOTE_BASES = [1, 2, 4, 8, 16];
export const PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"];
/** Compare musical properties only; event identity and derived geometry are separate. */
export function equalEventProperties(a, b) {
    return a.duration.base === b.duration.base && a.duration.dots === b.duration.dots
        && (a.content.kind === "rest" ? b.content.kind === "rest" : b.content.kind === "note"
            && a.content.pitch.step === b.content.pitch.step && a.content.pitch.octave === b.content.pitch.octave
            && a.content.pitch.alter === b.content.pitch.alter);
}
export const METER_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];
export const STAFF_CLEFS = ["treble", "bass", "alto", "tenor"];
export function isInputDuration(v) {
    return record(v) && NOTE_BASES.includes(v.base) && (v.dots === 0 || v.dots === 1);
}
export function isEventProperties(v) {
    return record(v) && isInputContent(v.content) && (isInputDuration(v.duration)
        || (v.content.kind === "rest" && record(v.duration) && v.duration.base === 32 && v.duration.dots === 0));
}
export function isInputContent(v) {
    if (!record(v))
        return false;
    if (v.kind === "rest")
        return true;
    const p = v.pitch;
    return v.kind === "note" && record(p) && PITCH_STEPS.includes(p.step)
        && typeof p.octave === "number" && Number.isInteger(p.octave) && p.octave >= 2 && p.octave <= 6 && [-1, 0, 1].includes(p.alter);
}
export function isMeterInput(value) {
    return record(value) && typeof value.numerator === "number" && Number.isSafeInteger(value.numerator)
        && value.numerator >= 1 && value.numerator <= 32
        && typeof value.denominator === "number"
        && METER_DENOMINATORS.includes(value.denominator);
}
/** Exact units for the supported binary and single-dotted durations. No floating beat accumulation. */
export const durationUnits = (duration) => 64 / duration.base * (duration.dots ? 1.5 : 1);
export const capacityUnits = (measure) => 64 * measure.meter.numerator / measure.meter.denominator;
