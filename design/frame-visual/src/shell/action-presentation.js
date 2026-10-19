// Pure control updates. Permissions and execution still belong to ctx and the existing router.
const denied = Object.freeze({ enabled: false, keys: Object.freeze([]), checked: null, reason: "permission.denied" });
const messages = {
  "permission.denied": "当前组件没有执行该操作的权限。",
  "command.missing": "该操作当前不可用。",
  "command.disabled": "该操作当前不可用。",
  "command.state-error": "该操作的状态读取失败，请重试。",
};
export const actionState = (snapshot, id) => snapshot ? snapshot.actions.find(action => action.id === id) ?? denied : null;
export const actionReason = state => messages[state?.reason] ?? "该操作当前不可用。";

export function applyActionPresentation(node, snapshot, id, { disabled = false, hint = "", checkedAttribute } = {}) {
  const state = actionState(snapshot, id);
  node.disabled = disabled || state?.enabled === false;
  if (!snapshot) return; // Keep historical standalone markup and behavior when no port is supplied.
  const isMac = globalThis.navigator?.platform?.includes("Mac") ?? false;
  const keys = state.keys ?? [], keyHint = keys[0]?.replace(/^Mod(?=\+)/, isMac ? "⌘" : "Ctrl");
  const text = !disabled && state.enabled === false ? actionReason(state) : hint;
  node.title = text + (keyHint ? " · " + keyHint : "");
  if (node.getAttribute("data-tooltip") !== null) node.setAttribute("data-tooltip", node.title);
  if (keys.length) node.setAttribute("aria-keyshortcuts", keys.map(key => key.replace(/^Mod(?=\+)/, isMac ? "Meta" : "Control")).join(" "));
  else node.removeAttribute("aria-keyshortcuts");
  if (checkedAttribute) {
    if (state.checked === null) node.removeAttribute(checkedAttribute);
    else node.setAttribute(checkedAttribute, String(state.checked));
  }
}
