import { createTablatureRenderer } from "../vendor/shared-notation/tablature-renderer.js";
import { layoutTablaturePages } from "../vendor/shared-notation/tablature-layout.js";
import { composeNotationPages } from "../vendor/shared-notation/compose-notation-pages.js";
import { loadVexFlow } from "./vexflow-runtime.js";

const renderer = createTablatureRenderer(loadVexFlow);
const theme = Object.freeze({ ink: "#14161a", muted: "#62666d", fontFamily: "Academico" });

/** This drawing port is ready for a real Tab source; the current core view remains staff. */
export async function renderTablature(input, { signal } = {}) {
  const pages = layoutTablaturePages(input);
  const drawings = [];
  for (const page of pages) drawings.push(await renderer.render(page, theme, signal));
  return composeNotationPages(pages, drawings, signal);
}
