import type { NotationView } from "../contracts/notation";
import type { NotationRenderer } from "../notation/notation-renderer";
import { layoutScorePages, SCORE_PAPER } from "../notation/score-page-layout";

const SVG_NS = "http://www.w3.org/2000/svg";

async function embeddedFonts(): Promise<string> {
  // VexFlow bundles these WOFF2 sources, but the live FontFace registrations do
  // not survive in a standalone SVG opened outside the workbench.
  const [bravura, academico] = await Promise.all([
    import("../../node_modules/vexflow/build/esm/src/fonts/bravura.js?raw"),
    import("../../node_modules/vexflow/build/esm/src/fonts/academico.js?raw"),
  ]);
  const source = (text: string, family: string) => {
    const match = text.match(/^export const \w+ = '(data:font\/woff2[^']+)';?\s*$/);
    if (!match?.[1]) throw new Error(`${family} 字体无法嵌入导出文件`);
    return `@font-face{font-family:'${family}';src:url('${match[1]}') format('woff2')}`;
  };
  return source(bravura.default, "Bravura") + source(academico.default, "Academico");
}

/** Draw from the authoritative notation projection, without editor cursor or selection. */
export async function exportStaffSvg(notation: NotationView, renderer: NotationRenderer): Promise<string> {
  if (notation.kind !== "staff") throw new Error("当前乐谱格式无法导出五线谱 SVG");
  const pages = layoutScorePages(notation);
  if (!pages.length) throw new Error("当前没有可以导出的谱面");
  const gap = 24;
  const height = pages.length * SCORE_PAPER.height + (pages.length - 1) * gap;
  const output = document.createElementNS(SVG_NS, "svg");
  output.setAttribute("xmlns", SVG_NS);
  output.setAttribute("viewBox", `0 0 ${SCORE_PAPER.width} ${height}`);
  output.setAttribute("width", String(SCORE_PAPER.width));
  output.setAttribute("height", String(height));
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = await embeddedFonts();
  output.append(style);
  for (const [index, page] of pages.entries()) {
    const drawn = await renderer.render(page, { ink: "#252525", muted: "#737478", fontFamily: "Academico" });
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `translate(0 ${index * (SCORE_PAPER.height + gap)})`);
    const paper = document.createElementNS(SVG_NS, "rect");
    paper.setAttribute("width", String(SCORE_PAPER.width)); paper.setAttribute("height", String(SCORE_PAPER.height));
    paper.setAttribute("fill", "#f4f4f2"); group.append(paper);
    const engraving = drawn.svg.cloneNode(true) as SVGSVGElement;
    engraving.querySelectorAll("[data-event-id], [data-measure-id], .input-cursor, .pitch-draft").forEach((node) => node.remove());
    // SVGContext puts default font, fill and stroke on its root <svg>. Flattening
    // that root previously discarded those inherited styles for every glyph.
    for (const attribute of ["font-family", "font-size", "font-weight", "font-style", "fill", "stroke", "stroke-width", "stroke-dasharray"]) {
      const value = engraving.getAttribute(attribute);
      if (value !== null) group.setAttribute(attribute, value);
    }
    for (const node of Array.from(engraving.childNodes)) group.append(node);
    output.append(group);
  }
  return new XMLSerializer().serializeToString(output);
}
