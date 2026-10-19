import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createScoreSelection } from "../src/score/score-selection.js";
import { createCoreScoreView } from "../src/score/core-score-view.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";
import { createBackupFormalPlatform, prepareBackupPlugin } from "../src/host/formal-plugin-assembly.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createNotices } from "../src/runtime/notices.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { SCORE_SELECTION_COMMANDS as C } from "../src/contracts/score-selection.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { clickAt, loadCoreSelectionPluginForTest, renderSelectionFixture, settle, sourceFixture } from "./support/score-selection-fixture.js";

const revision = owner => owner.read.snapshot().sourceRevision;
const select = (owner, eventId = "event-1-1") => owner.select({ eventId, sourceRevision: revision(owner) });
const navigate = (owner, key) => owner.navigate({ key, sourceRevision: revision(owner) });

test("selection reuses the established machine/navigation and never changes source music", () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read }), before = JSON.stringify(source.read.snapshot());
  try {
    assert.equal(owner.read.snapshot().target.kind, "unavailable");
    assert.equal(select(owner).ok, true);
    assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    assert.equal(navigate(owner, "ArrowRight").ok, true);
    assert.equal(owner.read.snapshot().target.eventId, "event-1-2");
    navigate(owner, "End"); assert.equal(owner.read.snapshot().target.eventId, "event-1-4");
    navigate(owner, "ArrowRight");
    assert.equal(owner.read.snapshot().target.kind, "caret");
    assert.equal(owner.read.snapshot().target.point.offsetUnits, 64);
    navigate(owner, "Home"); assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    navigate(owner, "Escape"); assert.equal(owner.read.snapshot().target.kind, "caret");
    assert.equal(JSON.stringify(source.read.snapshot()), before);
    assert.ok(Object.isFrozen(owner.read.snapshot().target.point.anchor));
  } finally { owner.dispose(); source.dispose(); }
});

test("range owner resolves inclusive reverse IDs, clamps arrows and rejects cross-measure extension", () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read });
  try {
    select(owner, "event-1-4");
    assert.equal(owner.select({ eventId: "event-1-2", sourceRevision: revision(owner), extend: true }).ok, true);
    assert.deepEqual(owner.read.snapshot().range.eventIds, ["event-1-2", "event-1-3", "event-1-4"]);
    assert.equal(Object.isFrozen(owner.read.snapshot().range.eventIds), true);
    const before = owner.read.snapshot();
    assert.equal(owner.select({ eventId: "event-2-1", sourceRevision: revision(owner), extend: true }).code, "score.selection.range-boundary");
    assert.equal(owner.read.snapshot(), before);
    owner.navigate({ key: "ArrowLeft", sourceRevision: revision(owner), extend: true });
    owner.navigate({ key: "ArrowLeft", sourceRevision: revision(owner), extend: true });
    assert.deepEqual(owner.read.snapshot().range.eventIds, ["event-1-1", "event-1-2", "event-1-3", "event-1-4"]);
    assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    navigate(owner, "Escape"); assert.equal(owner.read.snapshot().range, null); assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    navigate(owner, "Escape"); assert.equal(owner.read.snapshot().target.kind, "caret");
  } finally { owner.dispose(); source.dispose(); }
});

test("range revision binds same-source target changes and clears on new accepted source", () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read });
  try {
    select(owner); const first = owner.read.snapshot();
    select(owner, "event-1-2"); const second = owner.read.snapshot();
    assert.equal(second.sourceRevision, first.sourceRevision); assert.ok(second.selectionRevision > first.selectionRevision);
    owner.navigate({ key: "ArrowRight", sourceRevision: revision(owner), extend: true }); assert.ok(owner.read.snapshot().range);
    source.publish(structuredClone(STAFF_FIXTURE), { documentVersion: 1 });
    assert.equal(owner.read.snapshot().range, null); assert.equal(owner.read.snapshot().target.kind, "event");
  } finally { owner.dispose(); source.dispose(); }
});

test("invalid payloads and stale drawing tokens cannot move the interaction target", () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read });
  try {
    select(owner); const target = owner.read.snapshot().target;
    for (const method of ["select", "locate", "navigate"]) for (const value of [null, false, [], { unknown: true }]) {
      assert.equal(owner[method](value).code, "score.selection.invalid-payload");
    }
    assert.equal(owner.select({ eventId: "event-1-2", sourceRevision: revision(owner) - 1 }).code, "score.selection.stale");
    assert.equal(select(owner, "missing").code, "score.selection.missing-event");
    assert.equal(owner.locate({ measureId: "measure-1", offsetUnits: 3, sourceRevision: revision(owner) }).code, "score.selection.missing-position");
    assert.equal(navigate(owner, "Delete").code, "score.selection.invalid-payload");
    assert.deepEqual(owner.read.snapshot().target, target);
  } finally { owner.dispose(); source.dispose(); }
});

