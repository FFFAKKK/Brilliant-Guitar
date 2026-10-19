// One bubbling entry, after native fields and local DOM listeners. All actions use the existing router.
import { comboOf } from "../runtime/shortcut-keys.js";
import { allowsHostKey, keyPath } from "./focus-boundary.js";

export function bindKeyboard(router, { root = document, components, fallback,
  isMac = globalThis.navigator?.platform?.includes("Mac") ?? false, onError = () => {} } = {}) {
  const ownerDocument = root.ownerDocument ?? root;
  let active = true;
  const observeResult = result => {
    if (result?.then) Promise.resolve(result).catch(error => { try { onError(error); } catch {} });
  };
  const onKey = event => {
    if (!active || !allowsHostKey(event, { root, document: ownerDocument })) return;
    const path = keyPath(event), context = components?.focusContext(path) ?? {};
    const combo = (isMac ? event.ctrlKey : event.metaKey) ? "" : comboOf(event, isMac);
    const local = router.shortcuts.resolve(combo, context, { localOnly: true });
    if (local) {
      event.preventDefault();
      try { observeResult(components.executeShortcut(local, path)); }
      catch (error) { try { onError(error); } catch {} }
      return;
    }
    if (components?.handleKeyDown(event, keyPath(event))) {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented || event.cancelBubble) return;
    // Do not alias the other platform's modifier or AltGraph to a registered Mod shortcut.
    if (isMac ? event.ctrlKey : event.metaKey) return;
    const id = router.shortcuts.resolve(combo)?.command;
    try {
      if (!id) { fallback?.(event); return; }
      if (!router.describe(id)?.enabled()) return;
      event.preventDefault();
      observeResult(router.execute(id));
    } catch (error) {
      event.preventDefault();
      try { onError(error); } catch {}
    }
  };
  ownerDocument.addEventListener("keydown", onKey);
  return () => {
    if (!active) return;
    active = false;
    ownerDocument.removeEventListener("keydown", onKey);
  };
}
