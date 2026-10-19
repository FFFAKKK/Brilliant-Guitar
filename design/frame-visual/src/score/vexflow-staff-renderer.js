import { createVexflowRenderer } from "../vendor/shared-notation/vexflow-renderer.js";
import { layoutScorePages } from "../vendor/shared-notation/score-page-layout.js";
import { composeNotationPages } from "../vendor/shared-notation/compose-notation-pages.js";
import { normalizeStaffSnapshot } from "./notation-model.js";
import { loadVexFlow } from "./vexflow-runtime.js";

const renderer = createVexflowRenderer(loadVexFlow);
const theme = Object.freeze({ ink: "#14161a", muted: "#62666d", fontFamily: "Academico" });

/** Adopt complete A4 pages and their same-render geometry; no engraving rules here. */
export async function renderStaff(input, { signal } = {}) {
  const pages = layoutScorePages(normalizeStaffSnapshot(input));
  const drawings = [];
  for (const page of pages) drawings.push(await renderer.render(page, theme, signal));
  return composeNotationPages(pages, drawings, signal);
}
