import assert from "node:assert/strict";
import test from "node:test";
import { fitScorePaper, SCORE_PAPER } from "../src/notation/score-page-layout.ts";
import { PAPER_ZOOM, stepPaperZoom, zoomFittedPaper } from "../src/notation/paper-zoom.ts";
import { recenterPaperViewport } from "../src/notation/paper-viewport.ts";

test("zoom magnifies the fitted A4 and its glyphs as one page without changing its ratio", () => {
  const size = { width: 780, height: 640 };
  const fit = fitScorePaper(size);
  const larger = zoomFittedPaper(fit, PAPER_ZOOM.initial);
  assert.equal(larger.paperWidth, fit.width * 1.75);
  assert.equal(larger.height, fit.height * 1.75);
  assert.equal(larger.scale, fit.scale * 1.75);
  assert.ok(Math.abs(larger.paperWidth / larger.height - SCORE_PAPER.width / SCORE_PAPER.height) < 0.000001);
  assert.deepEqual(zoomFittedPaper(fit, PAPER_ZOOM.fit), { paperWidth: fit.width, height: fit.height, scale: fit.scale, gutter: fit.gutter });
});

test("zoom steps stop at bounds and viewport recentering follows the visible center", () => {
  assert.equal(stepPaperZoom(PAPER_ZOOM.min, -1), PAPER_ZOOM.min);
  assert.equal(stepPaperZoom(PAPER_ZOOM.max, 1), PAPER_ZOOM.max);
  const size = { width: 500, height: 480 }, fit = fitScorePaper(size);
  const before = zoomFittedPaper(fit, 175), after = zoomFittedPaper(fit, 200);
  const position = recenterPaperViewport({ ...size, paperWidth: before.paperWidth, scale: before.scale, gutter: before.gutter },
    { ...size, paperWidth: after.paperWidth, scale: after.scale, gutter: after.gutter }, { left: 0, top: 80 });
  assert.ok(position.top > 80);
  assert.ok(position.left >= 0);
  assert.ok(position.left <= after.paperWidth + after.gutter * 2 - size.width);
  const atStart = recenterPaperViewport({ ...size, paperWidth: before.paperWidth, scale: before.scale, gutter: before.gutter },
    { ...size, paperWidth: after.paperWidth, scale: after.scale, gutter: after.gutter }, { left: 0, top: 0 }, true);
  assert.deepEqual(atStart, { left: 0, top: 0 });
});
