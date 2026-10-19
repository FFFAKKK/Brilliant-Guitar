import { documentMetadataKey, validateDocumentMetadataFields } from "../vendor/score-interaction.js";
import { SCORE_DOCUMENT_METADATA_COMMAND } from "../contracts/score-document-metadata.js";
import { icon } from "../fixtures/preview-icons.js";
import { captureFocusRecovery, isReservedKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";

/** Only a revision-bound form draft. Accepted metadata belongs to the document session. */
export function createScoreMetadataControls({ element, toolbar, input, execute, focusScore }) {
  const document = element.ownerDocument, removers = [];
  let disposed = false, visible = true, baseline = null, invalid = false, submitted = null, composing = false;
  const current = () => !disposed && visible && !isUnavailable(pathFrom(element)) ? input.snapshot().metadata : null;
  function listen(node, type, callback) {
    node.addEventListener(type, callback); removers.push(() => node.removeEventListener(type, callback));
  }
  function button(name, graphic, parent) {
    const node = document.createElement("button"); node.type = "button";
    node.title = name; node.setAttribute("aria-label", name); node.innerHTML = icon(graphic); parent.append(node); return node;
  }
  const toggle = button("作品信息", "page", toolbar); toggle.dataset.metadata = "toggle";
  toggle.setAttribute("aria-expanded", "false");
  const panel = document.createElement("form"); panel.className = "score-metadata-editor";
  panel.setAttribute("aria-label", "作品信息"); panel.noValidate = true; panel.hidden = true;
  function field(name, key, tag, tooltip) {
    const label = document.createElement("label"), node = document.createElement(tag);
    label.textContent = name; node.dataset.metadata = key; node.title = tooltip ?? name; node.setAttribute("aria-label", node.title);
    node.autocomplete = "off"; if (tag === "textarea") node.rows = 2;
    label.append(node); panel.append(label); return node;
  }
  const title = field("标题", "title", "input"), authors = field("作者", "authors", "textarea", "作者（每行一位，可留空）");
  const tempo = field("速度", "tempo", "input", "速度（BPM）"); tempo.type = "number"; tempo.step = "any"; tempo.min = "0";
  const tools = document.createElement("div"); tools.className = "score-metadata-actions"; panel.append(tools);
  const apply = button("应用作品信息", "check", tools), cancel = button("取消", "close", tools); apply.type = "submit";
  apply.dataset.metadata = "apply"; cancel.dataset.metadata = "cancel";
  const feedback = document.createElement("span"); feedback.className = "score-metadata-feedback";
  feedback.setAttribute("role", "status"); panel.append(feedback); element.append(panel);
  const same = (a, b) => a && b && a.documentId === b.documentId && a.documentVersion === b.documentVersion && a.sourceRevision === b.sourceRevision;
  function clearErrors() {
    feedback.textContent = "";
    for (const node of [title, authors, tempo]) node.setAttribute("aria-invalid", "false");
  }
  function close(returnFocus = true) {
    panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); baseline = null; submitted = null; invalid = false; composing = false;
    if (returnFocus && visible && !disposed && !isUnavailable(pathFrom(element))) toggle.focus({ preventScroll: true });
  }
  function open() {
    const value = current(); if (!value || value.disabled || disposed) return;
    baseline = value; invalid = false; submitted = null; clearErrors();
    title.value = value.title; authors.value = value.authors.join("\n"); tempo.value = String(value.tempoBpm);
    panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); refresh(); title.focus({ preventScroll: true });
  }
  function refresh() {
    if (disposed) return;
    const value = current(), state = input.snapshot();
    toggle.disabled = !value || value.disabled;
    if (panel.hidden) return;
    if (submitted && !state.pending) {
      if (value?.documentId === baseline?.documentId && value.documentVersion > baseline.documentVersion
        && documentMetadataKey(value) === submitted) { close(false); focusScore(); return; }
      submitted = null; invalid = true; feedback.textContent = state.message ?? "作品已改变，请关闭后重新打开";
    }
    if (!submitted && !same(baseline, value)) {
      invalid = true; feedback.textContent = "作品已改变，请关闭后重新打开";
    }
    const recover = captureFocusRecovery(panel), disabled = invalid || !!submitted || !value || value.disabled;
    for (const node of [title, authors, tempo, apply]) node.disabled = disabled;
    panel.setAttribute("aria-busy", String(!!submitted)); cancel.disabled = false;
    if (visible && !isUnavailable(pathFrom(element))) recover(disabled ? cancel : panel);
  }
  function submit() {
    const value = current();
    if (disposed || panel.hidden || composing || invalid || submitted || !value || value.disabled) return;
    if (!same(baseline, value)) { invalid = true; refresh(); return; }
    const checked = validateDocumentMetadataFields(title.value, authors.value, tempo.value);
    clearErrors();
    for (const [name, node] of [["title", title], ["authors", authors], ["tempo", tempo]]) {
      node.setAttribute("aria-invalid", String(!!checked.errors[name]));
    }
    if (!checked.value) {
      feedback.textContent = Object.values(checked.errors)[0];
      if (checked.errors.title) title.focus(); else if (checked.errors.authors) authors.focus(); else tempo.focus();
      return;
    }
    submitted = documentMetadataKey(checked.value);
    const result = execute(SCORE_DOCUMENT_METADATA_COMMAND, { documentId: baseline.documentId,
      documentVersion: baseline.documentVersion, sourceRevision: baseline.sourceRevision, metadata: checked.value });
    if (disposed) return;
    if (!result?.ok) {
      submitted = null; feedback.textContent = result?.code === "score.input.stale"
        ? "作品已改变，请关闭后重新打开" : "当前无法修改，请稍后重试"; refresh(); return;
    }
    if (result.changed === false) { close(false); focusScore(); return; }
    refresh();
  }
  listen(toggle, "click", () => { if (!toggle.disabled) { if (panel.hidden) open(); else close(); } });
  listen(toggle, "keydown", event => {
    if (!isReservedKey(event) && !event.ctrlKey && !event.metaKey && !event.altKey
      && ["Enter", " "].includes(event.key)) event.stopPropagation();
  });
  listen(cancel, "click", () => close());
  listen(panel, "submit", event => { event.preventDefault(); submit(); });
  listen(panel, "keydown", event => {
    if (isReservedKey(event) || composing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === "Enter" && event.target !== authors && event.target !== cancel) {
      event.preventDefault(); event.stopPropagation(); submit();
    }
  });
  // Programmatic submit is guarded as well as the keyboard's composition check.
  listen(panel, "compositionstart", () => { composing = true; });
  listen(panel, "compositionend", () => { composing = false; });
  const stop = input.subscribe(refresh); refresh();
  return Object.freeze({
    refresh,
    setVisible(value) { visible = value === true; if (!visible) close(false); refresh(); },
    dispose() { if (disposed) return; disposed = true; stop(); for (const remove of removers) remove(); panel.remove(); toggle.remove(); baseline = null; submitted = null; },
  });
}
