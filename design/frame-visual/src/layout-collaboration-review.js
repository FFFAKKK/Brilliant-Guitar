// Trusted, explicit review entry. Default previews never import this module.
// Reuse the existing neutral fixture only for the explicit engineering route;
// it is not part of the visual frame or the default review surface.
import { createWorkspaceRuntime } from "./host/workspace-runtime.js";
import { SIDEBAR_COMMANDS } from "./host/sidebar-commands.js";
import { createMovablePanelPlugin } from "../tests/fixtures/representative-plugins/movable-panel-plugin.js";

const root = document.getElementById("app");
const fixture = new URLSearchParams(window.location.search).get("fixture");
const trial = fixture === "movable"
  ? createMovablePanelPlugin({ probeCommand: SIDEBAR_COMMANDS.move })
  : fixture === "layout-pilot"
    ? createMovablePanelPlugin({ probeCommand: SIDEBAR_COMMANDS.move, title: "布局试点面板" })
  : null;
createWorkspaceRuntime({ root, plugins: trial ? [trial.manifest] : [] });

if (!trial) {
  root.dataset.reviewMode = "visual";
}

if (trial) {
  root.dataset.reviewFixture = fixture;
  // Read-only review markers for DOM-based evidence, never a component capability.
  const publishEvidence = () => {
    const state = trial.snapshot();
    root.dataset.reviewMounts = String(state.mounts);
    root.dataset.reviewCleanups = String(state.cleanups);
    root.dataset.reviewEdits = String(state.edits);
    root.dataset.reviewProbeCode = state.probeCode ?? "";
  };
  const observer = new MutationObserver(publishEvidence);
  observer.observe(root, { childList: true, subtree: true });
  publishEvidence();
  const releaseObserver = event => {
    if (event.persisted) return;
    observer.disconnect();
    window.removeEventListener("pagehide", releaseObserver);
  };
  window.addEventListener("pagehide", releaseObserver);
}
