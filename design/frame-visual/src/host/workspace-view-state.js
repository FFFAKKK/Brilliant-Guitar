import { notifyObservers } from "../runtime/runtime-support.js";
import { WORKSPACE_ZOOM_MIN, WORKSPACE_ZOOM_MAX } from "../contracts/workspace-layout.js";
export { WORKSPACE_ZOOM_MIN, WORKSPACE_ZOOM_MAX, WORKSPACE_ZOOM_STEP, isWorkspaceZoomValue } from "../contracts/workspace-layout.js";

const invalid = code => ({ ok: false, code: `view.${code}` });

function normalize(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(WORKSPACE_ZOOM_MAX, Math.max(WORKSPACE_ZOOM_MIN, value)) * 10) / 10;
}

export function createWorkspaceViewState({ initialZoom = 100, onObserverError } = {}) {
  const accepted = normalize(initialZoom);
  if (accepted == null) throw new TypeError("工作区缩放值必须是有限数字");
  let disposed = false;
  let snapshot = Object.freeze({ zoom: accepted });
  const listeners = new Set();

  function publish(zoom) {
    if (snapshot.zoom === zoom) return { ok: true, changed: false };
    snapshot = Object.freeze({ zoom });
    notifyObservers([...listeners].map(listener => () => listener(snapshot)), onObserverError);
    return { ok: true, changed: true };
  }

  const read = Object.freeze({
    snapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("视图状态订阅者必须是函数");
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });

  return Object.freeze({
    read,
    setZoom(value) {
      if (disposed) return invalid("disposed");
      const accepted = normalize(value);
      if (accepted == null) return invalid("invalid-zoom");
      return publish(accepted);
    },
    adjustZoom(delta) {
      if (disposed) return invalid("disposed");
      if (typeof delta !== "number" || !Number.isFinite(delta)) return invalid("invalid-delta");
      return publish(normalize(snapshot.zoom + delta));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
  });
}
