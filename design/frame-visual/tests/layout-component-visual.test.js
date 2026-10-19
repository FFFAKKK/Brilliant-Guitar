import test from "node:test";
import assert from "node:assert/strict";
import { layoutChanges, layoutDimension } from "../src/shell/layout-visual-state.js";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { mountWorkspaceLayout } from "../src/features/workspace-layout-page.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { WORKSPACE_CHROME, WORKSPACE_DEFAULT_SIZES, WORKSPACE_MAXIMUMS, WORKSPACE_MINIMUMS, workspaceFooterHeight, workspaceVoiceContentHeight } from "../src/workspace-geometry.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { fixtureFor } from "../src/fixtures/preview-scenarios.js";
import { applySidebarReview, reviewHalfSpace, updateReviewCapacity, REVIEW_CONTENT } from "../src/fixtures/sidebar-visuals.js";
import { h } from "../src/shell/dom.js";
import { beginLayoutEdit, finishLayoutEdit, prepareLayoutFixture } from "../src/fixtures/layout-edit-state.js";
import { withTestDocument } from "./support/dom-test-environment.js";

test("the component change list excludes workspace size, visibility, flags, input and navigation", () => {
  const before = fixtureFor();
  const current = structuredClone(before);
  current.modified = true; current.rightPage = 1; current.pageInput = "内容输入";
  assert.deepEqual(layoutChanges(current, before), []);
  current.leftWidth = 280; current.voiceOpen = true; current.preset = "个人方案"; current.custom = true;
  assert.deepEqual(layoutChanges(current, before).map(change => change.key), ["preset"]);
  current.leftWidth = before.leftWidth; current.voiceOpen = before.voiceOpen; current.preset = before.preset; current.custom = before.custom;
  assert.deepEqual(layoutChanges(current, before), []);
  const ordered = { ...before, enabled: ["A", "B"] };
  assert.equal(layoutChanges({ ...ordered, enabled: ["B", "A"] }, ordered)[0].text, "内容顺序已调整");
});

test("the shared edit entry preserves its actual trigger for the fixture's sole-entry guard", () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  let trigger;
  const view = createWorkspaceLayoutVisual({ state: { ...store.read.snapshot(), editing: false }, begin: anchor => { trigger = anchor; } });
  const button = view.element.querySelector("#composer-edit");
  button.click();
  assert.equal(trigger, button);
  assert.equal(trigger.id, "composer-edit");
}));

test("per-dimension defaults and reasons use current viewport capacity without changing another side", () => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 922, height: 720 });
  const original = store.read.snapshot();
  assert.equal(layoutDimension(original, "left").restore, 230);
  assert.equal(layoutDimension(original, "right").boundary, "fixed");
  assert.match(layoutDimension(original, "right").reason, /窗口.*左侧栏/);
  assert.equal(layoutDimension(original, "voice").restore, 120);
  assert.equal(store.read.snapshot(), original, "display projection has no mutations");
});

test("paired size controls use the accepted endpoint without a dead track zone", () => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const state = store.read.snapshot();
  assert.equal(layoutDimension(state, "left").trackMaximum, layoutDimension(state, "right").trackMaximum);
  assert.equal(layoutDimension(state, "left").trackMinimum, layoutDimension(state, "right").trackMinimum);
  assert.equal(layoutDimension(state, "left").maximum, layoutDimension(state, "right").maximum);
  assert.equal(layoutDimension(state, "left").trackMaximum, layoutDimension(state, "left").maximum);
  assert.equal(layoutDimension(state, "right").trackMaximum, layoutDimension(state, "right").maximum);
  assert.equal(layoutDimension(state, "top").trackMaximum, layoutDimension(state, "top").maximum);
  assert.equal(layoutDimension(state, "voice").trackMaximum, layoutDimension(state, "voice").maximum);

  const compact = { ...createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1024, height: 720 }).read.snapshot(), leftWidth: 234, rightWidth: 230 };
  const compactLeft = layoutDimension(compact, "left"), compactRight = layoutDimension(compact, "right");
  assert.equal(compactLeft.trackMaximum, compactLeft.maximum);
  assert.equal(compactRight.trackMaximum, compactRight.maximum);
});

test("paired regions expose one geometry contract and equal open band heights", () => {
  assert.equal(WORKSPACE_MINIMUMS.left, WORKSPACE_MINIMUMS.right);
  assert.equal(WORKSPACE_MAXIMUMS.left, WORKSPACE_MAXIMUMS.right);
  assert.equal(WORKSPACE_MINIMUMS.top, WORKSPACE_MINIMUMS.voice);
  assert.equal(WORKSPACE_MAXIMUMS.top, WORKSPACE_MAXIMUMS.voice);
  const state = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 }).read.snapshot();
  const open = { ...state, voiceOpen: true };
  assert.equal(open.topHeight, open.voiceHeight);
  assert.equal(workspaceFooterHeight(open), open.voiceHeight);
  assert.equal(workspaceVoiceContentHeight(open) + WORKSPACE_CHROME.voiceTitle, open.voiceHeight);
});

