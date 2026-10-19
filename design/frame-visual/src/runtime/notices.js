// Global notices: structured, bounded, no DOM.
import { notifyObservers } from "./runtime-support.js";
const LIMIT = 50;

export function createNotices() {
  let entries = [];
  let unread = 0;
  let serial = 0;
  const listeners = new Set();
  const changed = latest => {
    const state = { entries, unread, latest };
    notifyObservers([...listeners].map(listener => () => listener(state)));
  };
  return {
    push({ level = "info", text, source = "host" }) {
      const entry = { id: ++serial, level, text, source, at: Date.now() };
      entries = [entry, ...entries].slice(0, LIMIT);
      unread += 1;
      changed(entry);
      return entry;
    },
    markRead() { if (unread) { unread = 0; changed(null); } },
    clear() { entries = []; unread = 0; changed(null); },
    state: () => ({ entries, unread }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
