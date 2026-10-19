import { captureConfig, isRecord } from "../runtime/runtime-support.js";
import { createActionStateReadPort } from "./action-state-read-port.js";
import { createCommandDialog } from "../shell/command-dialog.js";
import { isUnavailable, pathFrom } from "./focus-boundary.js";

const requestKeys = ["title", "message", "command", "payload", "confirmLabel", "cancelLabel"];
const isData = value => value === null || ["string", "boolean"].includes(typeof value)
  || (typeof value === "number" && Number.isFinite(value))
  || (Array.isArray(value) ? value.every(isData) : isRecord(value) && Object.values(value).every(isData));
function captureRequest(raw) {
  if (!isRecord(raw) || Object.keys(raw).some(key => !requestKeys.includes(key))) throw new TypeError("对话框请求字段无效");
  const request = captureConfig(raw, "dialog");
  for (const key of ["title", "message", "command"]) if (typeof request[key] !== "string" || !request[key].trim()) throw new TypeError("对话框需要标题、说明和命令");
  for (const key of ["confirmLabel", "cancelLabel"]) if (request[key] !== undefined && (typeof request[key] !== "string" || !request[key].trim())) throw new TypeError("对话框按钮名称无效");
  const payload = request.payload === undefined ? Object.freeze({}) : request.payload;
  if (!isRecord(payload) || !isData(payload)) throw new TypeError("对话框参数只能包含数据");
  return Object.freeze({ ...request, payload, confirmLabel: request.confirmLabel ?? "确认", cancelLabel: request.cancelLabel ?? "取消" });
}

// Trusted composition root supplies this optional capability; the plugin platform is unchanged.
export function createCommandDialogs({ router, sources = [], fallbackFocus } = {}) {
  let current = null, disposed = false;
  function restoreFocus(owner, anchor) {
    if (disposed || current || document.querySelector("dialog[open]")) return;
    const usable = node => node && node.isConnected !== false && !isUnavailable(pathFrom(node));
    const candidates = owner.visible() && owner.active() && usable(owner.element)
      ? [anchor, ...["button", "input", "select", "textarea", "[tabindex]", "a[href]"].flatMap(selector => [...owner.element.querySelectorAll(selector)])] : [];
    const target = candidates.find(usable) ?? fallbackFocus?.();
    if (usable(target)) target.focus({ preventScroll: true });
  }
  function forComponent({ definition, element, execute, active, visible, notify }) {
    const owner = { definition, element, execute, active, visible, notify };
    const allowed = new Set(definition.permissions?.commands ?? []);
    const actions = createActionStateReadPort({ router, commands: [...allowed],
      context: { componentId: definition.id, owner: definition.owner }, sources });
    let released = false;
    const unavailable = () => released || !active() ? "component.disposed"
      : !visible() || element.isConnected === false || isUnavailable(pathFrom(element)) ? "dialog.owner-unavailable" : null;
    const close = (status, restore = true) => {
      if (current?.owner === owner) current.view?.close({ status, restoreFocus: restore });
    };
    return Object.freeze({
      confirm(raw) {
        if (disposed) return { ok: false, code: "dialog.disposed" };
        const code = unavailable(); if (code) return { ok: false, code };
        let request;
        try { request = captureRequest(raw); } catch { return { ok: false, code: "dialog.invalid-request" }; }
        if (!allowed.has(request.command)) return { ok: false, code: "permission.denied" };
        if (current) return { ok: false, code: "dialog.busy" };
        const state = () => {
          const reason = unavailable();
          return reason ? { id: request.command, enabled: false, keys: [], checked: null, reason }
            : actions.snapshot().actions.find(action => action.id === request.command);
        };
        const initial = state(); if (!initial.enabled) return { ok: false, code: initial.reason };
        const focused = document.activeElement;
        const anchor = element.contains(focused) ? focused : null;
        let resolve;
        const finished = new Promise(done => { resolve = done; });
        const session = { owner, view: null }; current = session;
        try {
          session.view = createCommandDialog(request, {
            state, subscribe: listener => actions.subscribe(listener), notify,
            execute() {
              const latest = state();
              return latest.enabled ? execute(request.command, request.payload) : { ok: false, code: latest.reason };
            },
            onClose(outcome, restore) {
              if (current === session) current = null;
              resolve(Object.freeze(outcome));
              if (restore) restoreFocus(owner, anchor);
            },
          });
          if (disposed || released || !active()) session.view.close({ status: disposed ? "host-disposed" : "owner-disposed", restoreFocus: false });
          else if (!visible()) session.view.close({ status: "owner-hidden" });
          return Object.freeze({ ok: true, finished });
        } catch (error) {
          if (current === session) current = null;
          const failure = { ok: false, code: error?.code ?? "dialog.open-failed" };
          try { notify("对话框暂时无法打开，请重试。", "error"); } catch {}
          restoreFocus(owner, anchor);
          return failure;
        }
      },
      hide: () => close("owner-hidden"),
      dispose({ restoreFocus = true } = {}) { if (released) return; released = true; close("owner-disposed", restoreFocus); },
    });
  }
  return Object.freeze({ forComponent, dispose() {
    if (disposed) return; disposed = true;
    current?.view?.close({ status: "host-disposed", restoreFocus: false });
  } });
}
