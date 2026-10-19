import assert from "node:assert/strict";
import test from "node:test";
import { createCoreScoreView } from "../src/score/core-score-view.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { createStaffProjectionPort } from "../src/score/staff-read-port.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
function drawing(id) {
  const svg = document.createElement("svg");
  // Only this renderer double needs SVG style removal. It does not qualify real engraving.
  Object.defineProperty(svg.style, "removeProperty", { value: key => svg.style.values.delete(key) });
  svg.setAttribute("width", "700");
  svg.setAttribute("height", "990");
  return { svg, layout: { width: 700, height: 990 }, interaction: { events: [{ eventId: id }] } };
}
function deferredRenderer() {
  const calls = [];
  return { calls, renderSnapshot: (snapshot, { signal }) => new Promise((resolve, reject) => {
    calls.push({ snapshot, signal, resolve, reject });
  }) };
}
function withView(renderer, run, snapshot = STAFF_FIXTURE) {
  return withTestDocument(async ({ document }) => {
    const element = document.createElement("section");
    document.body.append(element);
    const view = createCoreScoreView({ snapshot, renderSnapshot: renderer });
    try { return await run({ view, element }); }
    finally { view.dispose(); element.remove(); }
  });
}

test("core score adopts a successful SVG and its same-render interaction", () => {
  let result;
  return withView(() => Promise.resolve(result = drawing("ready-event")), async ({ view, element }) => {
    view.mount(element);
    await settle();
    assert.equal(element.dataset.renderState, "ready");
    assert.equal(element.firstChild, result.svg);
    assert.equal(element._scoreInteraction, result.interaction);
    assert.equal(result.svg.getAttribute("viewBox"), "0 0 700 990");
    assert.equal(result.svg.getAttribute("width"), null);
    assert.equal(result.svg.getAttribute("height"), null);
    assert.equal(element.querySelector(".score-view-message"), null);
  });
});

test("core score without a snapshot displays empty state without drawing a fixture", () => {
  let calls = 0;
  return withView(() => { calls++; return Promise.resolve(drawing("unexpected")); }, async ({ view, element }) => {
    view.mount(element);
    await settle();
    assert.equal(calls, 0);
    assert.equal(element.dataset.renderState, "empty");
    assert.equal(element._scoreInteraction, undefined);
    assert.match(element.textContent, /尚未提供谱面快照/);
  }, null);
});

test("core score keeps a frozen snapshot independent of the caller's later mutation", () => {
  const input = structuredClone(STAFF_FIXTURE);
  let received;
  return withView(snapshot => { received = snapshot; return Promise.resolve(drawing("copied")); }, async ({ view, element }) => {
    view.mount(element);
    input.measures[0].events[0].id = "caller-mutated";
    await settle();
    assert.equal(received.measures[0].events[0].id, "event-1-1");
    assert.ok(Object.isFrozen(received.measures[0].events[0]));
    assert.equal(element.dataset.renderState, "ready");
  }, input);
});

test("core score follows the application-owned read projection and unsubscribes on dispose", () => {
  const projection = createStaffProjectionPort({ snapshot: STAFF_FIXTURE });
  const { calls, renderSnapshot } = deferredRenderer();
  return withTestDocument(async ({ document }) => {
    const element = document.createElement("section");
    document.body.append(element);
    const view = createCoreScoreView({ score: projection.read, renderSnapshot });
    try {
      view.mount(element);
      await settle();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].snapshot.measures[0].events[0].id, "event-1-1");

      const next = structuredClone(STAFF_FIXTURE);
      next.measures[0].events[0].id = "projected-event";
      projection.publish(next);
      await settle();
      assert.ok(calls[0].signal.aborted);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].snapshot.measures[0].events[0].id, "projected-event");
      calls[1].resolve(drawing("projected"));
      await settle();
      assert.equal(element._scoreInteraction.events[0].eventId, "projected");

      view.dispose();
      const count = calls.length;
      projection.publish(STAFF_FIXTURE);
      await settle();
      assert.equal(calls.length, count);
    } finally {
      view.dispose();
      projection.dispose();
      element.remove();
    }
  });
});

