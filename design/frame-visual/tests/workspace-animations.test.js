import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceAnimations } from "../src/host/workspace-animations.js";
import { createNotices } from "../src/runtime/notices.js";
import { createFrameRegionPresentation } from "../src/host/frame-region-presentation.js";
import { withTestDocument } from "./support/dom-test-environment.js";

test("system reduction and document visibility bind once and detach when the workspace ends", () => withTestDocument(() => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "matchMedia"), media = new EventTarget();
  media.matches = true; globalThis.matchMedia = () => media;
  try {
    const root = document.createElement("main"); document.body.append(root);
    const lifetime = createWorkspaceAnimations({ root, notices: createNotices(), provider: null });
    assert.equal(lifetime.controls.snapshot().mode, "reduced");
    lifetime.controls.setPolicy({ mode: "full" }); assert.equal(lifetime.controls.snapshot().mode, "reduced");
    media.matches = false; media.dispatchEvent(new Event("change")); assert.equal(lifetime.controls.snapshot().mode, "full");
    root.hidden = true; document.dispatchEvent(new Event("visibilitychange")); assert.equal(lifetime.controls.snapshot().visible, false);
    root.hidden = false; document.dispatchEvent(new Event("visibilitychange")); assert.equal(lifetime.controls.snapshot().visible, true);
    lifetime.dispose(); lifetime.dispose(); media.matches = true; media.dispatchEvent(new Event("change"));
    assert.equal(lifetime.controls.snapshot().mode, "full");
    assert.throws(() => lifetime.controls.setPolicy({ reducedMotion: false }), /Unknown/);
  } finally { if (previous) Object.defineProperty(globalThis, "matchMedia", previous); else delete globalThis.matchMedia; }
}));

test("current frame and control failures use existing structured notices while retired callbacks stay quiet", () => withTestDocument(async () => {
  const root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  stage.getBoundingClientRect = () => ({ x: 40, y: 34, width: 1200, height: 620 });
  const regions = Object.fromEntries(["left", "right", "top", "voice"].map(side => {
    const element = document.createElement("section"), content = document.createElement("div"); root.append(element); element.append(content);
    return [side, { element, content }];
  }));
  const button = document.createElement("button"); root.append(button);
  const notices = createNotices(), jobs = [], lifetime = createWorkspaceAnimations({ root, notices, provider: {
    start(args) { jobs.push(args); return { stop() {} }; },
  } });
  const frame = createFrameRegionPresentation({ root, workspaceRoot: root, stage, regions, service: lifetime.service,
    controls: new Map([["left", { button, glyph: "left", accepted: state => state.leftOpen }]]) });
  const state = { leftOpen: true, rightOpen: true, topOpen: true, voiceOpen: true, leftWidth: 260, rightWidth: 260, topHeight: 120, voiceHeight: 120 };
  try {
    frame.update(state); frame.beforeRender({ ...state, leftOpen: false }, { pointer: true }); frame.update({ ...state, leftOpen: false }, { pointer: true });
    assert.equal(jobs.length, 2); jobs.forEach(job => job.failed(new Error("current frame presentation"))); await Promise.resolve();
    assert.equal(notices.state().entries.length, 2);
    assert.deepEqual(notices.state().entries.map(n => n.source).sort(), ["frame.builtin.control-presentation", "frame.builtin.region-presentation"]);
    assert.ok(notices.state().entries.every(n => n.level === "error" && n.text.includes("current frame presentation")));
    assert.equal(regions.left.element.hidden, true); assert.equal(button.getAttribute("data-frame-toggle-rest"), "closed");
    frame.dispose(); jobs.forEach(job => { job.failed(new Error("retired frame")); job.complete(); job.write(job.from); }); await Promise.resolve();
    assert.equal(notices.state().entries.length, 2); assert.equal(lifetime.controls.snapshot().components, 0);
  } finally { frame.dispose(); lifetime.dispose(); root.remove(); }
}));
