// Generated from shared/notation; run npm run notation:build.
function greatestCommonDivisor(a, b) {
    let left = Math.abs(a), right = Math.abs(b);
    while (right)
        [left, right] = [right, left % right];
    return left || 1;
}
function fractionText(numerator, denominator) {
    const divisor = greatestCommonDivisor(numerator, denominator);
    const top = numerator / divisor, bottom = denominator / divisor;
    return bottom === 1 ? String(top) : `${top}/${bottom}`;
}
/** Human-facing detail for the compact score warning mark. */
export function describeMeasureRuleWarnings(number, measure) {
    const warning = measure.ruleWarnings.find((item) => item.code === "rule.sequence-exceeds-measure");
    if (!warning)
        return null;
    const beats = fractionText(warning.overflow.numerator * measure.meter.denominator, warning.overflow.denominator);
    return `第 ${number} 小节超出 ${beats} 拍`;
}