test("same-document updates reconcile focus; document replacement clears IDs even when reused", () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read });
  try {
    select(owner); const old = revision(owner);
    const next = structuredClone(STAFF_FIXTURE); next.measures[0].events.shift();
    source.publish(next, { documentVersion: 1 });
    assert.equal(owner.read.snapshot().target.kind, "caret");
    assert.equal(owner.select({ eventId: "event-1-2", sourceRevision: old }).code, "score.selection.stale");
    select(owner, "event-1-2");
    source.publish(next, { documentVersion: 2 });
    assert.equal(owner.read.snapshot().target.eventId, "event-1-2");
    source.publish(next, { documentId: "document-two", documentVersion: 0 });
    assert.equal(owner.read.snapshot().target.kind, "unavailable");
  } finally { owner.dispose(); source.dispose(); }
});

test("read failure disables commands without destroying the accepted target; cleanup stops delivery", async () => {
  const source = sourceFixture(), owner = createScoreSelection({ score: source.read });
  let delivered = 0; const stop = owner.read.subscribe(() => { delivered++; });
  select(owner); source.publish(STAFF_FIXTURE, { status: "error" });
  assert.equal(select(owner).code, "score.selection.not-ready");
  assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
  source.publish(STAFF_FIXTURE, { status: "ready" }); assert.equal(select(owner).ok, true);
  stop(); stop(); const count = delivered;
  owner.dispose(); owner.dispose();
  source.publish(STAFF_FIXTURE); await settle();
  assert.equal(source.listeners(), 0); assert.equal(delivered, count);
  assert.equal(select(owner).code, "score.selection.disposed"); source.dispose();
});

test("repeated selection lifetimes do not accumulate source listeners", () => {
  const source = sourceFixture();
  try {
    for (let index = 0; index < 100; index++) {
      const owner = createScoreSelection({ score: source.read }); assert.equal(source.listeners(), 1);
      select(owner); owner.dispose(); assert.equal(source.listeners(), 0);
    }
  } finally { source.dispose(); }
});

function withView(run, snapshot = STAFF_FIXTURE) {
  return withTestDocument(async ({ document }) => {
    const element = document.createElement("section"); document.body.append(element);
    const source = sourceFixture(snapshot), owner = createScoreSelection({ score: source.read }), calls = [];
    const execute = (id, payload) => { calls.push({ id, payload }); return owner[Object.keys(C).find(key => C[key] === id)](payload); };
    const view = createCoreScoreView({ score: source.read, selection: owner.read, execute, renderSnapshot: renderSelectionFixture }).mount(element);
    try {
      await settle(); assert.equal(element.dataset.renderState, "ready", element.textContent);
      return await run({ element, source, owner, view, calls });
    }
    finally { view.dispose(); owner.dispose(); source.dispose(); element.remove(); }
  });
}

test("event clicks use the current engraving and update only a noninteractive overlay", () => withView(({ element, owner, calls }) => {
  const svg = element.querySelector(".score-view-svg"), before = [...svg.childNodes];
  clickAt(svg.querySelector('[data-event-id="event-1-2"]'), 45, 15);
  assert.equal(calls[0].id, C.select); assert.equal(owner.read.snapshot().target.eventId, "event-1-2");
  const overlay = svg.querySelector('[data-score-selection="event"]'); assert.ok(overlay);
  assert.equal(overlay.getAttribute("x"), "40"); assert.equal(overlay.getAttribute("y"), "10");
  assert.equal(overlay.getAttribute("pointer-events"), "none");
  assert.deepEqual(svg.childNodes.slice(0, before.length), before); assert.equal(element.ownerDocument.activeElement, element);
}));

