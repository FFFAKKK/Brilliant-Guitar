import { h } from "./dom.js";
import { visualButton } from "./visual-controls.js";
import { applyActionPresentation, actionReason } from "./action-presentation.js";
import { closePopover } from "./popover.js";
import { isPlainKey } from "../host/focus-boundary.js";
import { createDisposalScope } from "../runtime/runtime-support.js";

let serial = 0;
// Native modality owns Tab and background inertness; this renderer owns its nodes and listeners.
export function createCommandDialog(request, binding) {
  const scope = createDisposalScope(), id = "frame-dialog-" + ++serial;
  let closed = false, pending = false, dispatched = false;
  const title = h("h2", { id: id + "-title" }, request.title);
  const message = h("p", { id: id + "-message" }, request.message);
  const feedback = h("p", { class: "v-command-dialog-feedback", role: "status", "aria-live": "polite", hidden: true });
  const cancel = visualButton(request.cancelLabel, null, () => close({ status: pending ? "dismissed" : "cancelled" }), { "data-dialog-action": "cancel" });
  const confirm = visualButton(request.confirmLabel, null, activate, { className: "primary", "data-dialog-action": "confirm" });
  const dialog = h("dialog", { class: "v-modal v-command-dialog", role: "dialog", "aria-modal": "true", tabindex: -1,
    "aria-labelledby": title.id, "aria-describedby": message.id }, title, message, feedback,
    h("div", { class: "v-modal-actions" }, cancel, confirm));
  if (typeof dialog.showModal !== "function" || typeof dialog.close !== "function") {
    const error = new Error("需要原生模态对话框支持"); error.code = "dialog.unsupported"; throw error;
  }
  function report(text) {
    if (closed) return;
    feedback.hidden = false; feedback.textContent = text;
    try { binding.notify(text, "error"); } catch {}
  }
  function sync() {
    if (closed) return;
    const state = binding.state();
    applyActionPresentation(confirm, { actions: [{ ...state, keys: [] }] }, request.command, { disabled: pending, hint: request.confirmLabel });
    dialog.setAttribute("aria-busy", String(pending));
    cancel.querySelector("span").textContent = pending ? "关闭" : request.cancelLabel;
    cancel.setAttribute("aria-label", pending ? "关闭" : request.cancelLabel);
    if (document.activeElement === confirm && confirm.disabled) cancel.focus({ preventScroll: true });
  }
  function close({ status = "cancelled", restoreFocus = true, result } = {}) {
    if (closed) return;
    closed = true;
    try { scope.dispose(); } catch { /* cleanup continues before resolving the owner */ }
    try { if (dialog.open) dialog.close(); }
    finally { dialog.remove(); binding.onClose({ status, dispatched, ...(result ? { result } : {}) }, restoreFocus); }
  }
  function activate() {
    if (closed || pending) return;
    const state = binding.state();
    if (!state.enabled) { sync(); report(actionReason(state)); return; }
    pending = true; sync();
    feedback.hidden = false; feedback.textContent = "正在执行，关闭窗口不会撤回操作。";
    const finish = result => {
      if (closed) return;
      pending = false;
      if (result?.ok) close({ status: "confirmed", result });
      else { sync(); report(result?.code?.startsWith("command.") || result?.code === "permission.denied" ? actionReason({ reason: result.code }) : "操作失败，请重试。"); }
    };
    try {
      dispatched = true;
      const result = binding.execute();
      if (result?.then) Promise.resolve(result).then(finish, () => { if (!closed) { pending = false; sync(); report("操作失败，请重试。"); } });
      else finish(result);
    } catch { if (!closed) { pending = false; sync(); report("操作失败，请重试。"); } }
  }
  const listen = (type, handler) => { dialog.addEventListener(type, handler); scope.add(() => dialog.removeEventListener(type, handler)); };
  try {
    listen("keydown", event => {
      if (event.key !== "Escape") return;
      // Prevent the browser's cancel default during composition or modified Escape as well.
      const plain = isPlainKey(event); event.preventDefault();
      if (plain) { event.stopPropagation(); close({ status: pending ? "dismissed" : "cancelled" }); }
    });
    listen("cancel", event => { event.preventDefault(); close({ status: pending ? "dismissed" : "cancelled" }); });
    listen("close", () => close({ status: "external-close" }));
    // A supported native modal replaces the existing transient menu before receiving focus.
    closePopover({ restoreFocus: false });
    document.body.append(dialog);
    sync(); scope.add(binding.subscribe(sync));
    dialog.showModal();
    cancel.focus({ preventScroll: true });
    return Object.freeze({ close });
  } catch (error) { close({ status: "open-failed", restoreFocus: false }); throw error; }
}
