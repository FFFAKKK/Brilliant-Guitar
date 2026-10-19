import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { createStaffProjectionPort } from "../src/score/staff-read-port.js";

test("staff projection exposes frozen reads, publishes normalized snapshots and releases subscribers", () => {
  const projection = createStaffProjectionPort({ snapshot: STAFF_FIXTURE });
  const received = [];
  const stop = projection.read.subscribe(snapshot => received.push(snapshot));
  assert.equal(projection.read.snapshot().measures[0].events[0].id, "event-1-1");
  assert.ok(Object.isFrozen(projection.read.snapshot()));

  const next = structuredClone(STAFF_FIXTURE);
  next.measures[0].events[0].id = "published-event";
  assert.deepEqual(projection.publish(next), { ok: true });
  assert.equal(received.length, 1);
  assert.equal(received[0].measures[0].events[0].id, "published-event");
  assert.ok(Object.isFrozen(received[0].measures[0].events[0]));

  stop();
  projection.dispose();
  assert.deepEqual(projection.publish(STAFF_FIXTURE), { ok: false, code: "score.projection.disposed" });
  assert.throws(() => projection.read.subscribe(() => {}), /已经释放/);
});
