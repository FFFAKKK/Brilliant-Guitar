// Owns the current layout and its persistence. Storage is injected so tests need no browser.
import { defaultLayout, sanitizeLayout } from "./layout-model.js";

const STORAGE_KEY = "brilliant.frame.layout";

export function createLayoutStore({ components, storage, onIssues = () => {} }) {
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"); } catch { saved = "invalid"; }
  const { layout: initial, issues } = sanitizeLayout(saved, components());
  let layout = initial;
  const listeners = new Set();
  if (issues.length) queueMicrotask(() => onIssues(issues));

  function commit(next) {
    if (next === layout) return;
    layout = next;
    storage?.setItem(STORAGE_KEY, JSON.stringify(layout));
    listeners.forEach((listener) => listener(layout));
  }

  return {
    get: () => layout,
    update: (transform) => commit(transform(layout)),
    reset: () => commit(defaultLayout(components())),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
