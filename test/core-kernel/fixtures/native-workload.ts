import { createCoreScoreFixture } from "./core-score";
import type { ScoreDocument } from "../../../src/core-kernel/index";

/** Same one-part, four-notes-per-bar diagnostic workload as the Native profiler. */
export function createNativeWorkloadScore(measures: number) {
  const value = createCoreScoreFixture();
  const measureDefinitions: ScoreDocument["measureDefinitions"][number][] = [];
  const measureContents: ScoreDocument["parts"][number]["measureContents"][number][] = [];
  for (let m = 1; m <= measures; m++) {
    measureDefinitions.push({ id: `measure-${m}`, meter: { numerator: 4, denominator: 4 } });
    measureContents.push({ measureId: `measure-${m}`, voices: [{ id: `voice-${m}`, defaultStaffId: "staff-1",
      sequence: { start: { numerator: 0, denominator: 1 }, events: Array.from({ length: 4 }, (_, e) => ({
        id: `event-${(m - 1) * 4 + e + 1}`, duration: { base: 4 as const, dots: 0 as const },
        content: { kind: "notes" as const, notes: [{ id: `note-${(m - 1) * 4 + e + 1}`, writtenPitch: { step: "C" as const, alter: 0, octave: 4 } }] },
      })) } }] });
  }
  return { ...value, measureDefinitions, parts: [{ ...value.parts[0]!, measureContents }] };
}
