// Public UI-only interaction commands. No command here writes a score document.
export const SCORE_SELECTION_CONTRACT_VERSION = 1;
export const SCORE_SELECTION_COMMANDS = Object.freeze({
  select: "notation.core.selection.select",
  locate: "notation.core.selection.locate",
  navigate: "notation.core.selection.navigate",
});
export const SCORE_NAVIGATION_KEYS = Object.freeze(["ArrowLeft", "ArrowRight", "Home", "End", "Escape"]);
