import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { createFrameRegionPresentation } from "../src/host/frame-region-presentation.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const sides = ["left", "right", "top", "voice"];
const selectors = { left: ".v-left", right: ".v-right", top: ".v-top", voice: ".v-voice-content" };
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const side of sides) test(`${side}: actual runtime animates a full region surface, including its artwork`, () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    const clip = root.querySelector(selectors[side]);
    const surface = root.querySelector(`[data-frame-region-motion="${side}"]`);
    assert.ok(surface); assert.ok(surface.classList.contains("v-frame-region-surface"), "four regions must share the full-surface contract");
    assert.equal(surface.parentNode, clip, "static clip contains exactly the moving plane, without moving the region or stage");
    assert.equal(clip.dataset.frameRegionClip, side); assert.equal(surface.getAttribute("data-frame-ui"), "");
    assert.equal(surface.contains(root.querySelector("#grip-" + side)), false);
    assert.equal(surface.contains(root.querySelector("#score-stage")), false);
    if (side === "top") assert.equal(surface.querySelectorAll(".v-slot").length, 3);
    if (side === "voice") {
      assert.ok(surface.querySelector(".v-voice-placeholder"), "placeholder is content within the full-height surface, not the motion target");
      assert.equal(root.querySelector(".v-footer").dataset.frameRegionChrome, "voice");
      assert.equal(root.querySelectorAll("#voice-trigger").length, 1, "the moving bottom strip must use the original control");
    }
    if (side === "left") assert.ok(surface.querySelector(".v-region-header"));
    if (side === "right") assert.equal(surface, root.querySelector(".v-page"), "the accepted right-side reference target must remain the original page");
    runtime.execute(C.configureRegion, { region: side, open: true });
    runtime.execute(C.configureRegion, { region: side, open: false });
    runtime.execute(C.configureRegion, { region: side, open: true });
    assert.equal(root.querySelector(`[data-frame-region-motion="${side}"]`), surface, "ordinary toggling cannot replace the surface or component");
  } finally { runtime.dispose(); root.remove(); }
}));

test("full-surface rules preserve moving planes without opaque region backing plates", () => {
  const css = read("styles/runtime-preview.css");
  assert.match(css, /\.visual-shell\[data-runtime="workspace"\] \.v-frame-region-surface:where\(\[data-frame-ui\]\)\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-width: 0;[^}]*min-height: 0;/s);
  assert.match(css, /:is\(\.v-left, \.v-right, \.v-top, \.v-footer\):where\(\[data-frame-ui\]\)\s*\{[^}]*background: transparent;/s);
  assert.match(css, /\.v-top\[data-frame-region-clip="top"\]:where\(\[data-frame-ui\]\)\s*\{[^}]*padding: 0;[^}]*background: transparent;/s);
  assert.match(css, /\.v-frame-region-surface\[data-frame-region-motion="top"\]:where\(\[data-frame-ui\]\)\s*\{[^}]*padding: 0 12px;[^}]*background: transparent;/s);
  assert.match(css, /\.v-frame-region-surface\[data-frame-region-motion="voice"\]:where\(\[data-frame-ui\]\)\s*\{[^}]*background: transparent;/s);
  assert.match(css, /\.v-voice-content\[data-frame-region-clip="voice"\]:where\(\[data-frame-ui\]\)\s*\{[^}]*background: transparent;/s);
  assert.match(css, /\.v-footer\[data-frame-region-chrome="voice"\] > \.v-voice-header:where\(\[data-frame-ui\]\)\s*\{[^}]*background: transparent;/s);
  assert.doesNotMatch(css, /(?:transition|animation):|(?:opacity|transform):/, "surface CSS owns static artwork only; the existing animation service owns motion");
});

test("all four region tracks match the right-side duration, curve, opacity and distance; only edge direction differs", () => withTestDocument(async () => {
  const root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  stage.getBoundingClientRect = () => ({ x: 300, y: 154, width: 840, height: 586 });
  const regions = Object.fromEntries(sides.map(side => {
    const element = document.createElement("section"), content = document.createElement("div"); root.append(element); element.append(content);
    element.getBoundingClientRect = () => side === "left" ? { x: 40, y: 154, width: 260, height: 586 }
      : side === "right" ? { x: 1140, y: 154, width: 260, height: 586 }
      : side === "top" ? { x: 0, y: 34, width: 1440, height: 120 } : { x: 0, y: 772, width: 1440, height: 88 };
    return [side, { element, content }];
  }));
  const jobs = [], service = createAnimationService({ provider: { start(args) { jobs.push(args); return { stop() {} }; } } });
  const frame = createFrameRegionPresentation({ root, workspaceRoot: root, regions, stage, service });
  let state = { leftOpen: true, rightOpen: true, topOpen: true, voiceOpen: true, leftWidth: 260, rightWidth: 260, topHeight: 120, voiceHeight: 120 };
  const update = open => { state = { ...state, ...Object.fromEntries(sides.map(side => [side + "Open", open])) }; frame.beforeRender(state, { pointer: true }); frame.update(state, { pointer: true }); };
  try {
    frame.update(state); update(false);
    const exits = jobs.slice(); assert.equal(exits.length, 4);
    const reference = exits.find(job => job.node === regions.right.content);
    for (const job of exits) { assert.deepEqual(job.settings, reference.settings); assert.equal(Math.hypot(job.to.x, job.to.y), 24); assert.equal(job.to.opacity, 0); }
    const expected = { left: [-24, 0], right: [24, 0], top: [0, -24], voice: [0, 24] };
    for (const side of sides) { const job = exits.find(item => item.node === regions[side].content); assert.deepEqual([job.to.x, job.to.y], expected[side]); job.complete(); }
    await Promise.resolve(); update(true);
    const entries = jobs.slice(4), enteredRight = entries.find(job => job.node === regions.right.content); assert.equal(entries.length, 4);
    for (const job of entries) { assert.deepEqual(job.settings, enteredRight.settings); assert.deepEqual(job.to, { x: 0, y: 0, opacity: 1 }); job.complete(); }
    assert.equal(reference.settings.duration, .28); assert.equal(enteredRight.settings.duration, .30);
    await Promise.resolve(); assert.equal(service.snapshot().active, 0);
  } finally { frame.dispose(); service.dispose(); root.remove(); }
}));

test("the static historical shell stays intact when frame animation is disabled", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createWorkspaceRuntime({ root, enableAnimations: false });
  try {
    assert.equal(root.querySelector(".v-frame-region-surface"), null);
    assert.equal(root.querySelector(".v-voice-placeholder").parentNode, root.querySelector(".v-voice-content"));
  } finally { runtime.dispose(); root.remove(); }
}));
