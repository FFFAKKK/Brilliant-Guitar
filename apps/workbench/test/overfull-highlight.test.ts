import assert from "node:assert/strict";
import test from "node:test";
import type { StaffMeasure } from "../src/contracts/notation.ts";
import type { NotationInteractionGeometry } from "../src/notation/notation-renderer.ts";
import type { StaffLayout } from "../src/notation/staff-layout.ts";
import { resolveOverfullHighlights } from "../src/notation/overfull-highlight.ts";

const note = (id: string, base: 1 | 2 | 4 | 8) => ({ id, duration: { base, dots: 0 as const },
  content: { kind: "note" as const, pitch: { step: "C" as const, octave: 5, alter: 0 as const } } });

function fixture(events: StaffMeasure["events"], warning: boolean) {
  const measure: StaffMeasure = { id: "measure", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, events,
    ruleWarnings: warning ? [{ code: "rule.sequence-exceeds-measure", nominalDuration: { numerator: 1, denominator: 1 },
      actualDuration: { numerator: 5, denominator: 4 }, overflow: { numerator: 1, denominator: 4 } }] : [] };
  const layout: StaffLayout = { width: 300, height: 160, clef: "treble", measures: [
    { measure, number: 1, system: 0, x: 20, y: 20, width: 240, beginsSystem: true, showMeter: true },
  ] };
  const interaction: NotationInteractionGeometry = { anchors: [], measures: [
    { measureId: "measure", x: 20, y: 20, width: 240, height: 120, staffTop: 50, staffBottom: 90, lineSpacing: 10,
      nominalEndX: 190, actualEndX: 240 },
  ], events: events.map((event, index) => ({ measureId: "measure", eventId: event.id,
    x: 60 + index * 35, y: 55 + index * 2, width: 14, height: 14 })) };
  return { layout, interaction };
}

test("the overfull annotation underlines only the rhythmic region beyond the nominal boundary", () => {
  const { layout, interaction } = fixture([note("a", 4), note("b", 4), note("c", 4), note("d", 4), note("extra", 4)], true);
  const highlight = resolveOverfullHighlights(layout, interaction)[0]!;
  const measure = interaction.measures[0]!;
  assert.equal(highlight.x, measure.nominalEndX!);
  assert.ok(highlight.x > measure.x + measure.width / 2);
  assert.equal(highlight.x + highlight.width, measure.actualEndX!);
  assert.equal(highlight.y, 107.5);
  assert.equal(highlight.description, "第 1 小节超出 1 拍");
});

test("the warning region is stable when overfull notes move between high and low pitches", () => {
  const { layout, interaction } = fixture([note("half", 2), note("quarter", 4), note("crossing", 2)], true);
  const before = resolveOverfullHighlights(layout, interaction)[0]!;
  const moved: NotationInteractionGeometry = { ...interaction, events: interaction.events.map((event, index) => ({
    ...event, y: index % 2 ? -80 : 180,
  })) };
  assert.deepEqual(resolveOverfullHighlights(layout, moved)[0], before);
});

test("valid measures produce no visual warning region", () => {
  const { layout, interaction } = fixture([note("whole", 1)], false);
  assert.deepEqual(resolveOverfullHighlights(layout, interaction), []);
});

test("non-overflow rule metadata does not create an overfull region", () => {
  const { layout, interaction } = fixture([note("whole", 1)], true);
  assert.deepEqual(resolveOverfullHighlights(layout, interaction), []);
});
