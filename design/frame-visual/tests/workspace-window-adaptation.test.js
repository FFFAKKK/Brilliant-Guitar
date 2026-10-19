import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceState } from "../src/layout/workspace-state.js";

const create = (width, height) => createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width, height });

test("compact hosts retain symmetric usable sidebars without a virtual 1024px canvas", () => {
  for (const [width, expectedSide, expectedStage] of [[800, 230, 260], [922, 230, 382], [990, 230, 450], [1024, 232, 480], [1280, 260, 680]]) {
    const store = create(width, 720);
    store.toggleRegion("left");
    const state = store.read.snapshot();
    assert.equal(state.leftWidth, expectedSide);
    assert.equal(state.rightWidth, expectedSide);
    assert.equal(width - 80 - state.leftWidth - state.rightWidth, expectedStage);
    assert.equal(state.leftOpen, true);
    assert.equal(state.rightOpen, true);
  }
});

test("compact open and closed regions use the same dimensions and adjustment limits", () => {
  for (const [width, height] of [[800, 600], [922, 720], [640, 480]]) {
    const store = create(width, height);
    const baseline = store.read.snapshot();
    for (const region of ["left", "right", "top", "voice", "voice", "top", "right", "left"]) {
      store.toggleRegion(region);
      const current = store.read.snapshot();
      for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "limits"]) {
        assert.deepEqual(current[key], baseline[key], `${width}×${height}: ${region} / ${key}`);
      }
    }
  }
});

test("short hosts retain both adjustable band minimums and a positive stage remainder", () => {
  const store = create(1280, 900);
  store.resize("top", 160);
  store.resize("voice", 320);
  store.toggleRegion("voice");
  store.setViewport(800, 480);
  const state = store.read.snapshot();
  assert.equal(state.topHeight, 80);
  assert.equal(state.voiceHeight, 80);
  assert.equal(state.topOpen, true);
  assert.equal(state.voiceOpen, true);
  assert.equal(480 - 34 - state.topHeight - state.voiceHeight - 40, 246);
  assert.equal(state.limits.top, 80);
  assert.equal(state.limits.voice, 80);
});

test("component cancellation retains ordinary compact geometry and default restoration keeps constraints", () => {
  const store = create(922, 720);
  store.beginAdjustment();
  store.resize("left", 200);
  store.resize("right", 999);
  store.resize("top", 96);
  const used = store.read.snapshot();
  store.finishAdjustment(false);
  const canceled = store.read.snapshot();
  for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "leftOpen", "rightOpen", "topOpen", "voiceOpen"]) {
    assert.equal(canceled[key], used[key]);
  }
  store.setViewport(1440, 900);
  store.arrange("default");
  assert.equal(store.read.snapshot().leftWidth, 260);
  assert.equal(store.read.snapshot().rightWidth, 260);
  store.setViewport(800, 600);
  store.arrange("default");
  assert.equal(store.read.snapshot().leftWidth, 230);
  assert.equal(store.read.snapshot().rightWidth, 230);
});

test("window projection preserves each side's preferred size and independent controls", () => {
  const store = create(1440, 900);
  store.resize("left", 340);
  store.resize("right", 310);
  store.resize("top", 120);
  store.resize("voice", 220);
  store.setViewport(800, 600);
  assert.equal(store.read.snapshot().leftWidth, 230);
  assert.equal(store.read.snapshot().rightWidth, 230);
  assert.equal(store.read.snapshot().topHeight, 120);
  assert.equal(store.read.snapshot().voiceHeight, 106);
  store.setViewport(1440, 900);
  const restored = store.read.snapshot();
  assert.equal(restored.leftWidth, 340);
  assert.equal(restored.rightWidth, 310);
  assert.equal(restored.topHeight, 120);
  assert.equal(restored.voiceHeight, 220);
});

test("equal top and bottom preferences shrink as a pair on a short host", () => {
  const store = create(1440, 900);
  store.setViewport(800, 600);
  const state = store.read.snapshot();
  assert.equal(state.topHeight, 113);
  assert.equal(state.voiceHeight, 113);
  assert.equal(state.topHeight, state.voiceHeight);
});
