type MeterRead = { readonly numerator: number; readonly denominator: number };

export function equalMeter(left: MeterRead, right: MeterRead): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/** Established meter-run rule: stop at the first different original meter. */
export function measureMeterTargets<T extends { readonly id: string; readonly meter: MeterRead }>(
  measures: readonly T[], measureId: string, scope: "measure" | "meter-run",
): readonly T[] {
  const start = measures.findIndex(item => item.id === measureId);
  if (start < 0) return [];
  const target = measures[start]!;
  const targets = [target];
  if (scope === "meter-run") {
    for (const measure of measures.slice(start + 1)) {
      if (!equalMeter(measure.meter, target.meter)) break;
      targets.push(measure);
    }
  }
  return targets;
}
