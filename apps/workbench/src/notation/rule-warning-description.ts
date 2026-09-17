import type { StaffMeasure } from "../contracts/notation.ts";

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a), right = Math.abs(b);
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function fractionText(numerator: number, denominator: number): string {
  const divisor = greatestCommonDivisor(numerator, denominator);
  const top = numerator / divisor, bottom = denominator / divisor;
  return bottom === 1 ? String(top) : `${top}/${bottom}`;
}

/** Human-facing detail for the compact score warning mark. */
export function describeMeasureRuleWarnings(number: number, measure: StaffMeasure): string | null {
  const warning = measure.ruleWarnings.find((item) => item.code === "rule.sequence-exceeds-measure");
  if (!warning) return null;
  const beats = fractionText(
    warning.overflow.numerator * measure.meter.denominator,
    warning.overflow.denominator,
  );
  return `第 ${number} 小节超出 ${beats} 拍`;
}
