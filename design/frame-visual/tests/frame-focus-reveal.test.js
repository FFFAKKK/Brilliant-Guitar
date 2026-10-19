import assert from "node:assert/strict";
import test from "node:test";
import { revealFrameFocus } from "../src/shell/frame-accessibility.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { withTestDocument } from "./support/dom-test-environment.js";

// Geometry inputs only; no layout engine or pixel qualification.
function fixture(box, inset = 0) {
  const parent = { getAttribute: () => "", dataset: { frameReading: "reading" }, id: "reading",
    scrollTop: 100, scrollLeft: 100, parentElement: null,
    getBoundingClientRect: () => ({ left: 10, right: 110, top: 10, bottom: 110 }),
    querySelector: () => inset ? { getAttribute: () => "", contains: () => false,
      getBoundingClientRect: () => ({ height: inset }) } : null };
  return { parent, node: { getAttribute: () => "", parentElement: parent, getBoundingClientRect: () => box } };
}

test("focus reveal restores horizontally clipped controls on either side with minimal local scrolling", () => {
  for (const [left, right, scrollLeft] of [[92, 124, 118], [0, 32, 86]]) {
    const { node, parent } = fixture({ left, right, top: 40, bottom: 68 });
    revealFrameFocus(node);
    assert.equal(parent.scrollLeft, scrollLeft); assert.equal(parent.scrollTop, 100);
  }
});

test("an already visible or viewport-spanning target does not bounce between edges", () => {
  for (const box of [{ left: 20, right: 100, top: 40, bottom: 68 }, { left: 0, right: 180, top: 0, bottom: 180 }]) {
    const { node, parent } = fixture(box);
    revealFrameFocus(node); revealFrameFocus(node);
    assert.equal(parent.scrollLeft, 100); assert.equal(parent.scrollTop, 100);
  }
});

test("oversized targets outside one edge reveal the nearest edge rather than jumping across the target", () => {
  for (const [start, end, expected] of [[60, 220, 146], [-80, 80, 74]]) {
    const { node, parent } = fixture({ left: start, right: end, top: start, bottom: end });
    revealFrameFocus(node);
    assert.equal(parent.scrollLeft, expected); assert.equal(parent.scrollTop, expected);
  }
});

test("sticky reading headers remain clear while horizontal and vertical exposure are independent", () => {
  const { node, parent } = fixture({ left: 20, right: 60, top: 30, bottom: 58 }, 40);
  revealFrameFocus(node);
  assert.equal(parent.scrollTop, 76); assert.equal(parent.scrollLeft, 100);
  parent.id = "score-scroll";
  revealFrameFocus(node); assert.equal(parent.scrollTop, 76); assert.equal(parent.scrollLeft, 100);
});

test("private and unavailable controls never cause frame scroll changes", () => {
  for (const extra of [{ getAttribute: () => null }, { hidden: true }, { disabled: true }, { inert: true }]) {
    const { node, parent } = fixture({ left: 130, right: 162, top: 130, bottom: 158 });
    Object.assign(node, extra); revealFrameFocus(node);
    assert.equal(parent.scrollLeft, 100); assert.equal(parent.scrollTop, 100);
  }
});

test("the actual layout page uses focus-visible local reveal without changing score, layout or disposal behavior", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    assert.equal(runtime.execute(C.page, { id: "frame.layout.page", toggle: false }).ok, true);
    assert.equal(runtime.execute(C.configureRegion, { region: "left", open: true }).ok, true);
    const field = root.querySelector("#layout-size-left"), page = root.querySelector(".v-page-content");
    const body = root.querySelector(".v-layout-content");
    const header = root.querySelector(".v-composer-header"), stage = root.querySelector("#score-scroll");
    const paper = root.querySelector(".v-paper"), state = runtime.workspace.snapshot();
    assert.equal(field.disabled, false); assert.equal(page.dataset.frameReading, page.id);
    assert.equal(body.dataset.frameReading, body.id);
    assert.equal(body.getAttribute("aria-label"), "布局设置内容");
    assert.equal(header.dataset.frameFocusInset, undefined); assert.ok(stage);
    // Browser features are added locally to this scenario, not to the shared double.
    for (let node = field; node?.tagName; node = node.parentNode) {
      Object.defineProperty(node, "parentElement", { configurable: true, get() {
        return this.parentNode?.tagName ? this.parentNode : null;
      } });
    }
    page.scrollTop = 0; page.scrollLeft = 0; body.scrollTop = 100; body.scrollLeft = 40;
    stage.scrollTop = 210; stage.scrollLeft = 75;
    page.getBoundingClientRect = () => ({ left: 100, right: 330, top: 20, bottom: 140 });
    body.getBoundingClientRect = () => ({ left: 100, right: 330, top: 64, bottom: 140 });
    header.getBoundingClientRect = () => ({ left: 100, right: 330, top: 20, bottom: 64, height: 44 });
    field.getBoundingClientRect = () => ({ left: 340 - body.scrollLeft, right: 390 - body.scrollLeft,
      top: 145 - body.scrollTop, bottom: 173 - body.scrollTop });
    let keyboard = false;
    const matches = field.matches.bind(field);
    field.matches = selector => selector === ":focus-visible" ? keyboard : matches(selector);
    const focus = () => { field.focus(); field.dispatchEvent(new Event("focusin", { bubbles: true })); };
    focus(); assert.equal(body.scrollTop, 100); assert.equal(body.scrollLeft, 40);
    keyboard = true; focus(); assert.equal(body.scrollTop, 77); assert.equal(body.scrollLeft, 64);
    assert.equal(page.scrollTop, 0); assert.equal(page.scrollLeft, 0);
    assert.equal(stage.scrollTop, 210); assert.equal(stage.scrollLeft, 75);
    assert.equal(root.querySelector(".v-paper"), paper); assert.equal(runtime.workspace.snapshot(), state);
    runtime.dispose(); body.scrollTop = 100; body.scrollLeft = 40; focus();
    assert.equal(body.scrollTop, 100); assert.equal(body.scrollLeft, 40);
  } finally { runtime.dispose(); root.remove(); }
}));