for (const side of ["left", "right", "top", "voice"]) test(`${side} fixed capacity disables size inputs and widening restores the same controls`, () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 640, height: 480 });
  store.setRegionOpen(side, true);
  const calls = [], root = h("div"); document.body.append(root);
  const component = mountWorkspaceLayout(root, { execute: (...args) => calls.push(args) }, store.read);
  const input = root.querySelector("#layout-size-" + side), range = root.querySelector("#layout-range-" + side);
  const toggle = root.querySelector("#layout-" + side), row = root.querySelector(`[data-region="${side}"]`);
  assert.equal(layoutDimension(store.read.snapshot(), side).boundary, "fixed");
  assert.equal(input.disabled, true); assert.equal(range.disabled, true);
  assert.equal(row.dataset.adjustable, "false"); assert.equal(toggle.disabled, false);
  assert.match(range.title, /窗口.*可调空间/);
  input.value = "999"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("blur"));
  range.value = "999"; range.dispatchEvent(new Event("input"));
  assert.deepEqual(calls, [], "fixed size cannot dispatch even a queued input callback");
  store.setViewport(1440, 900);
  assert.equal(root.querySelector("#layout-size-" + side), input);
  assert.equal(root.querySelector("#layout-range-" + side), range);
  assert.equal(input.disabled, false); assert.equal(range.disabled, false);
  assert.equal(row.dataset.adjustable, "true");
  input.focus(); store.setViewport(640, 480);
  assert.equal(document.activeElement, toggle, "capacity loss returns focus to its local toggle");
  assert.equal(Number(input.value), store.read.snapshot()[{ left: "leftWidth", right: "rightWidth", top: "topHeight", voice: "voiceHeight" }[side]]);
  component.dispose(); root.remove();
}));

test("the compact region rows keep one shared icon, range, value and restore contract", () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const view = createWorkspaceLayoutVisual({
    state: { ...store.read.snapshot(), editing: false },
    begin() {}, region() {}, resize() {}, arrange() {},
  });
  const rows = view.element.querySelectorAll(".v-layout-region-size-row");
  assert.equal(rows.length, 4);
  const openBySide = { left: "leftOpen", right: "rightOpen", top: "topOpen", voice: "voiceOpen" };
  for (const entry of ["left", "right", "top", "voice"]) {
    const row = view.element.querySelector(`[data-region="${entry}"]`);
    assert.ok(row, entry + " row exists");
    const open = !!store.read.snapshot()[openBySide[entry]];
    assert.equal(row.querySelector(".v-layout-region-toggle").getAttribute("aria-pressed"), String(open));
    assert.ok(row.querySelector("#layout-range-" + entry), entry + " range exists");
    const valueInput = row.querySelector("#layout-size-" + entry);
    assert.ok(valueInput, entry + " value input exists");
    assert.equal(valueInput.disabled, !open);
    assert.equal(row.querySelector(".v-size-input").textContent.endsWith("px"), true);
    assert.ok(row.querySelector("#layout-reset-" + entry), entry + " restore exists");
  }
  assert.equal(view.element.querySelector(".v-layout-region-size-group").getAttribute("aria-label"), "区域尺寸");
  assert.equal(view.element.querySelectorAll(".v-layout-group-label").length, 1);
}));

test("visual fixtures reuse the paired minimums and defaults instead of stale asymmetric samples", () => {
  const narrow = fixtureFor("S05", "narrow");
  assert.equal(narrow.leftWidth, WORKSPACE_MINIMUMS.left);
  assert.equal(narrow.rightWidth, WORKSPACE_MINIMUMS.right);
  const balanced = fixtureFor("S05", "default");
  assert.equal(balanced.leftWidth, WORKSPACE_DEFAULT_SIZES.left);
  assert.equal(balanced.rightWidth, WORKSPACE_DEFAULT_SIZES.right);
});

