import assert from "node:assert/strict";
import test from "node:test";
import type { StaffMeasure, StaffView } from "../src/contracts/notation.ts";
import type { NotationInteractionGeometry } from "../src/notation/notation-renderer.ts";
import { resolveStaffPointerTarget } from "../src/editor/staff-pointer-target.ts";

const note = (id: string, base: 1 | 2 | 4 | 8 = 4) => ({ id, duration: { base, dots: 0 as const },
  content: { kind: "note" as const, pitch: { step: "C" as const, octave: 5, alter: 0 as const } } });
const measure = (id: string, events: StaffMeasure["events"]): StaffMeasure => ({
  id, voiceId: `voice-${id}`, meter: { numerator: 4, denominator: 4 }, events, ruleWarnings: [],
});
const view = (...measures: StaffMeasure[]): StaffView => ({
  kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [], measures,
});
const geometry = (measureId: string, offsets: readonly number[], events: readonly { id: string; x: number }[] = []): NotationInteractionGeometry => ({
  measures: [{ measureId, x: 0, y: 0, width: 120, height: 80, staffBottom: 60, lineSpacing: 10 }],
  anchors: offsets.map((offsetUnits, index) => ({ measureId,
    anchor: index === 0 ? { kind: "start" as const } : { kind: "after-event" as const, eventId: events.at(-1)?.id ?? "tail" },
    offsetUnits, x: 10 + index * 25, y: 40, y1: 10, y2: 70 })),
  events: events.map((event) => ({ measureId, eventId: event.id, x: event.x, y: 20, width: 10, height: 40 })),
});

test("empty measures expose every visible beat without fabricating document events", () => {
  const score = view(measure("m1", []));
  const interaction = geometry("m1", [0, 16, 32, 48]);
  for (const [index, offsetUnits] of [0, 16, 32, 48].entries()) {
    const target = resolveStaffPointerTarget({ view: score, interaction, measureId: "m1",
      x: 10 + index * 25, y: 40, writeNow: false });
    assert.equal(target?.kind, "caret");
    if (target?.kind === "caret") assert.equal(target.point.offsetUnits, offsetUnits);
  }
  assert.deepEqual(score.measures[0]!.events, []);
});

test("direct event hits win over nearby anchors and double-click never overwrites an event", () => {
  const score = view(measure("m1", [note("e1")]));
  const interaction = geometry("m1", [0, 16], [{ id: "e1", x: 28 }]);
  assert.deepEqual(resolveStaffPointerTarget({ view: score, interaction, measureId: "m1", eventId: "e1",
    x: 33, y: 40, writeNow: false }), { kind: "event", eventId: "e1" });
  assert.equal(resolveStaffPointerTarget({ view: score, interaction, measureId: "m1", eventId: "e1",
    x: 33, y: 40, writeNow: true }), null);
});

test("an occupied first beat does not expose the measure-start boundary as an empty pointer target", () => {
  const score = view(measure("m1", [note("e1")]));
  const interaction = geometry("m1", [0, 16], [{ id: "e1", x: 28 }]);
  assert.deepEqual(resolveStaffPointerTarget({ view: score, interaction, measureId: "m1",
    x: 10, y: 40, writeNow: false }), { kind: "event", eventId: "e1" });
});

test("full and overfull measures keep their explicit tail caret inside the same measure", () => {
  for (const [events, tail] of [[[note("full", 1)], 64], [[note("whole", 1), note("extra", 4)], 80]] as const) {
    const score = view(measure("m1", events), measure("m2", []));
    const interaction = geometry("m1", [0, tail], events.map((event, index) => ({ id: event.id, x: 10 + index * 50 })));
    const target = resolveStaffPointerTarget({ view: score, interaction, measureId: "m1", x: 35, y: 40, writeNow: true });
    assert.equal(target?.kind, "caret");
    if (target?.kind === "caret") {
      assert.equal(target.point.measureId, "m1");
      assert.equal(target.point.offsetUnits, tail);
    }
  }
});

test("pointer targeting never borrows anchors or events from the following measure", () => {
  const score = view(measure("m1", []), measure("m2", [note("next")]));
  const first = geometry("m1", [0, 16, 32, 48]);
  const interaction: NotationInteractionGeometry = {
    measures: [...first.measures, { measureId: "m2", x: 140, y: 0, width: 120, height: 80, staffBottom: 60, lineSpacing: 10 }],
    anchors: [...first.anchors, { measureId: "m2", anchor: { kind: "start" }, offsetUnits: 0, x: 150, y: 40, y1: 10, y2: 70 }],
    events: [{ measureId: "m2", eventId: "next", x: 150, y: 20, width: 10, height: 40 }],
  };
  const target = resolveStaffPointerTarget({ view: score, interaction, measureId: "m1", x: 118, y: 40, writeNow: false });
  assert.equal(target?.kind, "caret");
  if (target?.kind === "caret") assert.equal(target.point.measureId, "m1");
});
