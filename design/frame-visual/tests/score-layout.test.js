import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { normalizeStaffSnapshot } from "../src/score/notation-model.js";
import { layoutScorePages } from "../src/score/staff-layout.js";

test("staff fixture has stable four-measure identities", () => {
  const snapshot = normalizeStaffSnapshot(STAFF_FIXTURE);
  assert.equal(snapshot.measures.length, 4);
  assert.equal(snapshot.measures[0].events[0].id, "event-1-1");
  assert.equal(snapshot.measures[3].events.at(-1).content.kind, "rest");
});

test("staff layout returns shared measure and event geometry", () => {
  const snapshot = normalizeStaffSnapshot(STAFF_FIXTURE);
  const layout = layoutScorePages(snapshot)[0];
  assert.equal(layout.measures.length, 4);
  assert.ok(layout.width >= layout.measures.at(-1).x + layout.measures.at(-1).width);
  assert.ok(layout.measures.every(measure => measure.width > 0));
  assert.ok(layout.measures.every(measure => measure.y >= 0));
});

test("invalid staff input is rejected before drawing", () => {
  assert.throws(() => normalizeStaffSnapshot({ measures: [] }), /至少一个小节/);
  assert.throws(() => normalizeStaffSnapshot({ measures: [{ id: "m", voiceId: "v", events: [{ id: "e" }] }] }), /事件无效/);
});
