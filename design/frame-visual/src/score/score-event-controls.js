import { DURATION_NAMES, durationSymbol, MUSIC_SYMBOLS, PITCH_STEPS, stepNoteDuration, toggleNoteDot } from "../vendor/score-interaction.js";
import { SCORE_INPUT_CHANGE_COMMAND, SCORE_INPUT_TOOL_COMMAND } from "../contracts/score-note-input.js";
import { SCORE_CLIPBOARD_COMMANDS as K } from "../contracts/score-clipboard.js";
import { icon } from "../fixtures/preview-icons.js";
import { captureFocusRecovery, isReservedKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";
import { createScoreMusicGlyph } from "./score-music-glyph.js";
import { createScoreMeasureControls } from "./score-measure-controls.js";
import { createScoreKeySignatureControls } from "./score-key-signature-controls.js";
import { createScoreStaffClefControls } from "./score-staff-clef-controls.js";
import { createScoreMetadataControls } from "./score-metadata-controls.js";

/** A persistent core-owned presentation; no score, selection or accepted properties are stored here. */
export function createScoreEventControls({ element, input, execute, focusScore, measures = false, keySignatures = false, staffClefs = false, metadata = false }) {
  const document = element.ownerDocument, bar = document.createElement("div"), removers = [], glyphs = [];
  bar.className = "score-event-controls"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "音符工具");
  let disposed = false, visible = true, shown = null;
  const current = () => {
    if (disposed || !visible || isUnavailable(pathFrom(element))) return null;
    const state = input.snapshot(); return state.selected ?? state.tool;
  };
  function send(change) {
    const value = current();
    if (!value || value.disabled || !shown || value.eventId !== shown.eventId || value.sourceRevision !== shown.sourceRevision
      || value.selectionRevision !== shown.selectionRevision) return;
    const result = value.overview.source === "selection"
      ? execute(SCORE_INPUT_CHANGE_COMMAND, { eventId: shown.eventId, sourceRevision: shown.sourceRevision, change })
      : execute(SCORE_INPUT_TOOL_COMMAND, { sourceRevision: shown.sourceRevision, selectionRevision: shown.selectionRevision, change });
    if (result?.ok) focusScore();
    return result;
  }
  function listen(node, type, callback) {
    node.addEventListener(type, callback); removers.push(() => node.removeEventListener(type, callback));
  }
  function button(name, action, graphic) {
    const node = document.createElement("button"); node.type = "button";
    node.title = name; node.setAttribute("aria-label", name); bar.append(node);
    listen(node, "click", () => { if (!node.disabled) action(); });
    if (graphic) node.innerHTML = icon(graphic);
    return node;
  }
  function glyph(node) {
    const span = document.createElement("span"); node.append(span);
    const value = createScoreMusicGlyph(span); glyphs.push(value); return value;
  }
  const sourceDisplay = document.createElement("span"); sourceDisplay.className = "score-input-source";
  sourceDisplay.setAttribute("role", "img"); bar.append(sourceDisplay);
  const clipboardButtons = Object.entries(K).map(([method, command], index) => {
    const node = button(["复制（Ctrl+C）", "剪切（Ctrl+X）", "粘贴（Ctrl+V）"][index], () => {
      if (!visible || disposed || isUnavailable(pathFrom(element))) return;
      const state = input.snapshot(); if (!state.clipboard[method]) return;
      execute(command); focusScore();
    }, method);
    node.dataset.clipboard = method; return [method, node];
  });
  const longer = button("延长时值（−）", () => {
    const value = current(); if (value) send({ kind: "duration", value: stepNoteDuration(value.overview.duration, -1, value.overview.source === "selection" && value.overview.rest) });
  }, "minimize"); longer.dataset.property = "longer";
  const durationDisplay = document.createElement("span"); durationDisplay.className = "score-property-duration";
  durationDisplay.setAttribute("role", "img"); bar.append(durationDisplay); const durationGlyph = glyph(durationDisplay);
  const shorter = button("缩短时值（＋）", () => {
    const value = current(); if (value) send({ kind: "duration", value: stepNoteDuration(value.overview.duration, 1, value.overview.source === "selection" && value.overview.rest) });
  }, "plus"); shorter.dataset.property = "shorter";
  function field(name, key, values) {
    const node = document.createElement("select"); node.title = name; node.setAttribute("aria-label", name); node.dataset.property = key;
    for (const value of ["", ...values]) {
      const option = document.createElement("option"); option.value = String(value); option.textContent = value === "" ? "—" : String(value); node.append(option);
    }
    listen(node, "change", () => {
      const value = current();
      if (!node.disabled && value?.overview.source === "selection" && value.overview.pitch && values.map(String).includes(node.value)) {
        send({ kind: "pitch", value: { ...value.overview.pitch, [key]: key === "octave" ? Number(node.value) : node.value } });
      }
      refresh();
    });
    bar.append(node); return node;
  }
  const step = field("音名", "step", PITCH_STEPS), octave = field("组号", "octave", [2, 3, 4, 5, 6]);
  const dot = button("附点（.）", () => { const value = current(); if (value) send({ kind: "duration", value: toggleNoteDot(value.overview.duration) }); });
  dot.dataset.property = "dot"; glyph(dot).set(MUSIC_SYMBOLS.dot, "·");
  const restButton = button("休止符工具：双击空拍输入；R直接输入", () => {
    const value = current(); if (value) send({ kind: "rest", value: !value.overview.rest });
  });
  restButton.dataset.property = "rest"; glyph(restButton).set(durationSymbol({ base: 4, dots: 0 }, true), "R");
  const accidentals = ["flat", "natural", "sharp"].map((value, index) => {
    const node = button(["降号", "还原号", "升号"][index], () => {
      const selected = current(); if (selected) send({ kind: "accidental", value: selected.overview.accidental === value ? "none" : value });
    });
    node.dataset.property = value; glyph(node).set(MUSIC_SYMBOLS[value], ["b", "n", "#"][index]); return [value, node];
  });
  function refresh() {
    if (disposed) return;
    const recover = captureFocusRecovery(bar), value = current(), overview = value?.overview;
    shown = value; const disabled = !value || value.disabled;
    bar.dataset.inputSource = overview?.source ?? "unavailable";
    const context = overview?.source === "selection" ? "当前选中事件" : "接下来的音符";
    sourceDisplay.innerHTML = icon(overview?.source === "selection" ? "select" : "pencil");
    sourceDisplay.title = context; sourceDisplay.setAttribute("aria-label", context);
    bar.setAttribute("aria-busy", String(input.snapshot().pending));
    for (const [method, node] of clipboardButtons) node.disabled = !visible || !input.snapshot().clipboard[method];
    step.disabled = octave.disabled = disabled || overview?.source !== "selection" || !overview?.pitch;
    step.value = overview?.pitch?.step ?? ""; octave.value = String(overview?.pitch?.octave ?? "");
    longer.disabled = disabled || overview.duration.base === 1;
    const next = overview ? stepNoteDuration(overview.duration, 1, overview.source === "selection" && overview.rest) : null;
    shorter.disabled = disabled || next.base === overview.duration.base;
    dot.disabled = disabled || overview.duration.base === 32; dot.setAttribute("aria-pressed", String(overview?.duration.dots === 1));
    restButton.disabled = disabled || (overview?.source === "selection" && overview.rest);
    restButton.setAttribute("aria-pressed", String(overview?.rest === true));
    restButton.title = overview?.source === "selection" ? "改为等时值休止符，保留后续拍位" : "休止符工具：双击空拍输入；R直接输入";
    restButton.setAttribute("aria-label", restButton.title);
    for (const [name, node] of accidentals) {
      node.disabled = disabled || overview?.rest || (overview?.source === "selection" && !overview.pitch);
      node.setAttribute("aria-pressed", String(!overview?.rest && overview?.accidental === name));
      node.title = `${({ flat: "降号", natural: "还原号", sharp: "升号" })[name]}：用于${context}`;
    }
    const duration = overview?.duration ?? input.snapshot().duration;
    durationGlyph.set(durationSymbol(duration, overview?.rest ?? false) + (duration.dots ? MUSIC_SYMBOLS.dot : ""), `1/${duration.base}${duration.dots ? "·" : ""}`);
    const label = overview ? `${context}：${duration.dots ? "附点" : ""}${DURATION_NAMES[duration.base]}${overview.rest ? "休止符" : "音符"}` : "先定位谱面";
    durationDisplay.title = label; durationDisplay.setAttribute("aria-label", label);
    if (visible && !isUnavailable(pathFrom(element))) recover(disabled ? element : bar);
  }
  listen(bar, "keydown", event => {
    if (isReservedKey(event) || event.ctrlKey || event.metaKey || event.altKey || !visible) return;
    if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); event.stopPropagation(); focusScore(); }
  });
  const measureControls = measures ? createScoreMeasureControls({ element: bar, input, execute, focusScore }) : null;
  const keyControls = keySignatures ? createScoreKeySignatureControls({ element: bar, input, execute, focusScore }) : null;
  const clefControls = staffClefs ? createScoreStaffClefControls({ element: bar, input, execute, focusScore }) : null;
  element.append(bar);
  const metadataControls = metadata ? createScoreMetadataControls({ element, toolbar: bar, input, execute, focusScore }) : null;
  const stop = input.subscribe(refresh); refresh(); measureControls?.refresh();
  return Object.freeze({ element: bar, refresh,
    setVisible(value) { visible = value; refresh(); measureControls?.setVisible(value); keyControls?.setVisible(value); clefControls?.setVisible(value); metadataControls?.setVisible(value); },
    dispose() {
      if (disposed) return; disposed = true;
      stop(); measureControls?.dispose(); keyControls?.dispose(); clefControls?.dispose(); metadataControls?.dispose(); for (const remove of removers) remove(); for (const value of glyphs) value.dispose(); bar.remove(); shown = null;
    },
  });
}
