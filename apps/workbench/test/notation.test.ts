import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createScoreSession, ScoreSessionService } from "../host/score-session.ts";
import { projectNotation } from "../host/notation-projection.ts";
import { isNotationView } from "../src/contracts/notation.ts";
import { isScoreSessionRead } from "../src/contracts/score-session.ts";
import { layoutStaff } from "../src/notation/staff-layout.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";

function readDocument(count: number) {
  const bus = createScoreSession({ title: "谱面验证", measureCount: count });
  const read = bus.read();
  assert.ok(read.ok);
  return { bus, read: read.value, document: read.value.snapshot.document };
}

test("notation uses the real atomic Native read and rendering preparation never changes its history", () => {
  const { bus, read, document } = readDocument(7);
  const view = projectNotation(document);
  assert.equal(view.kind, "staff");
  if (view.kind !== "staff") return;
  assert.equal(view.staffId, document.parts[0]?.staves[0]?.id);
  assert.deepEqual(view.measures.map((measure) => measure.id), document.measureDefinitions.map((measure) => measure.id));
  // Content lookup uses stable IDs rather than coincidental array order.
  const reordered: ScoreDocument = { ...document, parts: document.parts.map((part) => ({
    ...part, measureContents: [...part.measureContents].reverse(),
  })) };
  assert.deepEqual(projectNotation(reordered), view);
  for (const width of [240, 640, 1120]) layoutStaff(view, width);
  assert.deepEqual(bus.read(), { ok: true, value: read });
  const service = new ScoreSessionService();
  const workspace = randomUUID();
  const result = service.create(workspace, randomUUID(), null, { title: "同版本", measureCount: 3 });
  assert.ok(isScoreSessionRead(result));
  assert.deepEqual(result, service.read(workspace));
  assert.equal(result.documentVersion, 0);
});

test("rests are projected while unsupported staff structures remain explicit", () => {
  const { document } = readDocument(1);
  const withRest: ScoreDocument = { ...document, parts: document.parts.map((part) => ({ ...part,
    measureContents: part.measureContents.map((content) => ({ ...content,
      voices: content.voices.map((voice) => ({ ...voice, sequence: { ...voice.sequence,
        events: [{ id: "real-rest", duration: { base: 4, dots: 0 }, content: { kind: "rest" } }],
      } })),
    })),
  })) };
  const restView = projectNotation(withRest);
  assert.equal(restView.kind, "staff");
  if (restView.kind === "staff") assert.deepEqual(restView.measures[0]?.events, [
    { id: "real-rest", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  ]);
  const bass: ScoreDocument = { ...document, parts: document.parts.map((part) => ({ ...part,
    staves: part.staves.map((staff) => ({ ...staff, defaultClef: { sign: "F", line: 4 } })),
  })) };
  assert.equal(projectNotation(bass).kind, "unsupported");
  const missing: ScoreDocument = { ...document, parts: document.parts.map((part) => ({ ...part, measureContents: [] })) };
  assert.equal(projectNotation(missing).kind, "unsupported");
});

test("responsive layout retains every measure exactly once with no overlaps or clipping", () => {
  for (const count of [1, 4, 7, 128]) {
    const view = projectNotation(readDocument(count).document);
    assert.equal(view.kind, "staff");
    if (view.kind !== "staff") return;
    for (const width of [0, 240, 278, 560, 900, 1120]) {
      const layout = layoutStaff(view, width);
      assert.equal(layout.measures.length, count);
      assert.deepEqual(layout.measures.map((item) => item.number), Array.from({ length: count }, (_, index) => index + 1));
      assert.equal(new Set(layout.measures.map((item) => item.measure.id)).size, count);
      for (const [index, item] of layout.measures.entries()) {
        assert.ok(item.width > 100);
        assert.ok(item.x >= 0 && item.x + item.width <= layout.width + 0.001);
        assert.ok(item.y + 100 < layout.height);
        const previous = layout.measures[index - 1];
        if (previous?.system === item.system) assert.ok(Math.abs(previous.x + previous.width - item.x) < 0.001);
        else assert.ok(item.beginsSystem);
      }
    }
  }
});

test("meter changes follow document data while malformed transport projections are rejected", () => {
  const { document } = readDocument(4);
  const changed: ScoreDocument = { ...document, measureDefinitions: document.measureDefinitions.map((measure, index) =>
    index >= 2 ? { ...measure, meter: { numerator: 3, denominator: 4 } } : measure) };
  const view = projectNotation(changed);
  assert.equal(view.kind, "staff");
  if (view.kind !== "staff") return;
  assert.deepEqual(layoutStaff(view, 1120).measures.map((item) => item.showMeter), [true, false, true, false]);
  assert.equal(view.measures[2]?.meter.numerator, 3);
  assert.ok(isNotationView(view));
  assert.ok(!isNotationView({ ...view, measures: [] }));
  assert.ok(!isNotationView({ ...view, measures: [view.measures[0], view.measures[0]] }));
  assert.ok(!isNotationView({ ...view, measures: [{ id: "bad", meter: { numerator: 4, denominator: 0 } }] }));
  assert.ok(!isScoreSessionRead({ documentId: document.id, title: "坏摘要", measureCount: 1, documentVersion: 0, notation: view }));
});
