import assert from "node:assert/strict";
import test from "node:test";
import type { StaffMeasure } from "../src/contracts/notation.ts";
import { overfullEventIds } from "../src/notation/overfull-events.ts";

const note = (id: string, base: 1 | 2 | 4 | 8, octave = 5) => ({
  id,
  duration: { base, dots: 0 as const },
  content: { kind: "note" as const, pitch: { step: "C" as const, octave, alter: 0 as const } },
});

function measure(events: StaffMeasure["events"], warning = true): StaffMeasure {
  return {
    id: "measure",
    voiceId: "voice",
    meter: { numerator: 4, denominator: 4 },
    events,
    ruleWarnings: warning ? [{
      code: "rule.sequence-exceeds-measure",
      nominalDuration: { numerator: 1, denominator: 1 },
      actualDuration: { numerator: 5, denominator: 4 },
      overflow: { numerator: 1, denominator: 4 },
    }] : [],
  };
}

test("marks the event crossing the measure boundary and every event after it", () => {
  const ids = overfullEventIds(measure([
    note("half", 2),
    note("quarter", 4),
    note("crossing", 2),
    note("after", 8),
  ]));
  assert.deepEqual([...ids], ["crossing", "after"]);
});

test("does not infer an overfull state without the kernel rule warning", () => {
  const ids = overfullEventIds(measure([
    note("whole", 1),
    note("extra", 4),
  ], false));
  assert.deepEqual([...ids], []);
});

test("pitch position does not change overfull event classification", () => {
  const low = overfullEventIds(measure([note("whole", 1, 1), note("extra", 4, 1)]));
  const high = overfullEventIds(measure([note("whole", 1, 8), note("extra", 4, 8)]));
  assert.deepEqual([...low], [...high]);
});

test("an event ending exactly at measure capacity is not marked", () => {
  const ids = overfullEventIds(measure([note("whole", 1)]));
  assert.deepEqual([...ids], []);
});
