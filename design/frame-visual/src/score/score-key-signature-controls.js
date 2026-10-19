import { KEY_SIGNATURE_FIFTHS, MUSIC_SYMBOLS } from "../vendor/score-interaction.js";
import { SCORE_KEY_SIGNATURE_COMMAND } from "../contracts/score-key-signature.js";
import { icon } from "../fixtures/preview-icons.js";
import { captureFocusRecovery, isReservedKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";
import { createScoreMusicGlyph } from "./score-music-glyph.js";

const sameTarget = (a, b) => !!a && !!b && ["partId", "measureId", "sourceRevision", "selectionRevision"].every(key => a[key] === b[key]);
const labelFor = fifths => fifths === 0 ? "自然调" : `${Math.abs(fifths)} 个${fifths < 0 ? "降" : "升"}号`;

/** Only a field draft lives here. Accepted key state comes from the original input read port. */
export function createScoreKeySignatureControls({ element, input, execute, focusScore }) {
  const document = element.ownerDocument, group = document.createElement("div"), removers = [];
  group.className = "score-key-signature-controls"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "调号");
  let disposed = false, visible = true, shown = null, editing = null;
  const current = () => !disposed && visible && !isUnavailable(pathFrom(element)) ? input.snapshot().keySignature : null;
  function listen(node, type, callback) { node.addEventListener(type, callback); removers.push(() => node.removeEventListener(type, callback)); }
  const sign = document.createElement("span"), glyph = createScoreMusicGlyph(sign); group.append(sign);
  const select = document.createElement("select"); select.dataset.keySignature = "fifths"; select.setAttribute("aria-label", "调号升降数量");
  for (const fifths of KEY_SIGNATURE_FIFTHS) {
    const option = document.createElement("option"); option.value = String(fifths);
    option.textContent = fifths === 0 ? "♮" : `${Math.abs(fifths)}${fifths < 0 ? "♭" : "♯"}`; select.append(option);
  }
  group.append(select);
  const inherit = document.createElement("button"); inherit.type = "button"; inherit.dataset.keySignature = "inherit";
  inherit.innerHTML = icon("undo"); group.append(inherit);
  function send(change, target) {
    const value = current();
    if (!value || value.disabled || !sameTarget(target, value)) return;
    return execute(SCORE_KEY_SIGNATURE_COMMAND, { partId: target.partId, measureId: target.measureId,
      sourceRevision: target.sourceRevision, selectionRevision: target.selectionRevision, change });
  }
  function change() {
    if (editing && (editing.invalid || !sameTarget(editing.target, current()))) {
      editing.invalid = true; refresh(); return;
    }
    const target = editing ? editing.target : shown;
    if (!select.disabled && !editing?.invalid && select.value !== "") send({ kind: "set", fifths: Number(select.value) }, target);
    editing = null; refresh();
  }
  function refresh() {
    if (disposed) return;
    const recover = captureFocusRecovery(group), value = current(), disabled = !value || value.disabled;
    shown = value; select.disabled = disabled; inherit.disabled = disabled || !value.changed;
    if (!editing || !sameTarget(editing.target, value) || disabled) {
      if (editing) editing.invalid = true;
      select.value = value ? String(value.fifths) : "0";
    }
    const fifths = value?.fifths ?? 0, symbol = fifths < 0 ? "flat" : fifths > 0 ? "sharp" : "natural";
    glyph.set(MUSIC_SYMBOLS[symbol], fifths < 0 ? "♭" : fifths > 0 ? "♯" : "♮");
    select.title = value ? `${labelFor(fifths)}；${value.changed ? "本小节设置" : "继承前文"}。修改不会转调已有音符` : "先选择谱面位置";
    inherit.title = value?.changed ? `取消本小节调号，继承${labelFor(value.previousFifths)}` : "本小节已继承调号";
    inherit.setAttribute("aria-label", inherit.title);
    group.dataset.keySignatureExplicit = String(value?.changed === true);
    group.setAttribute("aria-busy", String(input.snapshot().pending));
    if (visible && !isUnavailable(pathFrom(element))) recover(disabled ? element : group);
  }
  listen(select, "focus", () => { editing = { target: current(), invalid: false }; });
  listen(select, "change", change);
  listen(select, "blur", () => { editing = null; refresh(); });
  listen(inherit, "click", () => { if (!inherit.disabled) send({ kind: "inherit" }, shown); });
  listen(group, "keydown", event => {
    if (!visible || disposed || isReservedKey(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { editing = null; refresh(); event.preventDefault(); event.stopPropagation(); focusScore(); }
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (event.target === select) change(); focusScore(); }
  });
  element.append(group); const stop = input.subscribe(refresh); refresh();
  return Object.freeze({ element: group, refresh,
    setVisible(value) { visible = value === true; if (!visible) editing = null; refresh(); },
    dispose() { if (disposed) return; disposed = true; stop(); for (const remove of removers) remove(); glyph.dispose(); group.remove(); shown = null; editing = null; },
  });
}
