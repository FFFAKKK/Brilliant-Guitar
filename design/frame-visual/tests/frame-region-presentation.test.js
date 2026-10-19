import assert from "node:assert/strict";
import test from "node:test";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { createFrameRegionPresentation, FRAME_REGION_ANIMATIONS } from "../src/host/frame-region-presentation.js";
import { createFramePointerPresentation } from "../src/host/frame-pointer-presentation.js";
import { createWorkspaceLayoutPlugin } from "../src/features/workspace-layout-plugin.js";
import { LAYOUT_PREVIEW_SHAPE, WORKSPACE_LAYOUT_ANIMATIONS, LAYOUT_TOGGLE_EMPHASIS } from "../src/features/workspace-layout-motion-recipes.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture(options = {}, controlCount = 0) {
  const root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  stage.getBoundingClientRect = () => ({ x: 40, y: 34, width: 1200, height: 620 });
  const regions = Object.fromEntries(["left", "right", "top", "voice"].map(side => {
    const element = document.createElement("section"), content = document.createElement("div"); root.append(element); element.append(content);
    element.getBoundingClientRect = () => ({ x: 40, y: 34, width: 260, height: 120 });
    return [side, { element, content }];
  }));
  const jobs = [], issues = [], service = createAnimationService({ provider: { name: "capture", start(args) {
    const control = { stops: 0, stop() { this.stops++; } }; jobs.push({ ...args, control }); return control;
  } }, onIssue: issue => issues.push(issue), ...options });
  const controls = new Map(Array.from({ length: controlCount }, (_, index) => {
    const button = document.createElement("button"); root.append(button);
    return ["button-" + index, { button, glyph: "left", accepted: state => state.leftOpen }];
  }));
  const frame = createFrameRegionPresentation({ root, workspaceRoot: root, regions, stage, service, controls });
  let state = { leftOpen: true, rightOpen: true, topOpen: true, voiceOpen: true, leftWidth: 260, rightWidth: 260, topHeight: 120, voiceHeight: 120, arrangement: "balanced" };
  frame.update(state);
  const toggle = (side, args = { pointer: true }) => { state = { ...state, [side + "Open"]: !state[side + "Open"] }; frame.beforeRender(state, args); frame.update(state, args); };
  return { root, stage, regions, jobs, service, frame, issues, toggle, controls,
    update(patch, args = { pointer: true }) { state = { ...state, ...patch }; frame.beforeRender(state, args); frame.update(state, args); },
    state: () => state, dispose() { frame.dispose(); service.dispose(); root.remove(); } };
}

test("shape, selection and toggle are captured in one layout declaration and keep the original author objects", () => {
  const plugin = createWorkspaceLayoutPlugin({ snapshot() {}, subscribe() { return () => {}; } });
  assert.deepEqual(plugin.components[0].permissions.animations, ["shape-transition", "selection-transition", "content-transition"]);
  assert.deepEqual(plugin.components[0].animations.definitions["shape-transition"], LAYOUT_PREVIEW_SHAPE);
  assert.deepEqual(plugin.components[0].animations.definitions["selection-transition"], WORKSPACE_LAYOUT_ANIMATIONS["selection-transition"]);
  assert.deepEqual(plugin.components[0].animations.definitions["content-transition"], LAYOUT_TOGGLE_EMPHASIS);
  const empty = createWorkspaceLayoutPlugin({ snapshot() {}, subscribe() { return () => {}; } }, null, null, { animations: null });
  assert.equal(empty.components[0].animations, null, "factory preserves legal optional null for formal capture");
  assert.equal(FRAME_REGION_ANIMATIONS.definitions["content-transition"].variants.exit.duration, .28);
});

test("frame exit is inert immediately and retains complete original nodes outside the reserved stage", () => withTestDocument(async () => {
  const f = fixture();
  try {
    for (const side of ["left", "right", "top", "voice"]) {
      const { element, content } = f.regions[side]; f.toggle(side);
      assert.equal(element.hidden, false); assert.equal(element.inert, true); assert.equal(element.getAttribute("aria-hidden"), "true");
      assert.equal(element.style.pointerEvents, "none"); assert.equal(content.parentNode, element);
      assert.equal(element.style.clipPath, "inset(0px)");
      const job = f.jobs.at(-1); assert.equal(job.settings.duration, .28); assert.equal(job.settings.fadeDuration, .28);
      assert.ok(Math.abs(job.to.x) + Math.abs(job.to.y) <= 24); assert.equal(job.to.opacity, 0);
      if (side === "left") assert.equal(Number.parseFloat(element.style.left) + 260, 40);
      if (side === "right") assert.equal(Number.parseFloat(element.style.left), 1240);
      if (side === "top") assert.equal(Number.parseFloat(element.style.top) + 120, 34);
      if (side === "voice") assert.equal(Number.parseFloat(element.style.top), 654);
      job.complete(); await Promise.resolve(); assert.equal(element.hidden, true); assert.equal(element.style.position, "");
      f.toggle(side); const entered = f.jobs.at(-1);
      assert.equal(element.hidden, false); assert.equal(element.inert, false); assert.equal(entered.settings.duration, .30);
      assert.equal(entered.settings.fadeDuration, .30); entered.complete(); await Promise.resolve();
    }
    assert.equal(f.service.snapshot().active, 0); assert.equal(f.service.snapshot().targets, 4);
  } finally { f.dispose(); }
}));

