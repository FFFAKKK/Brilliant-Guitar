import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { LAYOUT_REGIONS } from "../src/shell/layout-visual-state.js";
import { WORKSPACE_LAYOUT_ANIMATIONS, LAYOUT_REGION_EMPHASIS } from "../src/features/workspace-layout-motion-recipes.js";
import { LAYOUT_MOTION_CONTRIBUTION } from "../src/fixtures/motion-pilot/layout-motion-definitions.js";
import { createMotionCoordinator } from "../src/fixtures/motion-pilot/coordinator.js";
import { withTestDocument, serializeDom } from "./support/dom-test-environment.js";

function fixture({ deferred = false } = {}) {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: false });
  let view;
  view = createWorkspaceLayoutVisual({ state: accepted(), begin: () => {}, arrange: mode => store.arrange(mode),
    region: side => deferred ? queueMicrotask(() => store.toggleRegion(side)) : store.toggleRegion(side),
    resize: (side, value) => store.resize(side, value) });
  const unsubscribe = store.read.subscribe(() => view.update(accepted()));
  document.body.append(view.element);
  return { store, view, unsubscribe, accepted };
}
function pointerClick(node) {
  const event = new Event("click");
  Object.defineProperty(event, "detail", { value: 1 });
  node.dispatchEvent(event);
}
function recordingPort() {
  const calls = [];
  return { calls, port: { place: args => calls.push(["place", args]), play: args => { calls.push(["play", args]); return { finished: Promise.resolve({ status: "completed" }) }; },
    dispose: () => calls.push(["dispose"]) } };
}
function assertStatic(view) {
  assert.equal(view.element.querySelectorAll(".v-map-region-ink").length, 0);
  assert.equal(view.element.querySelectorAll('[data-motion-owned="true"]').length, 0);
}
function controlledHost(options = {}) {
  const calls = [];
  const values = new WeakMap();
  const adapter = { name: "controlled", read: node => values.get(node) ?? { x: 0, y: 0, opacity: 1 },
    write: (node, next) => values.set(node, { ...adapter.read(node), ...next }),
    capture: node => ({ ...adapter.read(node) }), restore: (node, original) => values.set(node, original),
    start(args) { const control = { stopped: false, stop() { this.stopped = true; } }; calls.push({ ...args, control }); return control; } };
  const coordinator = createMotionCoordinator({ adapter, ...options });
  const bind = payload => coordinator.bind({ ...payload, plugin: LAYOUT_MOTION_CONTRIBUTION.plugin });
  return { calls, adapter, coordinator, bind };
}

test("the actual view stays static unless bound, and absent providers leave the original DOM", () => withTestDocument(() => {
  const { view } = fixture(), initial = serializeDom(view.element);
  assertStatic(view);
  view.attachMotion(() => null); assert.deepEqual(serializeDom(view.element), initial);
  view.attachMotion(() => undefined); assert.deepEqual(serializeDom(view.element), initial);
}));

test("a collapsed region disables dimensions without disabling the toggle's semantic ancestors", () => withTestDocument(() => {
  const { view } = fixture(), toggle = view.element.querySelector("#layout-left");
  assert.equal(toggle.disabled, false);
  for (let node = toggle; node?.getAttribute; node = node.parentNode) assert.notEqual(node.getAttribute("aria-disabled"), "true");
  assert.equal(view.element.querySelector("#layout-range-left").disabled, true);
  assert.equal(view.element.querySelector("#layout-size-left").disabled, true);
  pointerClick(toggle);
  assert.equal(view.element.querySelector("#layout-range-left").disabled, false);
}));

test("binding exposes only four local decorative targets and initializes accepted states", () => withTestDocument(() => {
  const { view, store } = fixture(), { calls, port } = recordingPort();
  let payload;
  view.attachMotion(value => { payload = value; return port; });
  assert.equal(payload.root, view.element);
  assert.deepEqual(Object.keys(payload.targets), ["region:top", "region:left", "region:right", "region:voice"]);
  assert.deepEqual(payload.animations, { "content-transition": LAYOUT_REGION_EMPHASIS });
  for (const entry of LAYOUT_REGIONS) {
    const grant = payload.targets["region:" + entry.side];
    assert.deepEqual(grant.intents, ["content-transition"]);
    assert.equal(grant.node.getAttribute("aria-hidden"), "true");
    assert.equal(view.element.contains(grant.node), true);
    assert.equal(grant.node.parentNode.getAttribute("data-motion-owned"), null, "resting endpoints retain the original surface");
    assert.deepEqual(calls.find(([, args]) => args.target === "region:" + entry.side)[1].to,
      { opacity: store.read.snapshot()[entry.key] ? 1 : 0 });
  }
  assert.throws(() => view.attachMotion(() => port), /already bound/);
  view.dispose(); assertStatic(view);
  assert.equal(calls.filter(([type]) => type === "dispose").length, 1);
}));

