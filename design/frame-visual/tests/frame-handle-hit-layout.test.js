import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORKSPACE_RAILS } from "../src/workspace-geometry.js";

// Source geometry invariants only; these checks do not calculate native layout
// or qualify pixels. Keep button size and chrome capacity independent of handles.
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), declarations: Object.fromEntries(body.split(";").filter(s => s.trim()).map(s => {
    const at = s.indexOf(":"); return [s.slice(0, at).trim(), s.slice(at + 1).trim()];
  })) }));
const edgeRules = () => rules(read("styles/frame-edge-handles.css"));
const flat = selector => rules(read("styles/structure-preview.css")).find(rule => rule.selector === selector).declarations;
const px = value => { assert.match(value ?? "", /^\d+px$/); return Number.parseFloat(value); };

for (const side of ["left", "right"]) test(`${side} rail reserves a handle lane without reducing the 32px icon target`, () => {
  const rail = WORKSPACE_RAILS[side], button = flat(".v-rail-button");
  assert.equal(px(button.width), 32); assert.equal(px(button.height), 32); assert.equal(rail, 40);
  const edge = edgeRules().find(rule => rule.selector.includes(`[data-edge="${side}"]`)).declarations;
  const selector = side === "left"
    ? ".v-icon-rail:where([data-frame-ui]) > :is(.v-rail-actions,.v-rail-list,.v-rail-footer):where([data-frame-ui])"
    : ".v-page-rail:where([data-frame-ui]) > .v-rail-list:where([data-frame-ui])";
  const reserved = edgeRules().find(rule => rule.selector === '.visual-shell[data-runtime="workspace"] ' + selector)?.declarations;
  const base = flat(".v-rail-list"), [vertical, horizontal] = base.padding.split(/\s+/);
  assert.equal(vertical, "0");
  const left = px(reserved?.["padding-left"] ?? horizontal), right = px(reserved?.["padding-right"] ?? horizontal);
  assert.equal(rail - left - right >= px(button.width), true, "reserving a lane must not squeeze the target");
  const start = left + (rail - left - right - px(button.width)) / 2, end = start + px(button.width);
  assert.equal(side === "left" ? end <= rail - px(edge.width) : start >= px(edge.width), true,
    "a visible or invisible handle must not steal any part of an icon's click area");
} );

test("top closed-region handle uses the shared menu-safe anchor without resizing command chrome", () => {
  const top = edgeRules().find(rule => rule.selector === '.visual-shell button:where([data-frame-ui]).v-edge-handle[data-edge="top"]')?.declarations;
  assert.equal(top?.position, "absolute");
  assert.equal(top.left, "var(--frame-horizontal-handle-left, calc(50% - 32px))");
  assert.equal(top.width, "var(--frame-horizontal-handle-width, 64px)"); assert.equal(top.height, "12px");
  assert.equal(top.bottom, "0"); assert.equal(top.flex, undefined); assert.equal(top.margin, undefined);
  const bar = flat(".v-title"); assert.equal(bar.display, "flex");
  const source = read("src/shell/frame-command-bar.js");
  assert.match(source, /class: "v-title-start"/); assert.doesNotMatch(source, /position:|window-buttons|region-switches/);
});


test("handle lanes are limited to the actual workspace shell and leave historical fixtures unmodified", () => {
  const lanes = edgeRules().filter(rule => rule.selector.includes("v-icon-rail") || rule.selector.includes("v-page-rail"));
  assert.equal(lanes.length, 2);
  for (const rule of lanes) assert.match(rule.selector, /^\.visual-shell\[data-runtime="workspace"\] /);
  assert.match(read("src/shell/visual-workbench.js"), /runtime: "workspace"/);
  assert.doesNotMatch(read("src/fixtures/structure-preview.js"), /runtime: "workspace"/);
});
