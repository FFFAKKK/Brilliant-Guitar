import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { DiagnosticsCoordinator, type DiagnosticsIdentity, type DiagnosticsState } from "../src/client/diagnostics-coordinator.ts";
import { runDiagnostics, inputSummary } from "./run-diagnostics-fixture.ts";

const identity = (patch: Partial<DiagnosticsIdentity> = {}): DiagnosticsIdentity => ({ connectionEpoch: 1, sessionId: "session-1", runId: "run-1",
  selectedProfileId: "profile-1", configurationKey: "target-1", enabled: true, hostSequence: 1, running: false, ...patch });
function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const requests: { signal: AbortSignal; resolve(value: unknown): void; reject(error: Error): void }[] = [];
  const states: DiagnosticsState[] = [];
  const coordinator = new DiagnosticsCoordinator({ request: (signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })), publish: (state) => states.push(state) });
  t.after(() => coordinator.dispose());
  return { coordinator, requests, states, last: () => states.at(-1)! };
}
const flush = async () => { await setImmediate(); };

test("closed panels do no reads; open/refresh use GET only and closing isolates late failure", async (t) => {
  const h = harness(t); h.coordinator.update(null); assert.equal(h.requests.length, 0);
  h.coordinator.update(identity()); assert.equal(h.requests.length, 1);
  h.requests[0]!.resolve(runDiagnostics()); await flush(); assert.equal(h.last().phase, "ready");
  h.coordinator.refresh(); assert.equal(h.requests.length, 2);
  h.coordinator.update(null); assert.equal(h.requests[1]!.signal.aborted, true);
  h.requests[1]!.reject(new Error("old failure")); await flush(); assert.equal(h.last().phase, "closed");
  t.mock.timers.tick(10000); assert.equal(h.requests.length, 2);
});

test("session/run/profile/target/enable changes clear immediately and late successes never win", async (t) => {
  const h = harness(t); let current = identity(); h.coordinator.update(current);
  const changes: Partial<DiagnosticsIdentity>[] = [{ sessionId: "session-2" }, { runId: "run-2" }, { selectedProfileId: "profile-2" }, { configurationKey: "target-2" }, { enabled: false }];
  for (const change of changes) {
    const previous = h.requests.at(-1)!;
    current = { ...current, ...change }; h.coordinator.update(current);
    assert.equal(previous.signal.aborted, true); assert.equal(h.last().data, null); assert.equal(h.last().phase, "loading");
    const count = h.requests.length; previous.resolve(runDiagnostics()); await flush();
    assert.equal(h.requests.length, count + 1); assert.equal(h.last().data, null);
  }
  h.requests.at(-1)!.resolve(runDiagnostics({ sessionId: current.sessionId, runId: current.runId, selectedProfileId: current.selectedProfileId,
    availability: "disabled", modelInput: null, omittedHistoryTurns: null })); await flush();
  assert.equal(h.last().data?.availability, "disabled");
});

test("continuous stream events coalesce at one second without trailing-debounce starvation", async (t) => {
  const h = harness(t); h.coordinator.update(identity({ running: true })); h.requests[0]!.resolve(runDiagnostics()); await flush();
  for (let i = 1; i <= 20; ++i) { h.coordinator.update(identity({ running: true, hostSequence: i + 1 })); t.mock.timers.tick(50); }
  assert.equal(h.requests.length, 2); h.requests[1]!.resolve(runDiagnostics({ hostSequence: 21 })); await flush();
  t.mock.timers.tick(999); assert.equal(h.requests.length, 2); t.mock.timers.tick(1); assert.equal(h.requests.length, 3);
  h.requests[2]!.resolve(runDiagnostics({ hostSequence: 21 })); await flush();
});

test("slow and uncancellable reads keep only one in flight; latest state gets one queued read", async (t) => {
  const h = harness(t); h.coordinator.update(identity({ running: true }));
  for (let i = 2; i <= 20; ++i) { h.coordinator.update(identity({ running: true, hostSequence: i })); h.coordinator.refresh(); }
  t.mock.timers.tick(2000); assert.equal(h.requests.length, 1);
  h.requests[0]!.resolve(runDiagnostics()); await flush(); assert.equal(h.requests.length, 2); assert.equal(h.last().data, null);
  h.requests[1]!.resolve(runDiagnostics({ hostSequence: 20 })); await flush(); assert.equal(h.last().phase, "ready");
  h.coordinator.update(null); t.mock.timers.tick(2000); assert.equal(h.requests.length, 2);
});

