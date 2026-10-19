// Focus is derived from the event path and live DOM, never from a second active-component store.
export function pathFrom(node) {
  const path = [];
  for (let current = node; current; current = current.parentNode ?? current.host) path.push(current);
  return path;
}

export function keyPath(event) {
  const path = event.composedPath?.() ?? [];
  return path.length ? path : pathFrom(event.target);
}

export function isUnavailable(path) {
  return path.some(node => node.hidden || node.inert || node.disabled || node.getAttribute?.("aria-hidden") === "true");
}

function isField(path) {
  let editableResolved = false;
  for (const node of path) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)) return true;
    if (!editableResolved) {
      const editable = node.getAttribute?.("contenteditable");
      if (editable != null) {
        const value = editable.toLowerCase();
        if (["", "true", "plaintext-only"].includes(value)) return true;
        if (value === "false") editableResolved = true;
      }
    }
  }
  return false;
}

const TRANSIENT_SELECTORS = [".popover", '[role="dialog"]', '[role="alertdialog"]', '[role="menu"]', "dialog[open]"];
function isTransient(node) {
  return TRANSIENT_SELECTORS.some(selector => node.matches?.(selector));
}

function isOpenSurface(node) {
  if (node.tagName === "DIALOG" && !node.open) return false;
  if (isUnavailable(pathFrom(node))) return false;
  // Markup-only test environments have no browser geometry.
  return !node.getClientRects || node.getClientRects().length > 0;
}

export function isReservedKey(event) {
  return event.defaultPrevented || event.cancelBubble || event.isComposing || event.keyCode === 229
    || ["Dead", "Process", "Unidentified"].includes(event.key) || event.getModifierState?.("AltGraph");
}

export function isPlainKey(event) {
  return !isReservedKey(event) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export function allowsHostKey(event, { root, document = root.ownerDocument ?? root } = {}) {
  if (isReservedKey(event)) return false;
  const path = keyPath(event);
  if (!path.includes(root) || isUnavailable(path) || isField(path) || path.some(isTransient)) return false;
  // Body portals and modal surfaces also reserve keys while focus is outside them.
  return !TRANSIENT_SELECTORS.some(selector => [...(document.querySelectorAll?.(selector) ?? [])].some(isOpenSurface));
}

// Capture ownership before a render can detach the focused cell. The closure is used once after it.
export function captureFocusRecovery(root) {
  const previous = root.ownerDocument.activeElement;
  const owned = previous && pathFrom(previous).includes(root);
  return fallback => {
    if (!owned) return;
    const current = root.ownerDocument.activeElement;
    // Respect a plugin that deliberately moved focus to another live control during render.
    if (current !== previous && current && current !== root.ownerDocument.body
      && !isUnavailable(pathFrom(current)) && current.isConnected !== false) return;
    if (!pathFrom(previous).includes(root) || isUnavailable(pathFrom(previous))) fallback?.focus({ preventScroll: true });
    else if (current !== previous) previous.focus({ preventScroll: true });
  };
}
