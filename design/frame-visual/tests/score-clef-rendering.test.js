import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderClefPreview } from "../src/vendor/shared-notation/clef-preview.js";
import { createScoreClefGlyph } from "../src/score/score-clef-glyph.js";
import { withTestDocument } from "./support/dom-test-environment.js";
const require = createRequire(new URL("../../../apps/workbench/package.json", import.meta.url));

test("real VexFlow clef previews distinguish C3 and C4 on five lines with measured ink bounds", () => withTestDocument(async ({ document }) => {
  // Only DOM and Canvas text metrics are doubles. VexFlow's placement, stave and SVG generation execute unchanged.
  const create = document.createElement;
  document.createElement = tag => {
    const node = create(tag);
    node.appendChild = child => { node.append(child); return child; };
    node.setAttributeNS = (_namespace, key, value) => node.setAttribute(key, value);
    if (tag === "canvas") node.getContext = () => ({ font: "", measureText: () => ({
      width: 28, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 28,
      actualBoundingBoxAscent: 38, actualBoundingBoxDescent: 10,
    }) });
    return node;
  };
  document.createElementNS = (namespaceURI, tag) => Object.assign(document.createElement(tag), { namespaceURI });
  document.createTextNode = text => { const node = create("span"); node.textContent = text; return node; };
  const engine = require("vexflow/bravura");
  const drawings = {};
  for (const clef of ["treble", "bass", "alto", "tenor"]) {
    const svg = await renderClefPreview(clef, async () => engine); drawings[clef] = svg;
    assert.equal(svg.getAttribute("width"), "26");
    assert.equal(svg.querySelectorAll("path").length, 5, "only five staff lines; no stray barlines");
    assert.equal(svg.querySelectorAll("text").length, 1, "one actual clef symbol");
    const [x, y, width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
    assert.equal(x, 0); assert.equal(width, 64); assert.ok(Number.isFinite(y) && height >= 80);
  }
  const alto = drawings.alto.querySelector("text"), tenor = drawings.tenor.querySelector("text");
  assert.equal(alto.textContent, tenor.textContent, "the same C clef glyph");
  assert.equal(Number(alto.getAttribute("y")) - Number(tenor.getAttribute("y")), 10,
    "tenor is exactly one staff line above alto; placement comes from VexFlow");
  assert.notEqual(drawings.treble.querySelector("text").textContent, drawings.bass.querySelector("text").textContent);
}));

test("mounted clef preview drops VexFlow staging styles and retains the bounded SVG size", () => withTestDocument(async ({ document }) => {
  const element = document.createElement("span");
  const svg = document.createElement("svg");
  svg.setAttribute("width", "26"); svg.setAttribute("height", "26");
  svg.style.width = "64"; svg.style.height = "120";
  const glyph = createScoreClefGlyph(element, "treble", { render: () => svg });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element.dataset.glyphState, "ready");
  assert.equal(svg.style.width, "");
  assert.equal(svg.style.height, "");
  assert.equal(svg.getAttribute("width"), "26");
  assert.equal(svg.getAttribute("height"), "26");
  assert.equal(element.children[0], svg);
  glyph.dispose();
  assert.equal(element.children.length, 0);
}));