test("accepted state and semantic controls precede pointer presentation; keyboard and program updates are immediate", () => withTestDocument(() => {
  const { view, store } = fixture(), { calls, port } = recordingPort();
  const left = view.element.querySelector("#layout-left");
  view.attachMotion(() => ({ ...port, play(args) {
    const entry = LAYOUT_REGIONS.find(item => args.target === "region:" + item.side);
    assert.equal(args.to.opacity, Number(store.read.snapshot()[entry.key]));
    assert.equal(view.element.querySelector("#layout-" + entry.side).getAttribute("aria-pressed"), String(!!args.to.opacity));
    return port.play(args);
  } }));
  pointerClick(left);
  assert.equal(calls.at(-1)[1].immediate, false);
  left.click(); assert.equal(calls.at(-1)[1].immediate, true);
  store.toggleRegion("top"); assert.equal(calls.at(-1)[1].immediate, true);
  const length = calls.length, rightWidth = store.read.snapshot().rightWidth;
  store.setRegionOpen("left", true);
  const beforeResize = calls.length;
  store.resize("left", 300);
  assert.equal(calls.length, beforeResize, "size changes do not create decorative motion");
  assert.equal(store.read.snapshot().rightWidth, rightWidth, "size updates remain independent");
  assert.equal(beforeResize, length + 1);
}));

test("asynchronously accepted pointer updates are conservatively immediate", () => withTestDocument(async () => {
  const { view } = fixture({ deferred: true }), { calls, port } = recordingPort();
  view.attachMotion(() => port);
  pointerClick(view.element.querySelector("#layout-left"));
  assert.equal(calls.length, 4);
  await Promise.resolve();
  assert.equal(calls.at(-1)[0], "play"); assert.equal(calls.at(-1)[1].immediate, true);
}));

test("an invalid or failing initial binding cleans up and permits a later valid binding", () => withTestDocument(() => {
  for (const makePort of [() => ({}), () => { throw new Error("bind-failed"); },
    () => ({ place() { throw new Error("place-failed"); }, play() {}, dispose() {} })]) {
    const { view } = fixture();
    assert.throws(() => view.attachMotion(makePort)); assertStatic(view);
    const { port } = recordingPort(); view.attachMotion(() => port);
    assert.equal(view.element.querySelectorAll(".v-map-region-ink").length, 4);
    view.dispose(); assertStatic(view);
  }
}));

test("presentation and diagnostic failures restore static artwork without undoing accepted layout", () => withTestDocument(() => {
  const { view, store } = fixture(), issues = [];
  view.attachMotion(() => ({ place() {}, play() { throw new Error("play-failed"); },
    dispose() { throw new Error("dispose-failed"); } }), { onIssue(error) { issues.push(error.message); throw new Error("diagnostic-failed"); } });
  pointerClick(view.element.querySelector("#layout-left"));
  assert.equal(store.read.snapshot().leftOpen, true);
  assert.equal(view.element.querySelector("#layout-left").getAttribute("aria-pressed"), "true");
  assertStatic(view); assert.deepEqual(issues, ["dispose-failed", "play-failed"]);
  pointerClick(view.element.querySelector("#layout-left"));
  assert.equal(store.read.snapshot().leftOpen, false);
  assert.doesNotThrow(() => view.dispose());
}));

test("hiding settles motion, hidden updates stay immediate, restoring does not replay or bind again", () => withTestDocument(() => {
  const { view } = fixture(), { calls, port } = recordingPort();
  view.attachMotion(() => port);
  const button = view.element.querySelector("#layout-left"); pointerClick(button);
  const before = calls.length; view.setVisible(false);
  assert.equal(calls.length, before + 4); assert.equal(calls.slice(-4).every(([type]) => type === "place"), true);
  pointerClick(button); assert.equal(calls.at(-1)[1].immediate, true);
  const hiddenCalls = calls.length; view.setVisible(true); assert.equal(calls.length, hiddenCalls);
  pointerClick(button); assert.equal(calls.at(-1)[1].immediate, false);
  assert.throws(() => view.setVisible(null), /visibility/);
}));

test("settling failures clean up locally and repeated disposal is safe", () => withTestDocument(() => {
  const { view } = fixture(); let fail = false, disposed = 0;
  view.attachMotion(() => ({ place() { if (fail) throw new Error("settle-failed"); }, play() {}, dispose() { disposed++; } }));
  fail = true; assert.doesNotThrow(() => view.setVisible(false)); assertStatic(view);
  view.dispose(); view.dispose(); assert.equal(disposed, 1);
  assert.throws(() => view.attachMotion(() => null), /released/);
}));

