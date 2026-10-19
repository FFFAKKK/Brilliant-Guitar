import { renderClefPreview } from "../vendor/shared-notation/clef-preview.js";
import { loadVexFlow } from "./vexflow-runtime.js";
import { icon } from "../fixtures/preview-icons.js";

/** Local asynchronous presentation only; the VexFlow provider owns music placement. */
export function createScoreClefGlyph(element, clef, { render = value => renderClefPreview(value, loadVexFlow) } = {}) {
  let disposed = false;
  element.className = "score-clef-glyph"; element.setAttribute("aria-hidden", "true");
  element.dataset.glyphState = "loading";
  element.innerHTML = icon("timerReset");
  void Promise.resolve().then(() => disposed ? null : render(clef)).then(svg => {
    if (disposed || !svg) return;
    // VexFlow's staging dimensions must not override the preview's SVG attributes.
    svg.style.width = ""; svg.style.height = "";
    element.replaceChildren(svg); element.dataset.glyphState = "ready";
  }).catch(() => {
    if (!disposed) { element.dataset.glyphState = "error"; element.innerHTML = icon("info"); element.title = "谱号预览加载失败"; }
  });
  return Object.freeze({ dispose() { if (disposed) return; disposed = true; element.replaceChildren(); } });
}
