import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { TABLATURE_FIXTURE } from "../src/fixtures/tablature-snapshot.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";

const session = (version, notation = STAFF_FIXTURE, documentId = "doc-1") => ({
  documentId, documentVersion: version, notation,
});
const flush = () => new Promise(resolve => setImmediate(resolve));
const replacement = replacementGeneration => ({ kind: "document-read-change", replacementGeneration });

test("document staff projection accepts authoritative sessions and rejects stale versions", async () => {
  let current = session(1);
  const projection = createDocumentStaffProjection({ readSession: async () => current });
  const events = [];
  projection.subscribe(value => events.push(value));
  assert.deepEqual(await projection.refresh(), {
    ok: true, changed: true, status: "ready", documentId: "doc-1", documentVersion: 1,
  });
  assert.equal(projection.read.snapshot().kind, "staff");
  current = session(0);
  assert.deepEqual(await projection.refresh(), {
    ok: false, code: "score.document-projection.stale", documentId: "doc-1", documentVersion: 1,
  });
  assert.equal(events.length, 1);
  projection.dispose();
});

test("document staff projection drops unsupported notation without inventing a staff snapshot", async () => {
  const projection = createDocumentStaffProjection({
    readSession: async () => session(3, { kind: "unsupported", message: "暂不支持" }),
  });
  assert.equal((await projection.refresh()).status, "unsupported");
  assert.equal(projection.read.snapshot(), null);
  assert.equal(projection.snapshot().status, "unsupported");
  projection.dispose();
});

test("document staff projection refreshes from the application subscription and cancels after dispose", async () => {
  let notify;
  let calls = 0;
  const projection = createDocumentStaffProjection({
    readSession: async () => { calls += 1; return session(calls); },
    subscribe(listener) { notify = listener; return () => { notify = null; }; },
  });
  projection.start();
  notify();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(projection.snapshot().documentVersion, 2);
  projection.dispose();
  assert.equal(notify, null);
});

test("accepted replacements allow lower and equal versions but ordinary and legacy notifications remain monotonic", async () => {
  let current = session(7), notify;
  const projection = createDocumentStaffProjection({ readSession: async () => current,
    subscribe(listener) { notify = listener; return () => {}; } });
  try {
    projection.start(); await flush();
    current = session(0, { ...STAFF_FIXTURE, tempoBpm: 132 });
    notify(replacement(1)); await flush();
    assert.equal(projection.snapshot().documentVersion, 0);
    assert.equal(projection.read.snapshot().tempoBpm, 132);
    assert.equal((await projection.refresh()).ok, true);
    current = session(0, { ...STAFF_FIXTURE, tempoBpm: 144 });
    notify(replacement(2)); await flush();
    assert.equal(projection.read.snapshot().tempoBpm, 144);
    current = session(4); notify(); await flush();
    current = session(1);
    for (const change of [undefined, { kind: "legacy-change" }, replacement(2)]) {
      notify(change); await flush();
      assert.equal(projection.snapshot().documentVersion, 4);
      assert.equal((await projection.refresh()).code, "score.document-projection.stale");
    }
  } finally { projection.dispose(); }
});

test("bad staff/Tab replacement does not poison the accepted generation and a corrected retry still replaces the old pair", async () => {
  let current = { ...session(7), tablature: TABLATURE_FIXTURE }, notify;
  const projection = createDocumentStaffProjection({ readSession: async () => current,
    subscribe(listener) { notify = listener; return () => {}; } });
  try {
    projection.start(); await flush();
    const staff = projection.read.snapshot(), tab = projection.read.notation("tablature");
    current = { ...session(0), tablature: { ...TABLATURE_FIXTURE, staffId: "wrong-staff" } };
    notify(replacement(1)); await flush();
    assert.equal(projection.snapshot().status, "error");
    assert.equal(projection.snapshot().documentVersion, 7);
    assert.equal(projection.read.snapshot(), staff);
    assert.equal(projection.read.notation("tablature"), tab);
    current = { ...session(0, { ...STAFF_FIXTURE, tempoBpm: 132 }),
      tablature: { ...TABLATURE_FIXTURE, tempoBpm: 132 } };
    assert.equal((await projection.read.retry()).ok, true);
    assert.equal(projection.snapshot().documentVersion, 0);
    assert.equal(projection.read.snapshot().tempoBpm, 132);
    assert.equal(projection.read.notation("tablature").tempoBpm, 132);
    current = session(1); notify(); await flush();
    current = session(0); notify(); await flush();
    assert.equal((await projection.refresh()).code, "score.document-projection.stale");
  } finally { projection.dispose(); }
});

test("invalid or rolled-back replacement signals preserve the accepted watermark", async () => {
  let current = session(7), notify;
  const projection = createDocumentStaffProjection({ readSession: async () => current,
    subscribe(listener) { notify = listener; return () => {}; } });
  try {
    projection.start(); await flush();
    notify(replacement(2)); await flush();
    const accepted = projection.read.snapshot();
    current = session(0);
    for (const generation of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1, "3", undefined, 1]) {
      notify(replacement(generation)); await flush();
      assert.equal(projection.snapshot().status, "error");
      assert.equal(projection.snapshot().documentVersion, 7);
      assert.equal(projection.read.snapshot(), accepted);
      assert.equal((await projection.refresh()).code, "score.document-projection.stale");
    }
    notify(replacement(3)); await flush();
    assert.equal(projection.snapshot().documentVersion, 0);
  } finally { projection.dispose(); }
});

test("reads superseded by a replacement or disposal never publish late notation", async () => {
  let current = session(7), notify, finish;
  const projection = createDocumentStaffProjection({ readSession: () => current,
    subscribe(listener) { notify = listener; return () => {}; } });
  projection.start(); await flush();
  current = new Promise(resolve => { finish = resolve; });
  const pending = projection.refresh();
  current = session(0); notify(replacement(1)); await flush();
  finish(session(9));
  assert.equal((await pending).code, "score.document-projection.superseded");
  assert.equal(projection.snapshot().documentVersion, 0);
  current = new Promise(resolve => { finish = resolve; });
  const late = projection.refresh();
  projection.dispose(); finish(session(8));
  assert.equal((await late).code, "score.document-projection.superseded");
  assert.equal(projection.snapshot().documentVersion, 0);
});
