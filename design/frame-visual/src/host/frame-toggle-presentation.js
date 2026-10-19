import { h } from "../shell/dom.js";
import { graphic } from "../shell/visual-controls.js";
import { LAYOUT_TOGGLE_EMPHASIS } from "../features/workspace-layout-motion-recipes.js";
import { captureAnimationContribution } from "../contracts/animation.js";

const declaration = Object.freeze({ owner: "frame.builtin", id: "frame.builtin.control-presentation",
  permissions: Object.freeze({ animations: Object.freeze(["content-transition"]) }),
  animations: captureAnimationContribution({ contractVersion: 1, definitions: { "content-transition": LAYOUT_TOGGLE_EMPHASIS } }),
});

// Each persistent frame button owns one bounded scope and the same author recipe.
// No component node, command, input, or hit area is duplicated or rebound.
export function createFrameTogglePresentation({ controls, service }) {
  const records = new Map(); let released = false;
  const request = (name, open) => ({ intent: "content-transition", target: "control:" + name, to: { opacity: open ? 1 : 0 } });
  const rest = r => { r.feedback.dataset.frameToggleRest = r.open ? "open" : "closed"; };
  const dispose = () => {
    if (released) return; released = true;
    const errors = [];
    for (const r of records.values()) {
      try { r.component?.dispose(); } catch (error) { errors.push(error); } finally {
        r.token = null; r.ink.remove(); r.feedback.removeAttribute("data-frame-toggle"); r.feedback.removeAttribute("data-frame-toggle-rest");
      }
    }
    if (errors.length) throw new AggregateError(errors, "Frame control cleanup failed");
  };
  try {
    for (const [name, control] of controls) {
      const icon = graphic(control.glyph), ink = h("span", { class: "v-frame-toggle-ink", "aria-hidden": "true" },
        control.surface === false ? null : h("span", { class: "v-frame-toggle-surface" }), icon,
        control.label ? h("span", {}, control.label) : null,
        control.button.classList.contains("v-rail-button") ? h("span", { class: "v-frame-toggle-edge" }) : null);
      const feedback = control.feedbackTarget ?? control.button;
      if (feedback !== control.button && !control.button.contains(feedback)) throw new TypeError("Frame feedback must stay inside its control");
      feedback.append(ink);
      const r = { ...control, feedback, ink, icon, glyph: control.glyph, open: null, token: null, component: null, port: null };
      records.set(name, r);
      r.component = service.forComponent(declaration, r.button);
      r.port = r.component.bind({ ["control:" + name]: { node: r.ink, intents: ["content-transition"] } });
    }
    for (const r of records.values()) r.feedback.dataset.frameToggle = "true";
    return Object.freeze({
      update(state, { immediate = true, profile = "continuous" } = {}) {
        if (released) return;
        for (const [name, r] of records) {
          r.component.setProfile(Object.hasOwn(LAYOUT_TOGGLE_EMPHASIS.variants, profile) ? profile : "continuous");
          const open = !!r.accepted(state), first = r.open === null, changed = r.open !== open;
          const glyph = r.nextGlyph?.(state) ?? r.glyph;
          if (glyph !== r.glyph) { r.glyph = glyph; r.icon.replaceChildren(graphic(glyph).firstChild); }
          r.open = open;
          if (first || immediate) { r.token = null; r.port.place(request(name, open)); rest(r); }
          else if (changed) {
            const token = {}; r.token = token; r.feedback.dataset.frameToggleRest = "moving";
            const playback = r.port.play(request(name, open));
            playback.finished.then(() => { if (!released && r.token === token) { r.token = null; rest(r); } });
            if (r.ink.style.opacity === String(Number(open))) { r.token = null; rest(r); }
          }
        }
      },
      dispose,
    });
  } catch (error) { dispose(); throw error; }
}
