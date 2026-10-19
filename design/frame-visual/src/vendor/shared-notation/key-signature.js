// Generated from shared/notation; run npm run notation:build.
const KEY_SPECS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
export function keySignatureSpec(fifths) {
    return KEY_SPECS[fifths + 7] ?? "C";
}
export function keySignatureAlterForStep(fifths, step) {
    if (!Number.isSafeInteger(fifths) || fifths === 0 || fifths < -7 || fifths > 7)
        return 0;
    const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
    return order.slice(0, Math.abs(fifths)).includes(step) ? (fifths > 0 ? 1 : -1) : 0;
}
export function keySignatureStates(view) {
    const states = [];
    let current = 0;
    let changeIndex = 0;
    for (let measureIndex = 0; measureIndex < view.measures.length; measureIndex += 1) {
        const previousFifths = current;
        const change = view.keySignatureChanges?.[changeIndex];
        const changed = change?.measureIndex === measureIndex;
        if (changed) {
            current = change.fifths;
            changeIndex += 1;
        }
        states.push({ fifths: current, previousFifths, changed });
    }
    return states;
}
export function keySignatureStateAtMeasure(view, measureId) {
    const target = view.measures.findIndex(measure => measure.id === measureId);
    if (target < 0)
        return null;
    const changes = view.keySignatureChanges ?? [];
    let low = 0, high = changes.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const change = changes[middle];
        if (change.measureIndex <= target) {
            low = middle + 1;
        }
        else
            high = middle - 1;
    }
    const change = changes[high], changed = change?.measureIndex === target;
    return { fifths: change?.fifths ?? 0, changed,
        previousFifths: changed ? changes[high - 1]?.fifths ?? 0 : change?.fifths ?? 0 };
}
export function keySignatureFifthsAtMeasure(view, measureId) {
    return keySignatureStateAtMeasure(view, measureId)?.fifths ?? 0;
}
export function keySignatureChangeIsNoOp(view, measureId, change) {
    const state = keySignatureStateAtMeasure(view, measureId);
    return !!state && (change.kind === "set" ? state.fifths === change.fifths : !state.changed);
}
