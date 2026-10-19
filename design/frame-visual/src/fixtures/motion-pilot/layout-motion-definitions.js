import { API_VERSION } from "./definition-contract.js";
import { WORKSPACE_LAYOUT_ANIMATIONS, LAYOUT_PREVIEW_SHAPE } from "../../features/workspace-layout-motion-recipes.js";

// Review identity wraps the same private artwork used by the actual layout.
// Only this fixture wrapper depends on the review protocol version.
export const LAYOUT_MOTION_CONTRIBUTION = Object.freeze({
  plugin: Object.freeze({ id: "frame.layout", label: "工作区布局", version: "0.1.0", hostApiVersion: API_VERSION }),
  animations: WORKSPACE_LAYOUT_ANIMATIONS,
});

// The shape capability remains in the review wrapper. Existing shared artwork
// and the formal component's three permitted intents keep their exact identity.
export const LAYOUT_PREVIEW_MOTION_CONTRIBUTION = Object.freeze({
  ...LAYOUT_MOTION_CONTRIBUTION,
  animations: Object.freeze({ ...WORKSPACE_LAYOUT_ANIMATIONS,
    "shape-transition": LAYOUT_PREVIEW_SHAPE,
  }),
});
export { LAYOUT_RELEASE_WINDOW, layoutContentTravel } from "../../features/workspace-layout-motion-recipes.js";
