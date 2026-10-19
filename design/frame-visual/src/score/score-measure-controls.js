import { METER_DENOMINATORS } from "../vendor/score-interaction.js";
import { SCORE_MEASURE_COMMANDS as M } from "../contracts/score-measure.js";
import { icon } from "../fixtures/preview-icons.js";
import { captureFocusRecovery, isReservedKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";

/** Persistent numeric presentation of the current measure; the input owner holds the target. */
export function createScoreMeasureControls({ element, input, execute, focusScore }) {
  const document = element.ownerDocument, group = document.createElement("div"), removers = [];
  group.className = "score-measure-controls"; group.setAttribute("role", "group"); group.setAttribute("aria-label", "小节与拍号");
  let disposed = false, visible = true, shown = null, scope = "measure", editing = null;
  const current = () => !disposed && visible && !isUnavailable(pathFrom(element)) ? input.snapshot().measure : null;
  function listen(node, type, callback) { node.addEventListener(type, callback); removers.push(() => node.removeEventListener(type, callback)); }
  function send(change, target = shown) {
    const value = current();
    if (!value || value.disabled || !target || target.measureId !== value.measureId
      || target.sourceRevision !== value.sourceRevision || target.selectionRevision !== value.selectionRevision) return;
    return execute(M.edit, { measureId: target.measureId, sourceRevision: target.sourceRevision,
      selectionRevision: target.selectionRevision, change });
  }
  function button(label, graphic, change) {
    const node = document.createElement("button"); node.type = "button"; node.title = label; node.setAttribute("aria-label", label);
    node.innerHTML = icon(graphic); group.append(node); listen(node, "click", () => { if (!node.disabled && change) send(change); }); return node;
  }
  const before = button("在当前小节前插入空小节", "measureBefore", { kind: "insert", position: "before" });
  const after = button("在当前小节后插入空小节", "measureAfter", { kind: "insert", position: "after" });
  const remove = button("删除当前小节及其内容（可撤销）", "measureRemove", { kind: "remove" });
  const numerator = document.createElement("input"); numerator.type = "number"; numerator.min = "1"; numerator.max = "32"; numerator.step = "1";
  numerator.title = "拍号分子"; numerator.setAttribute("aria-label", "拍号分子"); numerator.dataset.measureProperty = "numerator"; group.append(numerator);
  const slash = document.createElement("span"); slash.textContent = "/"; slash.setAttribute("aria-hidden", "true"); group.append(slash);
  const denominator = document.createElement("select"); denominator.title = "拍号分母"; denominator.setAttribute("aria-label", "拍号分母");
  denominator.dataset.measureProperty = "denominator";
  for (const value of METER_DENOMINATORS) { const option = document.createElement("option"); option.value = String(value); option.textContent = String(value); denominator.append(option); }
  group.append(denominator);
  const run = button("只修改当前小节；切换为连续相同拍号", "meterRun", null); run.dataset.measureProperty = "scope";
  // This button changes the scope of the next edit, rather than submitting a music command.
  listen(run, "click", () => { if (run.disabled) return; scope = scope === "measure" ? "meter-run" : "measure"; refresh(); });
  for (const node of [numerator, denominator]) {
    // Keep the original target through typing/selection; same-version relocation cannot retarget a draft.
    listen(node, "focus", () => { editing = { target: current(), node }; });
    listen(node, "change", () => changeMeter(node));
    listen(node, "blur", () => { editing = null; refresh(); });
  }
  function changeMeter(node) {
    const value = current();
    if (editing && (editing.invalid || !value || editing.target?.measureId !== value.measureId
      || editing.target?.sourceRevision !== value.sourceRevision || editing.target?.selectionRevision !== value.selectionRevision)) {
      editing.invalid = true; refresh(); return;
    }
    const target = editing?.node === node ? editing.target : shown;
    if (!node.disabled && !editing?.invalid) send({ kind: "meter", meter: { numerator: Number(numerator.value), denominator: Number(denominator.value) }, scope }, target);
    editing = null; refresh();
  }
  function refresh() {
    if (disposed) return;
    const recover = captureFocusRecovery(group), value = current(); shown = value;
    const disabled = !value || value.disabled;
    before.disabled = after.disabled = run.disabled = disabled; remove.disabled = disabled || !value.canRemove;
    remove.title = value && !value.canRemove ? "至少保留一个小节" : "删除当前小节及其内容（可撤销）";
    const budget = scope === "meter-run" && value?.meterRunCount > 100;
    numerator.disabled = denominator.disabled = disabled || budget;
    if (!editing || editing.target?.measureId !== value?.measureId || editing.target?.sourceRevision !== value?.sourceRevision
      || editing.target?.selectionRevision !== value?.selectionRevision || disabled) {
      if (editing) editing.invalid = true;
      numerator.value = value ? String(value.meter.numerator) : ""; denominator.value = value ? String(value.meter.denominator) : "4";
    }
    run.setAttribute("aria-pressed", String(scope === "meter-run"));
    run.title = budget ? "连续范围超过单次 100 小节上限；切换回本小节"
      : scope === "meter-run" ? `将修改从当前起连续 ${value?.meterRunCount ?? 0} 个同拍号小节` : "只修改当前小节；切换为连续相同拍号";
    run.setAttribute("aria-label", run.title);
    group.setAttribute("aria-busy", String(input.snapshot().pending));
    if (visible && !isUnavailable(pathFrom(element))) recover(disabled ? element : group);
  }
  listen(group, "keydown", event => {
    if (!visible || isReservedKey(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { editing = null; refresh(); event.preventDefault(); event.stopPropagation(); focusScore(); }
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation();
      if (event.target === numerator || event.target === denominator) changeMeter(event.target); focusScore(); }
  });
  element.append(group); const stop = input.subscribe(refresh); refresh();
  return Object.freeze({ element: group, refresh,
    setVisible(value) { visible = value === true; if (!visible) editing = null; refresh(); },
    dispose() { if (disposed) return; disposed = true; stop(); for (const remove of removers) remove(); group.remove(); shown = null; editing = null; },
  });
}
