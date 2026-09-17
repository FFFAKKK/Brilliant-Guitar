import assert from "node:assert/strict";
import test from "node:test";
import type { StaffView } from "../src/contracts/notation.ts";
import { fitScorePaper, layoutScorePages, SCORE_PAPER } from "../src/notation/score-page-layout.ts";
import { ENGRAVING, STAFF_SPACE, staffSpaces } from "../src/notation/engraving-metrics.ts";

function emptyScore(count: number): StaffView {
  return { kind: "staff", clef: "treble", partId: "part", staffId: "staff",
    measures: Array.from({ length: count }, (_, index) => ({ id: `measure-${index}`, voiceId: `voice-${index}`, events: [], meter: { numerator: 4, denominator: 4 }, ruleWarnings: [] })) };
}

test("A4 fits both axes without distorting its ratio or overflowing the host", () => {
  for (const size of [{ width: 1200, height: 700 }, { width: 420, height: 800 }, { width: 600, height: 280 }, { width: 0, height: 0 }]) {
    const fit = fitScorePaper(size);
    assert.ok(fit.width <= size.width && fit.height <= size.height);
    assert.equal(fit.width, SCORE_PAPER.width * fit.scale);
    assert.equal(fit.height, SCORE_PAPER.height * fit.scale);
    if (fit.scale) assert.ok(Math.abs(fit.width / fit.height - 210 / 297) < 0.00001);
  }
  assert.equal(fitScorePaper({ width: NaN, height: Infinity }).scale, 0);
});

test("a new score keeps one compact bar and paper layout does not depend on screen size", () => {
  const score = emptyScore(1);
  const before = structuredClone(score);
  const pages = layoutScorePages(score);
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.measures.length, 1);
  assert.ok(pages[0]!.measures[0]!.width / ENGRAVING.paperUnitsPerMm < 40);
  assert.ok(Math.abs(pages[0]!.staffSpace! * 4 / ENGRAVING.paperUnitsPerMm - ENGRAVING.staffHeightMm) < 0.00001);
  assert.ok(pages[0]!.measures[0]!.width < SCORE_PAPER.width - SCORE_PAPER.margin * 2);
  fitScorePaper({ width: 320, height: 700 });
  assert.deepEqual(layoutScorePages(score), pages);
  assert.deepEqual(score, before);
});

test("measures flow into pages exactly once and repeat clef and meter at each system", () => {
  const pages = layoutScorePages(emptyScore(128));
  assert.ok(pages.length > 1);
  const all = pages.flatMap((page) => page.measures);
  assert.deepEqual(all.map((item) => item.number), Array.from({ length: 128 }, (_, index) => index + 1));
  assert.equal(new Set(all.map((item) => item.measure.id)).size, 128);
  for (const page of pages) {
    assert.ok(page.measures[0]?.beginsSystem);
    for (const [index, item] of page.measures.entries()) {
      assert.ok(item.x >= SCORE_PAPER.margin && item.x + item.width <= SCORE_PAPER.width - SCORE_PAPER.margin);
      assert.ok(item.y + staffSpaces(14) <= SCORE_PAPER.height - SCORE_PAPER.margin);
      if (item.beginsSystem) assert.ok(item.showMeter);
      const previous = page.measures[index - 1];
      if (previous && previous.system === item.system) assert.equal(previous.x + previous.width, item.x);
    }
  }
});

test("dock resizing refits the page and notation together without a minimum pixel scale", () => {
  const sizes = [{ width: 1440, height: 900 }, { width: 515, height: 524 }, { width: 240, height: 280 },
    { width: 515, height: 524 }, { width: 1440, height: 900 }];
  const fits = sizes.map(fitScorePaper);
  for (const [index, fit] of fits.entries()) {
    const size = sizes[index]!;
    assert.ok(fit.width + fit.gutter * 2 <= size.width + 0.00001);
    assert.ok(fit.height <= size.height);
    assert.ok(Math.abs(fit.width / fit.height - 210 / 297) < 0.00001);
    assert.ok(Math.abs((STAFF_SPACE * fit.scale) / fit.width - STAFF_SPACE / SCORE_PAPER.width) < 0.00001);
  }
  assert.ok(fits[2]!.scale < fits[1]!.scale && fits[1]!.scale < fits[0]!.scale);
  assert.deepEqual(fits[3], fits[1]);
  assert.deepEqual(fits[4], fits[0]);
});

test("dense rhythm, accidentals and extreme ledger pitches reserve paper space without losing events", () => {
  const score = emptyScore(24);
  const dense: StaffView = { ...score, measures: score.measures.map((measure) => ({ ...measure,
    events: Array.from({ length: 16 }, (_, index) => ({ id: `${measure.id}-event-${index}`,
      duration: { base: 16, dots: 0 } as const,
      content: { kind: "note", pitch: { step: index % 2 ? "B" : "C", octave: index % 2 ? 6 : 2, alter: 1 } } as const,
    })),
  })) };
  const before = structuredClone(dense);
  const pages = layoutScorePages(dense);
  assert.ok(pages[0]!.measures[0]!.width > layoutScorePages(score)[0]!.measures[0]!.width);
  assert.deepEqual(pages.flatMap((page) => page.measures).map((item) => item.measure.id), dense.measures.map((measure) => measure.id));
  for (const page of pages) for (const item of page.measures) {
    assert.ok(item.x + item.width <= SCORE_PAPER.width - SCORE_PAPER.margin);
    assert.ok(item.y + staffSpaces(14 + 8) <= SCORE_PAPER.height - SCORE_PAPER.margin);
  }
  assert.deepEqual(dense, before);
});
