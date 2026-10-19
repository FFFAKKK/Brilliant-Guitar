import { workspaceVoiceContentHeight } from "../workspace-geometry.js";

// The structure fixture and the reusable runtime shell must project the same
// host state into the same CSS variables. Keeping this in one place prevents
// a visual-only entry from drifting away from the runtime entry after a
// geometry change.
export function applyWorkspaceShellGeometry(shell, state) {
  if (!shell || !state) throw new TypeError("工作区外壳几何投影需要 shell 和 state");
  shell.style.setProperty("--left-w", (state.leftOpen ? state.leftWidth : 0) + "px");
  shell.style.setProperty("--right-w", (state.rightOpen ? state.rightWidth : 0) + "px");
  shell.style.setProperty("--left-capacity", state.leftWidth + "px");
  shell.style.setProperty("--right-capacity", state.rightWidth + "px");
  shell.style.setProperty("--top-h", state.topHeight + "px");
  shell.style.setProperty("--visible-top", (state.topOpen ? state.topHeight : 0) + "px");
  shell.style.setProperty("--voice-content", workspaceVoiceContentHeight(state) + "px");
  return shell;
}
