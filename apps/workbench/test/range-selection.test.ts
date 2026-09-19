import assert from "node:assert/strict";
import test from "node:test";
import type { StaffEvent, StaffView } from "../src/contracts/notation.ts";
import { resolveScoreEventRange, selectScoreEventRange, stepScoreEventRange } from "../src/editor/range-selection.ts";

const event = (id: string): StaffEvent => ({ id, duration: { base: 4, dots: 0 }, content: { kind: "rest" } });
const view: StaffView = { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [], measures: [
  { id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [],
    events: [event("a"), event("b"), event("c"), event("d")] },
  { id: "m2", voiceId: "v2", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [event("e")] },
] };

test("shift selection resolves a continuous range in score order", () => {
  const selection = selectScoreEventRange(view, null, "b", "d");
  assert.deepEqual(selection, { measureId: "m1", voiceId: "v1", anchorEventId: "b", focusEventId: "d" });
  assert.deepEqual(resolveScoreEventRange(view, selection)?.eventIds, ["b", "c", "d"]);
  assert.deepEqual(resolveScoreEventRange(view, selectScoreEventRange(view, null, "d", "b"))?.eventIds, ["b", "c", "d"]);
});

test("keyboard range extension expands and shrinks from a stable anchor", () => {
  const expanded = stepScoreEventRange(view, null, "b", 1);
  assert.deepEqual(resolveScoreEventRange(view, expanded)?.eventIds, ["b", "c"]);
  const wider = stepScoreEventRange(view, expanded, "c", 1);
  assert.deepEqual(resolveScoreEventRange(view, wider)?.eventIds, ["b", "c", "d"]);
  const shrunk = stepScoreEventRange(view, wider, "d", -1);
  assert.deepEqual(resolveScoreEventRange(view, shrunk)?.eventIds, ["b", "c"]);
});

test("a range never crosses a measure or survives stale endpoints", () => {
  assert.equal(selectScoreEventRange(view, null, "d", "e"), null);
  assert.equal(resolveScoreEventRange(view, { measureId: "m1", voiceId: "v1",
    anchorEventId: "missing", focusEventId: "d" }), null);
});
