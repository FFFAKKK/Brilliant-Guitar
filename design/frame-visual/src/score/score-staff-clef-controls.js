import { STAFF_CLEFS } from "../vendor/score-interaction.js";
import { SCORE_STAFF_CLEF_COMMAND } from "../contracts/score-staff-clef.js";
import { captureFocusRecovery, isReservedKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";
import { createScoreClefGlyph } from "./score-clef-glyph.js";

const names = { treble: "高音谱号", bass: "低音谱号", alto: "中音谱号", tenor: "次中音谱号" };
const sameTarget = (a, b) => !!a && !!b && ["staffId", "sourceRevision", "selectionRevision"].every(key => a[key] === b[key]);

export function createScoreStaffClefControls({ element, input, execute, focusScore }) {
  const document = element.ownerDocument, group = document.createElement("div"), removers = [], glyphs = [];
  group.className = "score-staff-clef-controls"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "谱表谱号");
  let disposed = false, visible = true, shown = null;
  const current = () => !disposed && visible && !isUnavailable(pathFrom(element)) ? input.snapshot().staffClef : null;
  function listen(node, type, callback) { node.addEventListener(type, callback); removers.push(() => node.removeEventListener(type, callback)); }
  const buttons = STAFF_CLEFS.map(clef => {
    const button = document.createElement("button"); button.type = "button"; button.dataset.staffClef = clef;
    button.title = `${names[clef]}；作用于整个谱表，保持音符音高`; button.setAttribute("aria-label", names[clef]);
    const graphic = document.createElement("span"); button.append(graphic); group.append(button);
    glyphs.push(createScoreClefGlyph(graphic, clef));
    listen(button, "click", () => {
      const value = current();
      if (button.disabled || value?.disabled || !sameTarget(shown, value)) return;
      execute(SCORE_STAFF_CLEF_COMMAND, { staffId: shown.staffId, sourceRevision: shown.sourceRevision,
        selectionRevision: shown.selectionRevision, clef });
      focusScore();
    });
    return [clef, button];
  });
  function refresh() {
    if (disposed) return;
    const recover = captureFocusRecovery(group), value = current();
    shown = value;
    for (const [clef, button] of buttons) {
      button.disabled = !value || value.disabled;
      button.setAttribute("aria-pressed", String(value?.clef === clef));
    }
    group.setAttribute("aria-busy", String(input.snapshot().pending));
    if (visible && !isUnavailable(pathFrom(element))) recover(value && !value.disabled ? group : element);
  }
  listen(group, "keydown", event => {
    if (!visible || disposed || isReservedKey(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); focusScore(); }
  });
  element.append(group); const stop = input.subscribe(refresh); refresh();
  return Object.freeze({ element: group, refresh,
    setVisible(value) { visible = value === true; refresh(); },
    dispose() { if (disposed) return; disposed = true; stop(); for (const remove of removers) remove(); for (const glyph of glyphs) glyph.dispose(); group.remove(); shown = null; },
  });
}
