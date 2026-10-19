import assert from "node:assert/strict";
import test from "node:test";
import { layoutTablaturePages } from "../../../shared/notation/tablature-layout.ts";
import { createTablatureRenderer } from "../../../shared/notation/tablature-renderer.ts";
import { composeNotationPages } from "../../../shared/notation/compose-notation-pages.ts";
import type { TablatureView } from "../../../shared/notation/tablature-model.ts";

const view = (strings: number): TablatureView => ({ kind: "tablature", partId: "p", staffId: "s",
  stringCount: strings, fretCount: 24, capoFret: 0, tempoBpm: 96,
  measures: [{ id: "m", voiceId: "v", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [],
    events: [{ id: "e", duration: { base: 4, dots: 0 }, content: { kind: "note", noteId: "n",
      position: { stringNumber: strings, fret: 12 } } }] }] });

test("Tab layout validates the read projection and preserves domain-owned count/identity without pitches", () => {
  for (const count of [1, 4, 6, 7, 12, 32]) {
    const input = view(count), page = layoutTablaturePages(input)[0]!;
    assert.equal(page.stringCount, count);
    assert.equal(page.measures[0]!.measure, input.measures[0]);
    assert.equal(page.measures[0]!.measure.events[0]!.content.kind, "note");
    assert.ok(page.width >= page.measures[0]!.x + page.measures[0]!.width);
  }
  const invalid = view(4);
  assert.throws(() => layoutTablaturePages({ ...invalid, stringCount: 0 }), /Invalid tablature view/);
  assert.throws(() => layoutTablaturePages({ ...invalid, capoFret: Number.MAX_SAFE_INTEGER }), /Invalid tablature view/);
  assert.equal(layoutTablaturePages({ ...invalid, capoFret: 25, fretCount: null }).length, 1,
    "physical construction does not constrain the projection's numeric grammar");
  assert.throws(() => layoutTablaturePages({ ...invalid, stringCount: 3 }), /Invalid tablature view/);
});

test("Tab layout expands system height with string count and preserves meter changes on page starts", () => {
  const pages = (strings: number) => layoutTablaturePages({ ...view(strings),
    measures: Array.from({ length: 160 }, (_, index) => ({ id: "m" + index, voiceId: "v" + index,
      events: [], ruleWarnings: [], meter: { numerator: index < 80 ? 4 : 3, denominator: 4 } })) });
  const four = pages(4), six = pages(6);
  const fourY = four[0]!.measures.find(item => item.system === 1)!.y;
  const sixY = six[0]!.measures.find(item => item.system === 1)!.y;
  assert.ok(sixY > fourY);
  for (const page of [...four, ...six]) {
    assert.equal(page.measures[0]!.beginsSystem, true);
    assert.equal(page.measures[0]!.showMeter, true);
  }
  const changed = six.flatMap(page => page.measures).find(item => item.number === 81)!;
  assert.equal(changed.showMeter, true);
});

test("Tab renderer and page composition cancel without a UI runtime, DOM or loading fonts", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createTablatureRenderer(() => { throw new Error("must not acquire engine"); })
    .render(layoutTablaturePages(view(6))[0]!, { ink: "black", muted: "gray", fontFamily: "Academico" }, controller.signal),
  { name: "AbortError" });
  assert.throws(() => composeNotationPages([], [], controller.signal), { name: "AbortError" });
});
