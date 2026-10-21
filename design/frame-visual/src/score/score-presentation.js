import { notifyObservers } from "../runtime/runtime-support.js";

export const SCORE_PRESENTATION_COMMAND = "notation.core.presentation.select";
export const SCORE_PRESENTATIONS = Object.freeze([
  Object.freeze({ kind: "staff", label: "五线谱" }),
  Object.freeze({ kind: "tablature", label: "六线谱（Tab）" }),
]);

/** Owns a view preference only. The application owns both accepted projections. */
export function createScorePresentation(score) {
  if (typeof score?.snapshot !== "function" || typeof score?.subscribe !== "function") throw new TypeError("谱式切换需要只读谱面源");
  let kind = "staff", disposed = false;
  const listeners = new Set();
  const notation = selected => score.notation?.(selected)
    ?? (selected === "staff" ? score.snapshot() : { kind: "unsupported", message: "当前宿主或作品未提供弦品谱面" });
  const status = (selected = kind) => {
    if (score.notationStatus) return score.notationStatus(selected);
    const source = score.status?.();
    if (source && ["error", "loading", "empty"].includes(source.status)) return source;
    const value = notation(selected);
    return Object.freeze({ ...source, status: !value ? "empty" : value.kind === "unsupported" ? "unsupported" : "ready",
      ...(value?.kind === "unsupported" ? { message: value.message } : {}) });
  };
  const snapshot = () => {
    const value = notation(kind);
    return value?.kind === "unsupported" ? null : value;
  };
  const changed = () => {
    if (disposed) return;
    if (status(kind).status === "unsupported" && status("staff").status === "ready") kind = "staff";
    notifyObservers(listeners);
  };
  const stop = score.subscribe(changed);
  if (typeof stop !== "function") throw new TypeError("谱式订阅需要释放函数");
  return Object.freeze({
    read: Object.freeze({ snapshot, status, retry: () => disposed
      ? { ok: false, code: "score.presentation.disposed" } : score.retry?.(), subscribe(listener) {
      if (disposed || typeof listener !== "function") throw new TypeError("无效的谱式订阅");
      const deliver = () => listener(snapshot());
      listeners.add(deliver);
      return () => listeners.delete(deliver);
    } }),
    choices: () => SCORE_PRESENTATIONS.map(item => {
      const state = status(item.kind);
      return { ...item, selected: item.kind === kind, enabled: state.status === "ready", message: state.message };
    }),
    select(payload) {
      if (disposed) return { ok: false, code: "score.presentation.disposed" };
      if (!payload || typeof payload !== "object" || Array.isArray(payload)
        || Object.keys(payload).length !== 1 || !SCORE_PRESENTATIONS.some(item => item.kind === payload.kind)) {
        return { ok: false, code: "score.presentation.invalid-payload" };
      }
      const state = status(payload.kind);
      if (state.status !== "ready") return { ok: false, code: "score.presentation.unavailable", message: state.message };
      if (kind === payload.kind) return { ok: true, changed: false };
      kind = payload.kind; changed();
      return { ok: true, changed: true };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { stop(); } finally { listeners.clear(); }
    },
  });
}
