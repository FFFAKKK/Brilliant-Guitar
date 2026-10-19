import assert from "node:assert/strict";
import test from "node:test";
import { createFrameRegionAperture } from "../src/host/frame-region-aperture.js";
import { createFrameRegionPresentation } from "../src/host/frame-region-presentation.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function clock(viewport) {
  const pending = new Map(); let id = 0;
  viewport.requestAnimationFrame = callback => { pending.set(++id, callback); return id; };
  viewport.cancelAnimationFrame = id => pending.delete(id);
  viewport.getComputedStyle = node => node.style;
  return { pending, step() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); } };
}
for (const [side, collapsed, half] of [
  ["left", "inset(0px 260px 0px 0px)", "inset(0px 130px 0px 0px)"],
  ["right", "inset(0px 0px 0px 260px)", "inset(0px 0px 0px 130px)"],
  ["top", "inset(0px 0px 120px 0px)", "inset(0px 0px 60px 0px)"],
  ["voice", "inset(120px 0px 0px 0px)", "inset(60px 0px 0px 0px)"],
]) test(`${side}: full frame boundary follows computed motion progress in both directions`, () => withTestDocument(() => {
  const frames = clock(window), element = document.createElement("section"), content = document.createElement("div");
  element.append(content); element.getBoundingClientRect = () => ({ width: 260, height: 120 });
  const aperture = createFrameRegionAperture({ viewport: window, side, element, content });
  try {
    content.style.opacity = "0"; aperture.start(); assert.equal(element.style.clipPath, collapsed);
    content.style.opacity = ".5"; frames.step(); assert.equal(element.style.clipPath, half);
    content.style.opacity = "1"; frames.step(); assert.equal(element.style.clipPath, "inset(0px 0px 0px 0px)");
    // The same native progress samples the current boundary during reversal.
    content.style.opacity = ".5"; aperture.start(); assert.equal(element.style.clipPath, half);
    content.style.opacity = "0"; frames.step(); assert.equal(element.style.clipPath, collapsed);
    const late = [...frames.pending.values()]; aperture.stop(); late.forEach(callback => callback());
    assert.equal(element.style.clipPath, ""); assert.equal(frames.pending.size, 0);
  } finally { aperture.stop(); }
}));

test("bottom strip travels from the folded origin with the same clock, then restores its original node/style", () => withTestDocument(() => {
  const frames = clock(window), element = document.createElement("section"), content = document.createElement("div"), header = document.createElement("header");
  element.getBoundingClientRect = () => ({ width: 1440, height: 88 });
  const aperture = createFrameRegionAperture({ viewport: window, side: "voice", element, content, header });
  content.style.opacity = "0"; aperture.start(); assert.equal(header.style.transform, "translate3d(0px, 88px, 0px)");
  content.style.opacity = ".5"; frames.step(); assert.equal(header.style.transform, "translate3d(0px, 44px, 0px)");
  content.style.opacity = "1"; frames.step(); assert.equal(header.style.transform, "translate3d(0px, 0px, 0px)");
  aperture.stop(); assert.equal(header.style.transform, ""); assert.equal(frames.pending.size, 0);
}));

test("opaque page backdrops follow content opacity and preparation survives sampler startup", () => withTestDocument(() => {
  const frames = clock(window), element = document.createElement("section"), content = document.createElement("div"), backdrop = document.createElement("div");
  element.getBoundingClientRect = () => ({ width: 260, height: 120 });
  backdrop.style.opacity = ".9"; content.style.opacity = "0";
  const samples = [];
  const aperture = createFrameRegionAperture({ viewport: window, side: "right", element, content, backdrops: [backdrop], onProgress: alpha => samples.push(alpha) });
  aperture.prepare(0); assert.equal(backdrop.style.opacity, "0");
  assert.equal(element.style.clipPath, "inset(0px 0px 0px 260px)");
  aperture.start(); assert.equal(backdrop.style.opacity, "0");
  assert.equal(element.style.clipPath, "inset(0px 0px 0px 260px)");
  content.style.opacity = ".5"; frames.step(); assert.equal(backdrop.style.opacity, "0.5"); assert.equal(samples.at(-1), .5);
  aperture.stop(); assert.equal(backdrop.style.opacity, ".9"); assert.equal(element.style.clipPath, "");
  aperture.prepare(0); aperture.stop(); assert.equal(backdrop.style.opacity, ".9"); assert.equal(element.style.clipPath, "");
}));

test("region completion, reduction, failure and disposal release the reveal sampler without a second animation", () => withTestDocument(async () => {
  const frames = clock(window), root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  stage.getBoundingClientRect = () => ({ x: 40, y: 34, width: 1200, height: 620 });
  const element = document.createElement("section"), content = document.createElement("div"); root.append(element); element.append(content);
  element.getBoundingClientRect = () => ({ x: 40, y: 34, width: 260, height: 120 });
  const jobs = [], service = createAnimationService({ provider: { start(job) { jobs.push(job); return { stop() {} }; } } });
  const frame = createFrameRegionPresentation({ root, workspaceRoot: root, regions: { left: { element, content } }, stage, service });
  let state = { leftOpen: false, leftWidth: 260 };
  const update = open => { state = { ...state, leftOpen: open }; frame.beforeRender(state, { pointer: true }); frame.update(state, { pointer: true }); };
  try {
    frame.update(state); update(true); assert.equal(jobs.length, 1); assert.equal(frames.pending.size, 1);
    jobs.at(-1).write({ x: -12, y: 0, opacity: .5 }); frames.step(); assert.equal(element.style.clipPath, "inset(0px 130px 0px 0px)");
    jobs.at(-1).complete(); await Promise.resolve(); assert.equal(frames.pending.size, 0); assert.equal(element.style.clipPath, "");
    update(false); service.setPolicy({ mode: "reduced" }); await Promise.resolve(); assert.equal(frames.pending.size, 0); assert.equal(element.hidden, true);
    service.setPolicy({ mode: "full" }); update(true); jobs.at(-1).failed(new Error("engine failed")); await Promise.resolve();
    assert.equal(frames.pending.size, 0); assert.equal(element.hidden, false); assert.equal(element.style.clipPath, "");
    update(false); const late = [...frames.pending.values()]; frame.dispose(); late.forEach(callback => callback());
    assert.equal(frames.pending.size, 0); assert.equal(service.snapshot().active, 0); assert.equal(service.snapshot().targets, 0);
  } finally { frame.dispose(); service.dispose(); root.remove(); }
}));

test("invalid geometry and static hosts do not acquire a sampler or change original artwork", () => withTestDocument(() => {
  const element = document.createElement("section"), content = document.createElement("div"), header = document.createElement("header");
  element.style.clipPath = "inset(1px)"; header.style.transform = "translateX(2px)";
  let aperture = createFrameRegionAperture({ viewport: {}, side: "voice", element, content, header }); aperture.start(); aperture.stop();
  const frames = clock(window); element.getBoundingClientRect = () => ({ width: 0, height: NaN });
  aperture = createFrameRegionAperture({ viewport: window, side: "voice", element, content, header }); aperture.start();
  assert.equal(frames.pending.size, 0); assert.equal(element.style.clipPath, "inset(1px)"); assert.equal(header.style.transform, "translateX(2px)"); aperture.stop();
}));