test("rapid reversal reads the actual intermediate state and stale completion cannot overwrite it", () => withTestDocument(async () => {
  const { view } = fixture(), host = controlledHost(); view.attachMotion(host.bind);
  const button = view.element.querySelector("#layout-left"); pointerClick(button);
  const first = host.calls[0]; host.adapter.write(first.node, { opacity: .37 });
  pointerClick(button); const reverse = host.calls[1];
  assert.equal(first.control.stopped, true); assert.equal(reverse.node, first.node);
  assert.equal(reverse.from.opacity, .37); assert.equal(reverse.to.opacity, 0);
  await Promise.resolve();
  assert.equal(first.node.parentNode.getAttribute("data-motion-owned"), "true", "old completion cannot hide the new surface");
  first.complete(); assert.equal(host.adapter.read(first.node).opacity, .37);
  reverse.complete(); assert.equal(host.adapter.read(first.node).opacity, 0);
  await Promise.resolve();
  assert.equal(first.node.parentNode.getAttribute("data-motion-owned"), null, "terminal artwork returns to the original surface");
  view.dispose(); assert.equal(host.coordinator.snapshot().active, 0);
}));

test("malformed playback restores static artwork and cannot leave an unowned animation surface", () => withTestDocument(() => {
  const { view, store } = fixture(), issues = []; let disposed = false;
  view.attachMotion(() => ({ place() {}, play() { return {}; }, dispose() { disposed = true; } }), { onIssue: error => issues.push(error.message) });
  pointerClick(view.element.querySelector("#layout-left"));
  assertStatic(view); assert.equal(disposed, true); assert.equal(store.read.snapshot().leftOpen, true);
  assert.deepEqual(issues, ["Invalid layout presentation playback"]);
}));

test("system policies, hiding, and current engine failure preserve the accepted result", () => withTestDocument(() => {
  const { view, store } = fixture(), issues = [], host = controlledHost({ onIssue: error => issues.push(error.message) });
  view.attachMotion(host.bind); const button = view.element.querySelector("#layout-left");
  pointerClick(button); host.coordinator.setPolicy({ mode: "none" });
  assert.equal(host.coordinator.snapshot().active, 0); assert.equal(host.adapter.read(host.calls[0].node).opacity, 1);
  pointerClick(button); assert.equal(host.calls.length, 1); assert.equal(host.adapter.read(host.calls[0].node).opacity, 0);
  host.coordinator.setPolicy({ mode: "full", reducedMotion: true }); pointerClick(button);
  assert.equal(host.calls.at(-1).settings.fadeDuration, .1);
  assert.deepEqual(host.calls.at(-1).to, { x: 0, y: 0, opacity: 1 });
  view.setVisible(false); assert.equal(host.coordinator.snapshot().active, 0);
  view.setVisible(true); host.coordinator.setPolicy({ reducedMotion: false }); pointerClick(button);
  host.calls.at(-1).failed(new Error("engine-failed"));
  assert.equal(store.read.snapshot().leftOpen, false); assert.equal(host.adapter.read(host.calls.at(-1).node).opacity, 0);
  assert.deepEqual(issues, ["engine-failed"]);
}));

test("two instances with the same target names have independent permissions and release", () => withTestDocument(() => {
  const a = fixture(), b = fixture(), host = controlledHost(); a.view.attachMotion(host.bind); b.view.attachMotion(host.bind);
  pointerClick(a.view.element.querySelector("#layout-left")); pointerClick(b.view.element.querySelector("#layout-left"));
  assert.notEqual(host.calls[0].node, host.calls[1].node); assert.equal(host.coordinator.snapshot().active, 2);
  a.view.dispose(); a.view.dispose(); assertStatic(a.view); assert.equal(host.coordinator.snapshot().active, 1);
  host.calls[0].failed(new Error("late")); host.calls[1].complete();
  assert.equal(host.adapter.read(host.calls[1].node).opacity, 1);
  assert.equal(b.store.read.snapshot().leftOpen, true); b.view.dispose(); assertStatic(b.view);
}));

test("the private recipe remains independent of identity, host, engine, and review modules", () => {
  assert.equal(LAYOUT_MOTION_CONTRIBUTION.animations, WORKSPACE_LAYOUT_ANIMATIONS);
  assert.equal(Object.isFrozen(LAYOUT_REGION_EMPHASIS.variants.continuous.ease), true);
  for (const [name, timing] of [["continuous", [.16, .08]], ["focused", [.2, .1]], ["quiet", [.14, .07]]]) {
    assert.equal(LAYOUT_REGION_EMPHASIS.variants[name].duration, timing[0]);
    assert.equal(LAYOUT_REGION_EMPHASIS.variants[name].exitDuration, timing[1]);
  }
  const source = readFileSync(new URL("../src/features/workspace-layout-motion-recipes.js", import.meta.url), "utf8");
  assert.equal(/^import\s/m.test(source), false);
  const visual = readFileSync(new URL("../src/shell/workspace-layout-motion.js", import.meta.url), "utf8");
  assert.equal(/from ["'][^"']*(?:fixtures|runtime|vendor|host)\//.test(visual), false);
});