test("opening prepares the motion surface and aperture before releasing the hidden carrier", () => withTestDocument(async () => {
  const f = fixture();
  try {
    for (const side of ["left", "right", "top", "voice"]) {
      const { element, content } = f.regions[side];
      f.toggle(side); // close first, so the next change follows the real reopen path
      f.jobs.at(-1).complete(); await Promise.resolve();
      const events = [];
      let hidden = element.hidden;
      Object.defineProperty(element, "hidden", {
        configurable: true,
        get: () => hidden,
        set: value => {
          if (!value && hidden) events.push({ transform: content.style.transform, opacity: content.style.opacity, clip: element.style.clipPath });
          hidden = Boolean(value);
        },
      });
      f.toggle(side);
      assert.equal(events.length, 1, `${side} should release its carrier once`);
      const first = events[0];
      assert.equal(first.opacity, "0", `${side} content must start transparent`);
      assert.match(first.transform, /translate3d\(/, `${side} content must start translated`);
      assert.notEqual(first.clip, "", `${side} aperture must be prepared before paint`);
      assert.notEqual(first.clip, "inset(0px)", `${side} aperture cannot expose the full carrier first`);
      f.jobs.at(-1).complete();
    }
  } finally { f.dispose(); }
}));

test("rapid frame reversal samples current content, rejects stale completion and failure and never remounts", () => withTestDocument(async () => {
  const f = fixture();
  try {
    f.toggle("left"); const old = f.jobs[0], content = f.regions.left.content;
    old.write({ x: -5, y: 0, opacity: .6 }); f.toggle("left");
    const current = f.jobs[1]; assert.deepEqual(current.from, { x: -5, y: 0, opacity: .6 }); assert.equal(old.control.stops, 1);
    old.complete(); old.failed(new Error("late")); old.write({ x: -12, opacity: 0 }); await Promise.resolve();
    assert.equal(f.regions.left.element.hidden, false); assert.equal(f.regions.left.content, content); assert.equal(f.issues.length, 0);
    current.failed(new Error("current")); await Promise.resolve();
    assert.equal(f.regions.left.element.hidden, false); assert.equal(content.style.opacity, "1"); assert.equal(f.issues.length, 1);
  } finally { f.dispose(); }
}));

test("program, reduced/off/quiet, resize and hidden policy settle frame presentation immediately", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.toggle("left", { pointer: false }); assert.equal(f.jobs.length, 0); assert.equal(f.regions.left.element.hidden, true);
    for (const policy of [{ mode: "reduced" }, { mode: "none" }, { mode: "full", profile: "quiet" }]) {
      f.service.setPolicy(policy); f.toggle("left"); assert.equal(f.jobs.length, 0);
    }
    f.service.setPolicy({ mode: "full", profile: "continuous" }); f.toggle("right"); assert.equal(f.service.snapshot().active, 1);
    window.dispatchEvent(new Event("resize")); assert.equal(f.service.snapshot().active, 0); assert.equal(f.regions.right.element.hidden, true);
    f.toggle("right"); f.root.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(f.service.snapshot().active, 0); assert.equal(f.regions.right.element.hidden, false);
    f.toggle("left"); assert.equal(f.service.snapshot().active, 0);
  } finally { f.dispose(); }
}));

test("no provider, replacement and disposal leave no exit layer, target or retained content", () => withTestDocument(async () => {
  const f = fixture({ provider: null });
  try {
    f.toggle("left"); assert.equal(f.regions.left.element.hidden, true); assert.equal(f.service.snapshot().active, 0);
    f.service.replaceProvider({ start(args) { return { stop() {} }; } }); f.toggle("left"); f.toggle("left");
    f.service.replaceProvider(null); await Promise.resolve(); assert.equal(f.regions.left.element.hidden, true);
    f.frame.dispose(); assert.equal(f.service.snapshot().targets, 0); assert.equal(f.service.snapshot().components, 0);
    assert.equal(f.regions.left.content.style.transform, ""); assert.equal(f.regions.left.element.style.clipPath, "");
  } finally { f.dispose(); }
}));

