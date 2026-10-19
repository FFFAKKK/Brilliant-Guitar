import { LAYOUT_REGIONS } from "./layout-visual-state.js";
import { LAYOUT_REGION_EMPHASIS } from "../features/workspace-layout-motion-recipes.js";
import { h } from "./dom.js";

// Private presentation adapter, not a new plugin or public SDK. The caller
// supplies an owner-bound executor only after the real view has been mounted.
export function attachWorkspaceLayoutRegionMotion({ bind, root, regions, state }) {
  const ink = new Map(LAYOUT_REGIONS.map(entry => [entry.side, h("span", { class: "v-map-region-ink", "aria-hidden": "true" })]));
  const targets = Object.fromEntries([...ink].map(([side, node]) => [`region:${side}`, { node, intents: ["content-transition"] }]));
  const pending = new Map();
  let port, released = false, current = Object.fromEntries(LAYOUT_REGIONS.map(entry => [entry.side, !!state[entry.key]]));
  const clear = () => { for (const [side, node] of ink) { node.remove(); regions.get(side).removeAttribute("data-motion-owned"); } };
  for (const [side, node] of ink) regions.get(side).append(node);
  try {
    port = bind({ root, targets, animations: { "content-transition": LAYOUT_REGION_EMPHASIS } });
    if (port == null) { clear(); return null; }
    if (["place", "play", "dispose"].some(key => typeof port[key] !== "function")) throw new TypeError("Invalid layout presentation port");
    for (const [side] of ink) port.place({ intent: "content-transition", target: `region:${side}`, to: { opacity: current[side] ? 1 : 0 } });
  } catch (error) {
    try { port?.dispose?.(); } finally { clear(); }
    throw error;
  }
  return Object.freeze({
    update(next, { immediate = true } = {}) {
      if (released) return;
      for (const entry of LAYOUT_REGIONS) {
        const active = !!next[entry.key];
        if (active === current[entry.side]) continue;
        current[entry.side] = active;
        const token = {}, region = regions.get(entry.side);
        pending.set(entry.side, token);
        if (!immediate) region.dataset.motionOwned = "true";
        else region.removeAttribute("data-motion-owned");
        const playback = port.play({ intent: "content-transition", target: `region:${entry.side}`, to: { opacity: active ? 1 : 0 }, immediate });
        // Only presentation ownership changes here. Accepted business state is
        // already final. Resting endpoints use the original single surface so
        // layered antialiasing cannot change the approved thumbnail's corners.
        const rest = () => {
          if (released || pending.get(entry.side) !== token) return;
          pending.delete(entry.side); region.removeAttribute("data-motion-owned");
        };
        if (typeof playback?.finished?.then !== "function") { rest(); throw new TypeError("Invalid layout presentation playback"); }
        playback.finished.then(rest, rest);
      }
    },
    settle() {
      if (released) return;
      pending.clear();
      for (const [side] of ink) {
        port.place({ intent: "content-transition", target: `region:${side}`, to: { opacity: current[side] ? 1 : 0 } });
        regions.get(side).removeAttribute("data-motion-owned");
      }
    },
    dispose() {
      if (released) return; released = true; pending.clear();
      try { port.dispose(); } finally { clear(); }
    },
  });
}