test("same public target with a later Host sequence cannot display a pre-credential-change response", async (t) => {
  const h = harness(t); h.coordinator.update(identity()); h.requests[0]!.resolve(runDiagnostics()); await flush();
  h.coordinator.refresh(); h.coordinator.update(identity({ hostSequence: 2 })); assert.equal(h.last().data, null);
  h.requests[1]!.resolve(runDiagnostics()); await flush(); assert.equal(h.last().data, null); assert.equal(h.requests.length, 3);
  h.requests[2]!.resolve(runDiagnostics({ hostSequence: 2, configurationEpoch: 1, availability: "configuration-changed", modelInput: null, omittedHistoryTurns: null }));
  await flush(); assert.equal(h.last().data?.availability, "configuration-changed");
  h.coordinator.refresh(); h.coordinator.update(identity({ hostSequence: 3 }));
  const states = h.states.length; h.requests[3]!.reject(new Error("stale same-target failure")); await flush();
  assert.ok(!h.states.slice(states).some((state) => state.phase === "error")); assert.equal(h.requests.length, 5);
  h.requests[4]!.resolve(runDiagnostics({ hostSequence: 3, configurationEpoch: 1, availability: "configuration-changed", modelInput: null, omittedHistoryTurns: null })); await flush();
});

test("reconnect resets host baseline and rejects old success/failure from the previous epoch", async (t) => {
  const h = harness(t); h.coordinator.update(identity()); h.coordinator.update(null);
  h.coordinator.update(identity({ connectionEpoch: 2, hostSequence: 0 })); assert.equal(h.requests.length, 1);
  h.requests[0]!.reject(new Error("old connection failed")); await flush(); assert.equal(h.requests.length, 2); assert.equal(h.last().phase, "loading");
  h.requests[1]!.resolve(runDiagnostics({ hostInstanceId: "host-2", hostSequence: 0 })); await flush(); assert.equal(h.last().phase, "ready");
  h.coordinator.refresh(); h.requests[2]!.resolve(runDiagnostics({ hostInstanceId: "host-3", hostSequence: 0 })); await flush(); assert.equal(h.last().phase, "error");
});

test("invalid DTO, foreign Run and regressing configuration produce only a local diagnostic error", async (t) => {
  const h = harness(t); h.coordinator.update(identity()); h.requests[0]!.resolve(runDiagnostics({ configurationEpoch: 4 })); await flush();
  for (const value of [{ ...runDiagnostics(), actualUsage: 12 }, runDiagnostics({ runId: "other-run", modelInput: inputSummary({ runId: "other-run" }) }), runDiagnostics({ configurationEpoch: 3 })]) {
    h.coordinator.refresh(); h.requests.at(-1)!.resolve(value); await flush(); assert.equal(h.last().phase, "error"); assert.equal(h.last().data, null);
  }
});

test("terminal refresh and disposal stop timers and publish no late state", async (t) => {
  const h = harness(t); h.coordinator.update(identity({ running: true })); h.requests[0]!.resolve(runDiagnostics()); await flush();
  h.coordinator.update(identity({ running: false, hostSequence: 2 }));
  assert.equal(h.requests.length, 1); t.mock.timers.tick(1000); assert.equal(h.requests.length, 2);
  h.requests[1]!.resolve(runDiagnostics({ hostSequence: 2 })); await flush();
  t.mock.timers.tick(10000); assert.equal(h.requests.length, 2);
  h.coordinator.refresh(); const states = h.states.length; h.coordinator.dispose(); h.requests[2]!.resolve(runDiagnostics({ hostSequence: 2 }));
  await flush(); t.mock.timers.tick(10000); assert.equal(h.states.length, states); assert.equal(h.requests.length, 3);
});