test("core score rejects late results even when the old renderer ignores abort", () => {
  const { calls, renderSnapshot } = deferredRenderer();
  return withView(renderSnapshot, async ({ view, element }) => {
    view.mount(element); await settle();
    const next = structuredClone(STAFF_FIXTURE);
    next.measures[0].events[0].id = "new-snapshot";
    view.setSnapshot(next); await settle();
    assert.ok(calls[0].signal.aborted);
    assert.equal(element._scoreInteraction, undefined);
    const newest = drawing("newest");
    calls[1].resolve(newest); await settle();
    calls[0].resolve(drawing("stale")); await settle();
    assert.equal(element.dataset.renderState, "ready");
    assert.equal(element.firstChild, newest.svg);
    assert.equal(element._scoreInteraction, newest.interaction);
    view.setSnapshot(null);
    assert.equal(element.dataset.renderState, "empty");
    assert.equal(element._scoreInteraction, undefined);
  });
});

test("disposing the core score cancels pending drawing and prevents late DOM writes", () => {
  const { calls, renderSnapshot } = deferredRenderer();
  return withView(renderSnapshot, async ({ view, element }) => {
    view.mount(element); await settle();
    view.dispose();
    assert.ok(calls[0].signal.aborted);
    calls[0].resolve(drawing("released")); await settle();
    view.setSnapshot(STAFF_FIXTURE);
    assert.equal(calls.length, 1);
    assert.equal(element.childNodes.length, 0);
    assert.equal(element._scoreInteraction, undefined);
    view.dispose();
  });
});

test("core score exposes retry for an asynchronous drawing failure", () => {
  const { calls, renderSnapshot } = deferredRenderer();
  return withView(renderSnapshot, async ({ view, element }) => {
    view.mount(element); await settle();
    calls[0].reject(new Error("transient drawing failure")); await settle();
    assert.equal(element.dataset.renderState, "error");
    assert.equal(element._scoreInteraction, undefined);
    assert.match(element.textContent, /transient drawing failure/);
    element.querySelector("button").focus(); element.querySelector("button").click(); await settle();
    assert.equal(document.activeElement, element, "removed retry returns focus to its owning score view");
    const outside = document.createElement("button"); document.body.append(outside); outside.focus();
    calls[1].resolve(drawing("retried")); await settle();
    assert.equal(element.dataset.renderState, "ready");
    assert.equal(element._scoreInteraction.events[0].eventId, "retried");
    assert.equal(document.activeElement, outside, "late success must respect a user focus move"); outside.remove();
  });
});

test("core score exposes retry for a synchronous renderer failure", () => {
  let attempts = 0;
  return withView(() => {
    if (++attempts === 1) throw new Error("synchronous drawing failure");
    return Promise.resolve(drawing("sync-retried"));
  }, async ({ view, element }) => {
    assert.doesNotThrow(() => view.mount(element));
    await settle();
    assert.equal(element.dataset.renderState, "error");
    element.querySelector("button").click(); await settle();
    assert.equal(attempts, 2);
    assert.equal(element.dataset.renderState, "ready");
    assert.equal(element._scoreInteraction.events[0].eventId, "sync-retried");
  });
});

test("invalid replacement input is rejected without silently replacing the valid score", () => {
  let attempts = 0;
  return withView(() => { attempts++; return Promise.resolve(drawing("valid")); }, async ({ view, element }) => {
    view.mount(element); await settle();
    const current = element.firstChild;
    assert.throws(() => view.setSnapshot({ kind: "staff", measures: [] }), /至少一个小节/);
    assert.equal(attempts, 1);
    assert.equal(element.firstChild, current);
    assert.equal(element.dataset.renderState, "ready");
    assert.equal(element._scoreInteraction.events[0].eventId, "valid");
  });
});