test("second-page empty beats use the outer SVG screen inverse at fractional zoom, with a rhythm-centered caret", () => {
  const input = structuredClone(STAFF_FIXTURE); input.measures[1].events = [];
  return withView(({ element, owner, calls }) => {
    const svg = element.querySelector(".score-view-svg");
    svg.getScreenCTM = () => ({ inverse: () => ({ a: .8, b: 0, c: 0, d: .8, e: -16, f: -24 }) });
    // Paper (50,240) -> screen (82.5,330), within the second page at 125%.
    clickAt(svg.querySelector('[data-measure-id="measure-2"]'), 82.5, 330);
    assert.equal(calls[0].id, C.locate); assert.equal(owner.read.snapshot().target.point.measureId, "measure-2");
    assert.equal(owner.read.snapshot().target.point.offsetUnits, 32);
    const caret = svg.querySelector('[data-score-selection="caret"]'); assert.ok(caret);
    assert.equal(Number(caret.getAttribute("y")) + Number(caret.getAttribute("height")) / 2, 225);
    assert.equal(element.querySelector(".score-view-svg"), svg);
  }, input);
});

test("foreign/detached hits, invalid matrices, modifiers and hidden views never route pointer commands", () => withView(({ element, calls, view }) => {
  const svg = element.querySelector(".score-view-svg"), hit = svg.querySelector('[data-event-id="event-1-1"]');
  clickAt(hit, 25, 15, { ctrlKey: true }); clickAt(hit, 25, 15, { button: 2 });
  svg.getScreenCTM = () => ({ inverse() { throw new Error("singular"); } }); clickAt(hit, 25, 15);
  svg.getScreenCTM = () => ({ inverse: () => ({ a: NaN }) }); clickAt(hit, 25, 15);
  view.setVisible(false); clickAt(hit, 25, 15); assert.equal(calls.length, 0);
}));

test("pending or superseded drawing geometry cannot accept a pointer input", async () => withView(async ({ element, source, calls }) => {
  const old = element.querySelector('[data-event-id="event-1-1"]');
  source.publish(STAFF_FIXTURE, { documentVersion: 1 });
  clickAt(old, 25, 15); assert.equal(calls.length, 0);
  await settle(); assert.notEqual(element.querySelector('[data-event-id="event-1-1"]'), old);
  source.publish(STAFF_FIXTURE, { status: "error" });
  clickAt(element.querySelector('[data-event-id="event-1-1"]'), 25, 15); assert.equal(calls.length, 0);
}));

test("selection feedback and click handlers are removed on view release", () => withView(({ element, view, owner, calls }) => {
  const hit = element.querySelector('[data-event-id="event-1-1"]'); clickAt(hit, 25, 15);
  view.dispose(); select(owner, "event-1-2"); clickAt(hit, 25, 15);
  assert.equal(calls.length, 1); assert.equal(element.children.length, 0);
  assert.equal(element.getAttribute("aria-description"), null); assert.equal(element.getAttribute("tabindex"), null);
}));

test("the actual document projection preserves focus on read failure and clears it on replacement", () => withTestDocument(async ({ document }) => {
  let failure = false, documentId = "document-one";
  const source = createDocumentStaffProjection({ readSession: async () => {
    if (failure) throw new Error("read unavailable");
    return { documentId, documentVersion: 0, notation: { kind: "staff", ...STAFF_FIXTURE } };
  } });
  const owner = createScoreSelection({ score: source.read });
  const execute = (id, payload) => owner[Object.keys(C).find(key => C[key] === id)](payload);
  const element = document.createElement("section"); document.body.append(element);
  const view = createCoreScoreView({ score: source.read, selection: owner.read, execute, renderSnapshot: renderSelectionFixture }).mount(element);
  try {
    await source.refresh(); await settle();
    assert.equal(element.dataset.renderState, "ready", element.textContent);
    clickAt(element.querySelector('[data-event-id="event-1-1"]'), 25, 15);
    const svg = element.querySelector(".score-view-svg");
    failure = true; await source.refresh();
    assert.equal(owner.read.snapshot().available, false);
    assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    assert.equal(element.querySelector(".score-view-svg"), svg);
    assert.equal(svg.querySelector('[data-score-selection="event"]'), null);
    failure = false; await source.refresh(); await settle();
    assert.equal(owner.read.snapshot().target.eventId, "event-1-1");
    assert.ok(element.querySelector('[data-score-selection="event"]'));
    documentId = "document-two"; await source.refresh(); await settle();
    assert.equal(owner.read.snapshot().target.kind, "unavailable");
    assert.equal(element.querySelector('[data-score-selection="event"]'), null);
    clickAt(element.querySelector('[data-event-id="event-1-2"]'), 45, 15);
    assert.equal(owner.read.snapshot().target.eventId, "event-1-2");
  } finally { view.dispose(); owner.dispose(); source.dispose(); }
}));

