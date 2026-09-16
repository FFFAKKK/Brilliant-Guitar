import type { EventDuration } from "../src/contracts/note-input.ts";

/** Exact binary rests used when an edit intentionally materializes silent space. */
export function restDurations(units: number): EventDuration[] {
  const durations: EventDuration[] = [];
  for (const base of [1, 2, 4, 8, 16, 32] as const) {
    while (units >= 64 / base) { durations.push({ base, dots: 0 }); units -= 64 / base; }
  }
  if (units !== 0) throw new Error("Unsupported fractional rest gap");
  return durations;
}
