import { h } from "./dom.js";
import { graphic } from "./visual-controls.js";
import { LAYOUT_REGIONS } from "./layout-visual-state.js";
import { LAYOUT_TOGGLE_EMPHASIS } from "../features/workspace-layout-motion-recipes.js";

// The switch accepts immediately; its one local layer fades blue surface and
// bright icon together. Button geometry, hit area and input stay unchanged.
export function createWorkspaceLayoutToggleMotion({ buttons, state, onIssue }) {
  let current = state, port = null, visible = true, released = false;
  const doc = buttons.values().next().value.ownerDocument, viewport = doc.defaultView;
  const inks = new Map(), pending = new Map();
  const rest = side => {
    const entry = LAYOUT_REGIONS.find(entry => entry.side === side);
    buttons.get(side).dataset.toggleRest = current[entry.key] ? "open" : "closed";
  };
  function settle() {
    if (!port || released) return;
    pending.clear();
    for (const { side, key } of LAYOUT_REGIONS) {
      port.place({ intent: "content-transition", target: "toggle:" + side, to: { opacity: current[key] ? 1 : 0 } });
      rest(side);
    }
  }
  function detachMotion() {
    const old = port; port = null; pending.clear();
    try { old?.dispose?.(); } finally {
      for (const node of inks.values()) node.remove(); inks.clear();
      for (const button of buttons.values()) { button.removeAttribute("data-toggle-motion"); button.removeAttribute("data-toggle-rest"); }
    }
  }
  const onResize = () => { try { settle(); } catch (error) { onIssue(error); } };
  viewport?.addEventListener("resize", onResize);
  doc.addEventListener("visibilitychange", onResize);
  return Object.freeze({
    update(next, { immediate = true } = {}) {
      if (released) return;
      const previous = current; current = next;
      if (!port) return;
      for (const { side, key } of LAYOUT_REGIONS) {
        if (!!previous[key] === !!next[key]) continue;
        const request = { intent: "content-transition", target: "toggle:" + side, to: { opacity: next[key] ? 1 : 0 } };
        if (immediate || !visible || doc.hidden) { pending.delete(side); port.place(request); rest(side); }
        else {
          const token = {}; pending.set(side, token); buttons.get(side).dataset.toggleRest = "moving";
          const playback = port.play(request);
          if (typeof playback?.finished?.then !== "function") throw new TypeError("Invalid layout toggle playback");
          playback.finished.then(() => {
            if (!released && pending.get(side) === token) { pending.delete(side); rest(side); }
          }, error => { if (!released && pending.get(side) === token) onIssue(error); });
        }
      }
    },
    attachMotion(bind, root) {
      if (released || port) throw new TypeError("Layout toggles already bound or released");
      for (const { side, glyph } of LAYOUT_REGIONS) {
        const ink = h("span", { class: "v-layout-toggle-ink", "aria-hidden": "true" },
          h("span", { class: "v-layout-toggle-surface" }), graphic(glyph, 16));
        inks.set(side, ink); buttons.get(side).append(ink);
      }
      const targets = Object.fromEntries([...inks].map(([side, node]) => ["toggle:" + side, { node, intents: ["content-transition"] }]));
      try {
        port = bind({ root, targets, animations: { "content-transition": LAYOUT_TOGGLE_EMPHASIS } }) ?? null;
        if (!port) { detachMotion(); return; }
        if (["place", "play", "dispose"].some(key => typeof port[key] !== "function")) throw new TypeError("Invalid layout toggle port");
        for (const button of buttons.values()) button.dataset.toggleMotion = "true";
        settle();
      } catch (error) { try { detachMotion(); } catch (cleanupError) { onIssue(cleanupError); } throw error; }
    },
    detachMotion,
    setVisible(next) { visible = next; settle(); },
    dispose() {
      if (released) return;
      try { detachMotion(); } finally {
        released = true; viewport?.removeEventListener("resize", onResize);
        doc.removeEventListener("visibilitychange", onResize);
      }
    },
  });
}