test("persistent workspace controls operate outside component editing and update ranges without replacing inputs", () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const element = document.createElement("div"); document.body.append(element);
  const commands = [];
  const component = mountWorkspaceLayout(element, { execute(id, payload) {
    commands.push([id, payload]);
    if (id === C.begin) return store.beginAdjustment();
    if (id === C.finish) return store.finishAdjustment(payload.confirm);
    if (id === C.resize) return store.resize(payload.side, payload.value);
    if (id === C.region) return store.toggleRegion(payload.region);
    if (id === C.arrange) return store.arrange(payload.mode);
  } }, store.read);
  assert.equal(element.querySelector("#layout-size-left").disabled, true);
  element.querySelector("#layout-left").dispatchEvent(new Event("click"));
  assert.equal(element.querySelector("#layout-size-left").disabled, false);
  const sizeControl = element.querySelector("#layout-size-left").parentNode.parentNode;
  assert.equal(sizeControl.childNodes[0].classList.contains("v-sr-only"), true);
  const input = element.querySelector("#layout-size-left"); input.value = "280"; input.validity = { valid: true };
  input.dispatchEvent(new Event("input"));
  const restoreTop = element.querySelector("#layout-reset-top");
  assert.equal(restoreTop.disabled, true); restoreTop.dispatchEvent(new Event("click"));
  assert.deepEqual(commands, [[C.region, { region: "left" }], [C.resize, { side: "left", value: 280 }]], "disabled restore cannot dispatch");
  store.resize("top", 144); assert.equal(restoreTop.disabled, false); restoreTop.click();
  assert.deepEqual(commands, [[C.region, { region: "left" }], [C.resize, { side: "left", value: 280 }], [C.resize, { side: "top", value: 120 }]]);
  assert.equal(store.read.snapshot().leftWidth, 280);
  assert.equal(store.read.snapshot().adjusting, false);
  element.querySelector("#composer-edit").focus();
  element.querySelector("#composer-edit").click();
  assert.equal(document.activeElement.id, "layout-cancel");
  assert.match(element.querySelector("#layout-session").textContent, /未修改/);
  input.value = "300"; input.dispatchEvent(new Event("input"));
  assert.equal(store.read.snapshot().leftWidth, 300);
  assert.equal(element.querySelector("#layout-size-left"), input);
  assert.match(element.querySelector("#layout-session").textContent, /未修改/);
  element.querySelector("#layout-reset-left").click();
  assert.equal(store.read.snapshot().leftWidth, 260);
  assert.match(element.querySelector("#layout-session").textContent, /未修改/);
  store.setViewport(922, 720);
  assert.equal(Number(input.max), 230);
  assert.equal(element.querySelector("#layout-reset-left").disabled, true);
  assert.match(element.querySelector("#layout-limit-right").textContent, /暂无调整空间/);
  element.querySelector("#layout-cancel").focus(); element.querySelector("#layout-cancel").click();
  assert.equal(document.activeElement.id, "composer-edit");
  assert.equal(element.querySelector("#layout-size-left"), input);
  const finalStatus = element.querySelector("#layout-session").textContent;
  component.dispose(); store.resize("top", 64);
  assert.equal(element.querySelector("#layout-session").textContent, finalStatus, "subscription disposed");
}));

test("an ordinary edit starts without implicit selection, while explicit review selections remain reproducible", () => {
  const state = fixtureFor(); applySidebarReview(state, new URLSearchParams("presentation=grid"));
  beginLayoutEdit(state); assert.equal(state.selectedModule, null);
  state.contentInputs.A = "应保留"; state.preset = "临时方案"; state.custom = true;
  finishLayoutEdit(state, false);
  assert.equal(state.preset, "写谱"); assert.equal(state.custom, false); assert.equal(state.contentInputs.A, "应保留");
  const selected = fixtureFor(); applySidebarReview(selected, new URLSearchParams("presentation=grid&sample=fixed"));
  prepareLayoutFixture(selected); assert.equal(selected.selectedModule, "D"); assert.equal(selected.assembly, true);
});

test("the half-width limit specimen follows the actual review padding and gap without mutating content", () => {
  const state = fixtureFor(); applySidebarReview(state, new URLSearchParams("presentation=grid&sample=width-limit"));
  state.leftWidth = 230;
  assert.deepEqual(reviewHalfSpace(state, { id: "B" }), { available: 91, minimum: 128, allowed: false });
  state.leftWidth = 320;
  assert.deepEqual(reviewHalfSpace(state, { id: "B" }), { available: 136, minimum: 128, allowed: true });
  assert.equal(state.widths.B, "full", "capacity does not silently change layout");
});

test("capacity feedback follows widening and narrowing without detaching the user's next click target", () => withTestDocument(() => {
  const state = fixtureFor(); applySidebarReview(state, new URLSearchParams("presentation=grid&sample=width-limit"));
  prepareLayoutFixture(state);
  const button = h("button", { id: "content-width" }), reason = h("p", { class: "v-editor-reason" });
  const element = h("div", {}, button, reason); document.body.append(element); button.focus();
  state.leftWidth = 260; updateReviewCapacity(element, state, REVIEW_CONTENT);
  assert.equal(button.disabled, true); assert.match(reason.textContent, /106 px.*128 px/);
  state.leftWidth = 320; updateReviewCapacity(element, state, REVIEW_CONTENT);
  assert.equal(button.disabled, false); assert.equal(reason.hidden, true);
  state.leftWidth = 230; updateReviewCapacity(element, state, REVIEW_CONTENT);
  assert.equal(button.disabled, true); assert.match(reason.textContent, /91 px.*128 px/);
  assert.equal(document.activeElement, button); assert.equal(element.querySelector("#content-width"), button);
}));
