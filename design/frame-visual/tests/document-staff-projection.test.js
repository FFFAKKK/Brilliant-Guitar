import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";

const session = (version, notation = STAFF_FIXTURE, documentId = "doc-1") => ({
  documentId, documentVersion: version, notation,
});

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
