import { createRequire } from "node:module";
import { withTestDocument } from "./dom-test-environment.js";
const require = createRequire(new URL("../../../../apps/workbench/package.json", import.meta.url));

/** Real VexFlow; only DOM and Canvas text metrics are explicit doubles. No pixel qualification. */
export function withEngravingDocument(run, measureText = text => ({
  width: text.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 8,
  actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 3,
})) {
  return withTestDocument(async environment => {
    const { document } = environment, create = document.createElement;
    document.createElement = tag => {
      const node = create(tag);
      node.appendChild = child => { node.append(child); return child; };
      node.setAttributeNS = (_namespace, key, value) => node.setAttribute(key, value);
      if (tag === "canvas") node.getContext = () => ({ font: "", measureText });
      return node;
    };
    document.createElementNS = (namespaceURI, tag) => Object.assign(document.createElement(tag), { namespaceURI });
    document.createTextNode = text => { const node = create("span"); node.textContent = text; return node; };
    const runtime = require("vexflow/bravura");
    // Match the actual application loader's CJS/browser-to-ESM normalization.
    const engine = { ...runtime, default: runtime.default ?? runtime };
    // VexFlow caches its measurement canvas. Keep isolated metric doubles with their owning test.
    const previous = engine.Element.getTextMeasurementCanvas();
    engine.Element.setTextMeasurementCanvas(document.createElement("canvas"));
    try { return await run({ ...environment, engine }); }
    finally { engine.Element.setTextMeasurementCanvas(previous); }
  });
}
