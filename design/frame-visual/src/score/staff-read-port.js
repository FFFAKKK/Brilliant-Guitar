import { normalizeNotationPair } from "./notation-model.js";
import { notifyObservers } from "../runtime/runtime-support.js";

/**
 * Application-owned read projection for the core staff view.
 *
 * The UI receives only the frozen read port. `publish` and `dispose` remain
 * with the owner that projects the real score document.
 */
export function createStaffProjectionPort({ snapshot = null, tablature = undefined } = {}) {
  let current = normalizeNotationPair(snapshot, tablature);
  let disposed = false;
  const listeners = new Set();

  const read = Object.freeze({
    snapshot: () => current.notation,
    notation(kind) {
      if (kind === "staff") return current.notation;
      if (kind === "tablature") return current.tablature ?? Object.freeze({
        kind: "unsupported", message: "当前宿主或作品未提供弦品谱面",
      });
      throw new TypeError("未知谱式");
    },
    subscribe(listener) {
      if (disposed) throw new Error("谱面投影端口已经释放");
      if (typeof listener !== "function") throw new TypeError("谱面投影订阅者必须是函数");
      listeners.add(listener);
      let active = true;
      return () => { if (active) { active = false; listeners.delete(listener); } };
    },
  });

  function publish(snapshot, tablature = undefined) {
    if (disposed) return { ok: false, code: "score.projection.disposed" };
    current = normalizeNotationPair(snapshot, tablature);
    const accepted = current.notation;
    notifyObservers([...listeners].map(listener => () => listener(accepted)));
    return { ok: true };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    current = { notation: null, tablature: undefined };
  }

  return Object.freeze({ read, publish, dispose });
}
