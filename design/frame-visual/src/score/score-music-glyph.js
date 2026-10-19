import { musicGlyphLayout } from "../vendor/score-interaction.js";
import { loadVexFlow } from "./vexflow-runtime.js";

/** Reuses the established Bravura ink layout; every update/disposal invalidates late glyphs. */
export function createScoreMusicGlyph(element, { load = loadVexFlow } = {}) {
  let disposed = false, epoch = 0, current = null;
  element.classList.add("score-property-glyph"); element.setAttribute("aria-hidden", "true");
  return Object.freeze({
    set(symbol, fallback) {
      if (disposed || symbol === current) return;
      current = symbol; const token = ++epoch;
      element.textContent = fallback; element.dataset.glyphState = "loading";
      void Promise.resolve().then(() => disposed || token !== epoch ? null : load()).then(() => {
        if (disposed || token !== epoch) return;
        const document = element.ownerDocument, context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("Font measurement unavailable");
        context.font = "32px Bravura";
        const box = musicGlyphLayout(context.measureText(symbol));
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
        svg.setAttribute("width", "20"); svg.setAttribute("height", "20"); svg.setAttribute("focusable", "false");
        svg.setAttribute("aria-hidden", "true");
        const text = document.createElementNS(svg.namespaceURI, "text");
        for (const [key, value] of Object.entries({ x: box.x, y: box.y, "font-family": "Bravura", "font-size": 32, fill: "currentColor" })) {
          text.setAttribute(key, String(value));
        }
        text.textContent = symbol; svg.append(text); element.replaceChildren(svg); element.dataset.glyphState = "ready";
      }).catch(() => { if (!disposed && token === epoch) { current = null; element.dataset.glyphState = "fallback"; } });
    },
    dispose() { disposed = true; epoch++; element.replaceChildren(); },
  });
}
