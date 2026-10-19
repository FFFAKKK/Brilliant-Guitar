import type { StaffClef } from "./note-properties.ts";

/** Use the engraving engine's stave lines, clef placement and measured ink for tool previews. */
export async function renderClefPreview(clef: StaffClef, load: () => Promise<typeof import("vexflow/bravura")>): Promise<SVGSVGElement> {
  const { Renderer, Stave, Clef, BarlineType } = await load();
  const staging = document.createElement("div");
  const renderer = new Renderer(staging, Renderer.Backends.SVG);
  renderer.resize(64, 120);
  const context = renderer.getContext();
  context.setFillStyle("currentColor").setStrokeStyle("currentColor");
  const stave = new Stave(0, 0, 64);
  stave.setBegBarType(BarlineType.NONE).setEndBarType(BarlineType.NONE).addClef(clef).setContext(context).draw();
  const box = stave.getModifiers(undefined, Clef.CATEGORY)[0]?.getBoundingBox();
  if (!box) throw new Error("Clef preview has no ink bounds");
  const spacing = stave.getSpacingBetweenLines();
  const top = Math.min(stave.getYForLine(0) - spacing * 2, box.getY() - 4);
  const bottom = Math.max(stave.getYForLine(4) + spacing * 2, box.getY() + box.getH() + 4);
  const svg = staging.querySelector("svg");
  if (!svg) throw new Error("Clef preview has no SVG");
  svg.setAttribute("viewBox", `0 ${top} 64 ${bottom - top}`);
  svg.setAttribute("width", "26"); svg.setAttribute("height", "26");
  svg.setAttribute("focusable", "false"); svg.setAttribute("aria-hidden", "true");
  return svg;
}