test("frame input rejects synthetic click metadata, body calls and disposed context", () => withTestDocument(() => {
  const root = document.createElement("main"), button = document.createElement("button"); document.body.append(root); root.append(button);
  const input = createFramePointerPresentation(root), event = new Event("click", { bubbles: true });
  Object.defineProperty(event, "detail", { value: 1 }); let accepted;
  button.addEventListener("click", () => { accepted = input.current(); }); button.dispatchEvent(event);
  assert.equal(accepted, false); assert.equal(input.current(), false);
  assert.equal(input.run(event, () => input.current()), false); input.dispose(); assert.equal(input.current(), false);
}));

test("frame control ink consumes independent author fade, reverses from current opacity and isolates stale failure", () => withTestDocument(async () => {
  const f = fixture({}, 1), button = f.controls.get("button-0").button;
  const ink = button.querySelector(".v-frame-toggle-ink");
  try {
    assert.equal(ink.getAttribute("aria-hidden"), "true"); assert.equal(ink.style.opacity, "1");
    f.toggle("left"); const old = f.jobs.find(job => job.node === ink);
    assert.equal(old.settings.duration, .16); assert.equal(old.settings.fadeDuration, .12);
    assert.equal(old.from.x, 0); assert.equal(old.to.y, 0); old.write({ opacity: .45, x: 0, y: 0 });
    f.toggle("left"); const current = f.jobs.findLast(job => job.node === ink);
    assert.equal(current.from.opacity, .45); assert.equal(current.settings.fadeDuration, .16);
    old.failed(new Error("stale control")); old.complete(); await Promise.resolve();
    assert.equal(button.getAttribute("data-frame-toggle-rest"), "moving"); assert.equal(f.issues.length, 0);
    current.failed(new Error("current control")); await Promise.resolve();
    assert.equal(ink.style.opacity, "1"); assert.equal(button.getAttribute("data-frame-toggle-rest"), "open"); assert.equal(f.issues.length, 1);
    window.dispatchEvent(new Event("resize")); assert.equal(f.service.snapshot().active, 0);
    f.frame.dispose(); assert.equal(f.service.snapshot().targets, 0); assert.equal(f.service.snapshot().components, 0);
    assert.equal(button.querySelector(".v-frame-toggle-ink"), null); assert.equal(button.getAttribute("data-frame-toggle"), null);
  } finally { f.dispose(); }
}));

test("arrangement and dimensions end all frame translation and control feedback immediately even on a trusted pointer", () => withTestDocument(() => {
  const f = fixture({}, 1);
  try {
    f.toggle("left"); assert.equal(f.service.snapshot().active, 2);
    f.update({ arrangement: "compact" }); assert.equal(f.service.snapshot().active, 0);
    assert.equal(f.regions.left.element.hidden, true); assert.equal(f.regions.left.element.style.position, "");
    assert.equal(f.jobs.length, 2, "same sizes and a different arrangement must not restart the settings page");
    f.toggle("left"); assert.equal(f.service.snapshot().active, 2);
    f.update({ rightWidth: 300 }); assert.equal(f.service.snapshot().active, 0);
    f.service.setPolicy({ profile: "quiet" }); f.toggle("left");
    const job = f.jobs.at(-1); assert.equal(job.settings.fadeDuration, .08); assert.equal(job.node.className, "v-frame-toggle-ink");
    assert.equal(f.regions.left.element.hidden, true, "quiet only animates local control brightness");
    f.root.hidden = true; document.dispatchEvent(new Event("visibilitychange")); assert.equal(f.service.snapshot().active, 0);
  } finally { f.dispose(); }
}));

test("more than 32 frame controls remain individually bounded and static without a provider", () => withTestDocument(() => {
  const f = fixture({ provider: null }, 40);
  try {
    assert.equal(f.service.snapshot().targets, 44); f.toggle("left"); assert.equal(f.service.snapshot().active, 0);
    for (const { button } of f.controls.values()) assert.equal(button.getAttribute("data-frame-toggle-rest"), "closed");
    f.frame.dispose(); assert.equal(f.service.snapshot().components, 0); assert.equal(f.service.snapshot().targets, 0);
  } finally { f.dispose(); }
}));
