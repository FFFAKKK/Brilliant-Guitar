import assert from "node:assert/strict";
import test from "node:test";
import { h } from "../src/shell/dom.js";
import { captureFrameFocus, prepareFrameReading, readingKey, installFrameReading, revealFrameFocus } from "../src/shell/frame-accessibility.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const key = (name, extra = {}) => ({ key: name, preventDefault() { this.prevented = true; }, ...extra });
test("reading keys reach both ends and use viewport-relative page steps", () => {
  const node = { clientHeight: 180, scrollHeight: 1200, scrollTop: 100, scrollLeft: 0 };
  assert.equal(readingKey(node, key("PageDown")), true); assert.equal(node.scrollTop, 240);
  readingKey(node, key("End")); assert.equal(node.scrollTop, 1200);
  readingKey(node, key("Home")); assert.equal(node.scrollTop, 0);
  readingKey(node, key("ArrowDown")); assert.equal(node.scrollTop, 40);
  readingKey(node, key("ArrowRight")); assert.equal(node.scrollLeft, 40);
});
test("IME, reserved keys and modifiers leave reading and field input untouched", () => {
  const node = { scrollTop: 12, scrollLeft: 0, clientHeight: 100 };
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { defaultPrevented: true }, { getModifierState: () => true }]) {
    const event = key("End", extra); assert.equal(readingKey(node, event), false); assert.equal(event.prevented, undefined);
  }
  assert.equal(readingKey(node, key("Enter")), false); assert.equal(node.scrollTop, 12);
});
test("only frame-owned reading surfaces gain names and tab access; existing tablists and private nodes are preserved", () => withTestDocument(() => {
  const root = h("div", {}), side = h("section", { class: "v-left" }); root.append(side); document.body.append(root);
  const area = h("div", { class: "ch-fixed" }), privateArea = document.createElement("div"); privateArea.className = "ch-fixed";
  const tabs = h("div", { class: "v-rail-list", role: "tablist" });
  Object.assign(area, { clientHeight: 100, clientWidth: 100, scrollHeight: 400 }); side.append(area, privateArea, tabs);
  prepareFrameReading(root);
  assert.equal(area.tabIndex, 0); assert.equal(area.getAttribute("role"), "region"); assert.equal(area.getAttribute("aria-label"), "左侧栏固定区");
  assert.equal(area.id, "frame-read-ch-fixed-left"); assert.equal(privateArea.getAttribute("tabindex"), null); assert.equal(privateArea.getAttribute("role"), null);
  assert.equal(tabs.getAttribute("role"), "tablist"); assert.equal(tabs.getAttribute("data-frame-reading"), null);
  area.scrollHeight = 80; prepareFrameReading(root); assert.equal(area.tabIndex, -1);
}));
test("delegated reading handles only the focused frame area and releases with its existing signal", () => withTestDocument(() => {
  const root = h("div", {}), area = h("div", { id: "reading", dataset: { frameReading: "reading" } }), field = h("input", {});
  area.append(field); root.append(area); document.body.append(root); Object.assign(area, { scrollTop: 0, clientHeight: 100, scrollHeight: 800 });
  const signal = new AbortController(); installFrameReading(root, { signal: signal.signal });
  const press = target => { const event = new Event("keydown", { bubbles: true, cancelable: true }); Object.assign(event, { key: "ArrowDown" }); target.dispatchEvent(event); return event; };
  assert.equal(press(field).defaultPrevented, false); assert.equal(area.scrollTop, 0);
  assert.equal(press(area).defaultPrevented, true); assert.equal(area.scrollTop, 40);
  signal.abort(); assert.equal(press(area).defaultPrevented, false); assert.equal(area.scrollTop, 40);
}));
test("redraw recovers an id-less control by label in its original region", () => withTestDocument(() => {
  const root = h("div", {}), left = h("section", { class: "v-left" }); document.body.append(root); root.append(left);
  const old = h("button", { "aria-label": "下一内容" }); left.append(old); old.focus(); const recover = captureFrameFocus(root);
  const replacement = h("button", { "aria-label": "下一内容" }); left.replaceChildren(replacement); recover(); assert.equal(document.activeElement, replacement);
}));
test("a hidden or disabled old control returns to the visible region switch", () => withTestDocument(() => {
  const root = h("div", {}), switcher = h("button", { id: "region-left" }), left = h("section", { class: "v-left" }), old = h("button", { id: "old" });
  document.body.append(root); root.append(switcher, left); left.append(old); old.focus(); const recover = captureFrameFocus(root);
  left.hidden = true; recover(); assert.equal(document.activeElement, switcher);
  left.hidden = false; old.focus(); const recoverDisabled = captureFrameFocus(root); old.disabled = true; recoverDisabled(); assert.equal(document.activeElement, switcher);
}));
test("without command-bar region switches, lost focus returns to each live local opener", () => withTestDocument(() => {
  for (const [className, openerId] of [["v-left", "module-panel-trigger"], ["v-voice-content", "voice-trigger"],
    ["v-top", "layout-top"], ["v-right", "selected-page"]]) {
    const root = h("div", {}), side = h("section", { class: className }), old = h("button", {});
    const opener = h("button", { id: openerId, "aria-selected": "true" });
    const rail = h("nav", { class: className === "v-right" ? "v-page-rail" : "local-entry" }, opener);
    root.append(side, rail); side.append(old); document.body.append(root);
    old.focus(); const recover = captureFrameFocus(root); side.hidden = true; recover();
    assert.equal(document.activeElement, opener, className); root.remove();
  }
}));
test("an unavailable local opener returns to the score stage, ignoring a switch outside this shell", () => withTestDocument(() => {
  const root = h("div", {}), side = h("section", { class: "v-left" }), old = h("button", { id: "removed-focus" });
  const opener = h("button", { id: "module-panel-trigger", hidden: true }), stage = h("main", { class: "v-stage", tabindex: 0 });
  const outside = h("button", { id: "region-left" }); document.body.append(outside, root);
  root.append(side, opener, stage); side.append(old); old.focus(); const recover = captureFrameFocus(root);
  side.hidden = true; recover(); assert.equal(document.activeElement, stage);
  side.hidden = false; old.focus(); const recoverRemoved = captureFrameFocus(root);
  old.remove(); outside.id = "removed-focus"; recoverRemoved(); assert.equal(document.activeElement, stage);
}));
test("frame redraw does not claim recovery for private plugin focus", () => withTestDocument(() => {
  const root = h("div", {}), privateInput = document.createElement("input"); document.body.append(root); root.append(privateInput); privateInput.focus();
  const recover = captureFrameFocus(root); recover(); assert.equal(document.activeElement, privateInput);
}));
test("a frame component declares its own local focus fallback without a layout id convention", () => withTestDocument(() => {
  const root = h("div", {}), right = h("section", { class: "v-right" }), entry = h("button", { id: "sample-entry", dataset: { frameFocusFallback: "sample-exit" } }), cancel = h("button", { id: "sample-exit", hidden: true });
  root.append(right); right.append(entry, cancel); document.body.append(root); entry.focus(); const recover = captureFrameFocus(root);
  entry.hidden = true; cancel.hidden = false; recover(); assert.equal(document.activeElement, cancel);
}));
test("focus reveal scrolls only its reading ancestor and leaves the score viewport untouched", () => {
  const parent = { getAttribute: () => "", dataset: { frameReading: "reading" }, id: "reading", scrollTop: 0, parentElement: null,
    getBoundingClientRect: () => ({ top: 10, bottom: 110 }), querySelector: selector => {
      assert.equal(selector, "[data-frame-focus-inset]");
      return { getAttribute: () => "", contains: () => false, getBoundingClientRect: () => ({ height: 40 }) };
    } };
  const node = { getAttribute: () => "", parentElement: parent, getBoundingClientRect: () => ({ top: 24, bottom: 40 }) };
  revealFrameFocus(node); assert.equal(parent.scrollTop, -30);
  parent.id = "score-scroll"; parent.scrollTop = 0; revealFrameFocus(node); assert.equal(parent.scrollTop, 0);
});

test("declared local focus fallbacks cannot target private or out-of-scope nodes", () => withTestDocument(() => {
  const root = h("div", {}), right = h("section", { class: "v-right" }), switcher = h("button", { id: "region-right" });
  document.body.append(root); root.append(switcher, right);
  const entry = h("button", { id: "entry", dataset: { frameFocusFallback: "fallback" } });
  const privateButton = document.createElement("button"); privateButton.id = "fallback";
  right.append(entry, privateButton); entry.focus(); const recoverPrivate = captureFrameFocus(root);
  entry.hidden = true; recoverPrivate(); assert.equal(document.activeElement, switcher);
  privateButton.remove(); const outside = h("button", { id: "fallback" }); document.body.append(outside);
  entry.hidden = false; entry.focus(); const recoverOutside = captureFrameFocus(root);
  entry.hidden = true; recoverOutside(); assert.equal(document.activeElement, switcher);
}));
