import { createWorkspaceLayoutVisual } from "../../shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../../layout/workspace-state.js";
import { LAYOUT_MOTION_CONTRIBUTION } from "./layout-motion-definitions.js";

// Explicit review fixture of the actual author's view, not formal permission
// or default runtime wiring. It shares the exact production visual module.
export function mountActualLayoutMotion(root, { motion, onState }) {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: store.read.snapshot().adjusting });
  const view = createWorkspaceLayoutVisual({ state: accepted(),
    begin: () => store.beginAdjustment(), finish: confirm => store.finishAdjustment(confirm),
    region: side => store.toggleRegion(side), resize: (side, value) => store.resize(side, value),
    arrange: mode => store.arrange(mode),
  });
  root.dataset.actualLayout = "true"; root.append(view.element);
  const update = () => {
    view.update(accepted()); onState(snapshot());
  };
  const snapshot = () => Object.freeze({ ...store.read.snapshot(), view: "regions", dragging: false, reviewActualView: true });
  update();
  view.attachMotion(descriptor => motion.bind({ ...descriptor, plugin: LAYOUT_MOTION_CONTRIBUTION.plugin }),
    { shapeTransition: true, selectionTransition: true, toggleTransition: true, editTransition: true, onIssue: () => onState({ ...snapshot(), issue: true }) });
  const stop = store.read.subscribe(update);
  return Object.freeze({ snapshot,
    replay(immediate = false) {
      const mode = root.querySelector("#layout-balanced").getAttribute("aria-pressed") === "true" ? "compact" : "balanced";
      root.querySelector("#layout-" + mode).dispatchEvent(new MouseEvent("click", { detail: immediate ? 0 : 1 }));
    },
    settle() { view.setVisible(true); },
    dispose() { stop(); view.dispose(); root.removeAttribute("data-actual-layout"); },
  });
}
