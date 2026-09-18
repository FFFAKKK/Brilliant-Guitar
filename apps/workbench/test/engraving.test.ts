import assert from "node:assert/strict";
import test from "node:test";
import { Beam, Stave, StaveNote } from "vexflow";
import { eventNoteSpec } from "../src/notation/vexflow-note-spec.ts";
import { recenterPaperViewport } from "../src/notation/paper-viewport.ts";
import { fitScorePaper } from "../src/notation/score-page-layout.ts";
import { rhythmCaretCenterY } from "../src/notation/notation-renderer.ts";

test("real whole rests hang from line four; half rests sit on line three", () => {
  const stave = new Stave(60, 50, 200);
  const rest = (base: 1 | 2 | 4) => ({ id: "rest", duration: { base, dots: 0 } as const, content: { kind: "rest" } as const });
  const whole = new StaveNote(eventNoteSpec(rest(1))).setStave(stave);
  const half = new StaveNote(eventNoteSpec(rest(2))).setStave(stave);
  assert.equal(whole.getYs()[0], stave.getYForLine(1));
  assert.equal(half.getYs()[0], stave.getYForLine(2));
});

test("compound meters beam eighths in dotted-quarter groups", () => {
  assert.deepEqual(Beam.getDefaultBeamGroups("6/8").map((group) => group.value()), [3 / 8]);
  assert.deepEqual(Beam.getDefaultBeamGroups("9/8").map((group) => group.value()), [3 / 8]);
  assert.deepEqual(Beam.getDefaultBeamGroups("4/4").map((group) => group.value()), [1 / 4]);
});

test("viewport resizing preserves the paper point at the center and never scrolls before the paper", () => {
  const before = { width: 600, height: 400, paperWidth: 700, scale: 1, gutter: 20 };
  const after = { width: 600, height: 400, paperWidth: 1050, scale: 1.5, gutter: 20 };
  const scroll = recenterPaperViewport(before, after, { left: 100, top: 200 });
  assert.equal(scroll.left, 290);
  assert.equal(scroll.top, 400);
  assert.deepEqual(recenterPaperViewport(before, before, { left: 100, top: 200 }), { left: 100, top: 200 });
  assert.deepEqual(recenterPaperViewport({ ...before, scale: 0 }, after, { left: 0, top: 0 }), { left: 0, top: 0 });
  assert.ok(recenterPaperViewport(after, before, { left: 0, top: 0 }).left >= 0);
  // A dock shrinking the host must not scroll the first system off the top.
  assert.deepEqual(recenterPaperViewport(before, { ...before, height: 200 }, { left: 0, top: 0 }, true), { left: 0, top: 0 });
  assert.deepEqual(recenterPaperViewport(before, after, { left: 100, top: 200 }, true), scroll);
});

test("refitting a previously oversized page clears horizontal drift as docks resize", () => {
  let previous = { width: 515, height: 524, paperWidth: 956, scale: 956 / 700, gutter: 20 };
  let scroll = { left: 280, top: 0 };
  for (const size of [{ width: 515, height: 524 }, { width: 240, height: 280 }, { width: 1440, height: 900 }]) {
    const fit = fitScorePaper(size);
    const next = { ...size, paperWidth: fit.width, scale: fit.scale, gutter: fit.gutter };
    scroll = recenterPaperViewport(previous, next, scroll, true);
    assert.deepEqual(scroll, { left: 0, top: 0 });
    previous = next;
  }
});

test("the rhythm caret stays centered on the staff independently of pointer pitch", () => {
  assert.equal(rhythmCaretCenterY({ y1: 42, y2: 58 }), 50);
  assert.equal(rhythmCaretCenterY({ y1: -10, y2: 10 }), 0);
});
