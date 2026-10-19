/** Nearest rank; retain every sample, including slow values. Works in Node and browsers. */
export function timingStats(samples) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) throw new TypeError("Invalid timing samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.ceil(fraction * sorted.length) - 1];
  return { count: samples.length, median: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1),
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length };
}