test("the real core declaration uses the formal platform, restricted commands and original keyboard boundary", () => withTestDocument(async ({ document }) => {
  const { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
  const source = sourceFixture(), router = createCommandRouter(), registry = createComponentRegistry(), notices = createNotices();
  const platform = createBackupFormalPlatform({ router, components: registry, menus: createMenuRegistry([{ id: "file", label: "File" }, { id: "edit", label: "Edit" }]) });
  platform.register(prepareBackupPlugin(createCoreScorePlugin({ score: source.read }))); platform.start();
  const host = createComponentHost({ registry, router, notices }), element = host.ensure("notation.core.view", "stage");
  document.body.append(element); const stopKey = bindKeyboard(router, { root: element, components: host });
  const key = (target, value, extra = {}) => {
    const event = new Event("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "key", { value });
    for (const [name, value] of Object.entries(extra)) Object.defineProperty(event, name, { value });
    target.dispatchEvent(event); return event;
  };
  try {
    await settle(); clickAt(element.querySelector('[data-event-id="event-1-1"]'), 25, 15);
    assert.equal(key(element, "ArrowRight").defaultPrevented, true);
    assert.equal(element.querySelector('[data-score-selection="event"]').getAttribute("x"), "40");
    const field = document.createElement("input"); element.append(field);
    assert.equal(key(field, "ArrowRight").defaultPrevented, false);
    assert.equal(key(element, "ArrowRight", { isComposing: true }).defaultPrevented, false);
    assert.equal(key(element, "ArrowRight", { ctrlKey: true }).defaultPrevented, false);
    assert.equal(router.execute(C.select, null).code, "score.selection.invalid-payload");
    assert.equal(notices.state().entries.length, 0);
  } finally { stopKey(); host.dispose(); platform.dispose(); source.dispose(); }
  assert.equal(source.listeners(), 0); assert.equal(router.describe(C.select), null); assert.equal(element.children.length, 0);
}));

test("independent workspace factories never share selection, and a released view remounts cleanly", () => withTestDocument(async ({ document }) => {
  const { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
  function workspace() {
    const source = sourceFixture(), router = createCommandRouter(), registry = createComponentRegistry();
    const platform = createBackupFormalPlatform({ router, components: registry, menus: createMenuRegistry([]) });
    platform.register(prepareBackupPlugin(createCoreScorePlugin({ score: source.read }))); platform.start();
    const host = createComponentHost({ registry, router, notices: createNotices() });
    const mount = () => { const element = host.ensure("notation.core.view", "stage"); document.body.append(element); return element; };
    return { source, router, host, mount, dispose() { host.dispose(); platform.dispose(); source.dispose(); } };
  }
  const first = workspace(), second = workspace();
  try {
    const one = first.mount(), two = second.mount(); await settle();
    clickAt(one.querySelector('[data-event-id="event-1-1"]'), 25, 15);
    assert.ok(one.querySelector('[data-score-selection="event"]'));
    assert.equal(two.querySelector('[data-score-selection="event"]'), null);
    first.host.release("notation.core.view");
    assert.equal(first.source.listeners(), 0);
    assert.equal(first.router.execute(C.select, {}).code, "score.selection.not-ready");
    clickAt(two.querySelector('[data-event-id="event-1-2"]'), 45, 15);
    assert.equal(two.querySelector('[data-score-selection="event"]').getAttribute("x"), "40");
    const replacement = first.mount(); await settle();
    assert.notEqual(replacement, one); assert.equal(first.source.listeners(), 2);
    assert.equal(replacement.querySelector('[data-score-selection="event"]'), null);
    clickAt(replacement.querySelector('[data-event-id="event-1-1"]'), 25, 15);
    assert.ok(replacement.querySelector('[data-score-selection="event"]'));
  } finally { first.dispose(); second.dispose(); }
  assert.equal(first.source.listeners(), 0); assert.equal(second.source.listeners(), 0);
}));

test("the generated interaction module has only pure original editor/notation dependencies", async () => {
  const manifest = JSON.parse(await readFile(new URL("../src/vendor/score-interaction-manifest.json", import.meta.url), "utf8"));
  const paths = Object.keys(manifest.sources);
  assert.ok(paths.includes("apps/workbench/src/editor/staff-pointer-target.ts"));
  assert.ok(paths.includes("apps/workbench/src/editor/editor-machine.ts"));
  assert.equal(paths.some(path => /react|components|services|host|plugin-platform/.test(path)), false);
});
