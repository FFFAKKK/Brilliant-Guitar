// Generated from shared/notation; run npm run notation:build.
export function equalMeter(left, right) {
    return left.numerator === right.numerator && left.denominator === right.denominator;
}
/** Established meter-run rule: stop at the first different original meter. */
export function measureMeterTargets(measures, measureId, scope) {
    const start = measures.findIndex(item => item.id === measureId);
    if (start < 0)
        return [];
    const target = measures[start];
    const targets = [target];
    if (scope === "meter-run") {
        for (const measure of measures.slice(start + 1)) {
            if (!equalMeter(measure.meter, target.meter))
                break;
            targets.push(measure);
        }
    }
    return targets;
}
