// Host-owned document identity. The frame shows it; no component owns it.
export const SAVE_STATES = ["saved", "dirty", "saving", "failed"];

export function createDocumentIdentity(initial = { title: "未命名乐谱", save: "saved" }) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      if (patch.save && !SAVE_STATES.includes(patch.save)) throw new Error(`unknown save state ${patch.save}`);
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
