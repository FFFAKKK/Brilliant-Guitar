import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { LAYOUT_TOGGLE_EMPHASIS } from "../src/features/workspace-layout-motion-recipes.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture() {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: false });
  const view = createWorkspaceLayoutVisual({ state: accepted(), begin() {},
    region: side => store.toggleRegion(side), resize: (side, value) => store.resize(side, value), arrange: mode => store.arrange(mode) });
  document.body.append(view.element);
  const stop = store.read.subscribe(() => view.update(accepted()));
  return { view, store, button: side => view.element.querySelector("#layout-" + side), dispose() { stop(); view.dispose(); } };
}
function pointer(button) { const event = new Event("click"); Object.defineProperty(event, "detail", { value: 1 }); button.dispatchEvent(event); }
function recording() {
  const descriptors = [], calls = [], tasks = [];
  const bind = descriptor => {
    descriptors.push(descriptor);
    return { place: request => calls.push(["place", request]), dispose: () => calls.push(["dispose", descriptor]),
      play: request => {
        calls.push(["play", request]); let resolve, reject;
        const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
        tasks.push({ request, resolve, reject }); return { finished };
      } };
  };
  return { bind, descriptors, calls, tasks };
}

test("toggle animation has four local decorative opacity targets and remains absent without explicit permission", () => withTestDocument(() => {
  const f = fixture(), e = recording();
  f.view.attachMotion(e.bind); assert.equal(f.view.element.querySelectorAll(".v-layout-toggle-ink").length, 0); f.dispose();
  const second = fixture(), motion = recording(); second.view.attachMotion(motion.bind, { toggleTransition: true });
  const descriptor = motion.descriptors.at(-1);
  assert.deepEqual(Object.keys(descriptor.targets), ["toggle:top", "toggle:left", "toggle:right", "toggle:voice"]);
  assert.equal(descriptor.animations["content-transition"], LAYOUT_TOGGLE_EMPHASIS);
  for (const grant of Object.values(descriptor.targets)) {
    assert.equal(descriptor.root.contains(grant.node), true); assert.deepEqual(grant.intents, ["content-transition"]);
    assert.equal(grant.node.getAttribute("aria-hidden"), "true");
  }
  assert.equal(second.button("left").dataset.toggleRest, "closed");
  assert.equal(second.button("right").dataset.toggleRest, "open");
  second.dispose(); assert.equal(second.view.element.querySelectorAll(".v-layout-toggle-ink").length, 0);
}));

test("switch accepts and enables its controls first; independent visual completion never changes business state", () => withTestDocument(async () => {
  const f = fixture(), e = recording(); f.view.attachMotion(e.bind, { toggleTransition: true }); e.calls.length = 0;
  pointer(f.button("left"));
  assert.equal(f.store.read.snapshot().leftOpen, true);
  assert.equal(f.view.element.querySelector("#layout-range-left").disabled, false);
  assert.equal(f.button("left").getAttribute("aria-pressed"), "true");
  assert.equal(f.button("left").dataset.toggleRest, "moving");
  const left = e.tasks.find(task => task.request.target === "toggle:left");
  assert.deepEqual(left.request.to, { opacity: 1 });
  pointer(f.button("voice")); const voice = e.tasks.find(task => task.request.target === "toggle:voice");
  left.resolve({ status: "completed" }); await Promise.resolve();
  assert.equal(f.button("left").dataset.toggleRest, "open"); assert.equal(f.button("voice").dataset.toggleRest, "moving");
  voice.resolve({ status: "completed" }); await Promise.resolve();
  assert.equal(f.store.read.snapshot().leftOpen, true); assert.equal(f.store.read.snapshot().voiceOpen, true);
  f.dispose();
}));

test("rapid reversal and hidden/resize/release ignore old callbacks; keyboard and program inputs settle immediately", () => withTestDocument(async ({ window }) => {
  const f = fixture(), e = recording(), issues = [];
  f.view.attachMotion(e.bind, { toggleTransition: true, onIssue: error => issues.push(error.message) });
  pointer(f.button("left")); const old = e.tasks.find(task => task.request.target === "toggle:left");
  pointer(f.button("left")); const reversed = e.tasks.filter(task => task.request.target === "toggle:left").at(-1);
  old.reject(new Error("old")); await Promise.resolve(); assert.deepEqual(issues, []);
  assert.equal(f.button("left").dataset.toggleRest, "moving");
  reversed.resolve({ status: "completed" }); await Promise.resolve(); assert.equal(f.button("left").dataset.toggleRest, "closed");
  e.calls.length = 0; f.button("left").click();
  assert.equal(e.calls.some(([type, r]) => type === "play" && r.target === "toggle:left"), false);
  assert.equal(f.button("left").dataset.toggleRest, "open");
  pointer(f.button("voice")); const hidden = e.tasks.at(-1); f.view.setVisible(false);
  hidden.reject(new Error("hidden")); await Promise.resolve(); assert.deepEqual(issues, []);
  f.view.setVisible(true); pointer(f.button("left")); const resized = e.tasks.at(-1);
  window.dispatchEvent(new Event("resize")); resized.reject(new Error("resized")); await Promise.resolve();
  assert.deepEqual(issues, []); assert.equal(f.button("left").dataset.toggleRest, "closed");
  f.dispose(); e.calls.length = 0; window.dispatchEvent(new Event("resize")); assert.equal(e.calls.length, 0);
}));

test("invalid optional toggle binding rolls back all earlier ports and restores usable static controls", () => withTestDocument(() => {
  const f = fixture(), e = recording();
  assert.throws(() => f.view.attachMotion(descriptor => {
    if (descriptor.targets["toggle:left"]) throw new Error("denied"); return e.bind(descriptor);
  }, { toggleTransition: true }), /denied/);
  assert.equal(f.view.element.querySelectorAll(".v-layout-toggle-ink").length, 0);
  assert.equal(f.button("left").getAttribute("data-toggle-motion"), null);
  pointer(f.button("left")); assert.equal(f.store.read.snapshot().leftOpen, true);
  assert.doesNotThrow(() => f.view.attachMotion(e.bind, { toggleTransition: true })); f.dispose();
}));
