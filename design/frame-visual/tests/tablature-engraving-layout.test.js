import test from "node:test";
import assert from "node:assert/strict";
import { layoutTablaturePages } from "../src/vendor/shared-notation/tablature-layout.js";
import { flowScoreMeasures, SCORE_PAPER } from "../src/vendor/shared-notation/paper-flow.js";
import { TABLATURE_FIXTURE } from "../src/fixtures/tablature-snapshot.js";
import { TABLATURE_ENGRAVING_CASES } from "../src/fixtures/tablature-engraving-regression.js";

test("Tab systems fill paper margins without changing musical content or measure order", () => {
  for (const view of [TABLATURE_FIXTURE, ...TABLATURE_ENGRAVING_CASES.map(sample => sample.snapshot)]) {
    const before = JSON.stringify(view), pages = layoutTablaturePages(view);
    assert.deepEqual(pages.flatMap(page => page.measures.map(item => item.measure.id)),
      view.measures.map(measure => measure.id));
    for (const page of pages) for (const system of new Set(page.measures.map(item => item.system))) {
      const row = page.measures.filter(item => item.system === system);
      assert.equal(row[0].x, SCORE_PAPER.margin);
      assert.equal(row.at(-1).x + row.at(-1).width, SCORE_PAPER.width - SCORE_PAPER.margin);
      for (const [index, item] of row.entries()) {
        assert.ok(item.width > 0);
        if (index) assert.equal(item.x, row[index - 1].x + row[index - 1].width);
      }
    }
    assert.equal(JSON.stringify(view), before, "engraving must not rewrite notes, strings, frets or durations");
  }
});

test("shared paper flow keeps its original natural-width behavior unless requested", () => {
  const input = TABLATURE_FIXTURE.measures;
  const options = { firstY: 60, pageY: 60, systemHeight: 180, bottomReserve: 130, width: () => 100 };
  const natural = flowScoreMeasures(input, options);
  const justified = flowScoreMeasures(input, { ...options, justifySystems: true });
  assert.equal(natural[0].at(-1).x + natural[0].at(-1).width, 460);
  assert.equal(justified[0].at(-1).x + justified[0].at(-1).width, 640);
  assert.deepEqual(justified.flatMap(page => page.map(item => item.measure)), input);
});
