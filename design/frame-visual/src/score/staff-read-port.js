import { normalizeStaffSnapshot } from "./notation-model.js";
import { notifyObservers } from "../runtime/runtime-support.js";

function normalize(snapshot) {
  return snapshot === null ? null : normalizeStaffSnapshot(snapshot);
}

/**
 * Application-owned read projection for the core staff view.
 *
 * The UI receives only the frozen read port. `publish` and `dispose` remain
 * with the owner that projects the real score document.
 */
export function createStaffProjectionPort({ snapshot = null } = {}) {
  let current = normalize(snapshot);
  let disposed = false;
  const listeners = new Set();

  const read = Object.freeze({
    snapshot: () => current,
    subscribe(listener) {
      if (disposed) throw new Error("谱面投影端口已经释放");
      if (typeof listener !== "function") throw new TypeError("谱面投影订阅者必须是函数");
      listeners.add(listener);
      let active = true;
      return () => { if (active) { active = false; listeners.delete(listener); } };
    },
  });

  function publish(snapshot) {
    if (disposed) return { ok: false, code: "score.projection.disposed" };
    current = normalize(snapshot);
    const accepted = current;
    notifyObservers([...listeners].map(listener => () => listener(accepted)));
    return { ok: true };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    current = null;
  }

  return Object.freeze({ read, publish, dispose });
}
