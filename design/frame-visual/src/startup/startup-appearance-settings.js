import { captureConfig, isRecord, notifyObservers } from "../runtime/runtime-support.js";

export const DEFAULT_STARTUP_APPEARANCE = Object.freeze({ format: 1, revision: 0, density: "compact", fontSize: 13 });
export function validateStartupAppearance(value) {
  if (!isRecord(value) || Object.keys(value).length !== 4 || !["format", "revision", "density", "fontSize"].every(key => Object.hasOwn(value, key))
    || value.format !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !["compact", "comfortable"].includes(value.density) || ![12, 13, 14].includes(value.fontSize)) {
    throw new Error("不支持或损坏的启动中心外观设置");
  }
  return captureConfig(value);
}

/** Owns welcome appearance only; document/plugin startup cannot depend on it. */
export function createStartupAppearanceSettings({ store }) {
  if (!store || typeof store.read !== "function" || typeof store.write !== "function") throw new TypeError("外观设置需要read/write端口");
  let active = true, loaded = false, stored = false, phase = "ready", issue = "", conflict = false, epoch = 0;
  let baseline = DEFAULT_STARTUP_APPEARANCE, value = baseline;
  const listeners = new Set(), notify = () => { if (active) notifyObservers(listeners); };
  const dirty = () => value.density !== baseline.density || value.fontSize !== baseline.fontSize;
  const denied = () => !active ? { ok: false, code: "appearance.disposed", message: "外观设置已释放" }
    : phase !== "ready" ? { ok: false, code: "appearance.busy", message: "请等待外观设置操作完成" } : null;
  const current = token => active && token === epoch;
  async function operate(kind, operation) {
    const refusal = denied(); if (refusal) return refusal;
    const token = ++epoch; phase = kind; issue = ""; conflict = false; notify();
    try {
      if (!current(token)) return { ok: false, code: "appearance.disposed", message: "外观设置已释放" };
      const accepted = await operation(token);
      if (!current(token)) return { ok: false, code: "appearance.disposed", message: "外观设置已释放" };
      baseline = value = accepted.value; stored = accepted.stored; loaded = true; return { ok: true };
    } catch (error) {
      if (!current(token)) return { ok: false, code: "appearance.disposed", message: "外观设置已释放" };
      issue = error?.message ?? String(error); conflict = error?.code === "appearance.conflict";
      return { ok: false, code: error?.code ?? "appearance.failed", message: issue };
    } finally { if (current(token)) { phase = "ready"; notify(); } }
  }
  function reload() {
    return operate("loading", async () => {
      const raw = await store.read();
      return { value: validateStartupAppearance(raw ?? DEFAULT_STARTUP_APPEARANCE), stored: raw != null };
    });
  }
  function save() {
    return operate("saving", async token => {
      const accepted = validateStartupAppearance({ ...value, revision: baseline.revision + 1 });
      await store.write(accepted, { expectedRevision: baseline.revision, isCurrent: () => current(token) });
      return { value: accepted, stored: true };
    });
  }
  function set(patch) {
    const refusal = denied(); if (refusal) return Promise.resolve(refusal);
    if (!loaded) return Promise.resolve({ ok: false, code: "appearance.not-loaded", message: "请先重新读取外观设置" });
    try {
      if (!isRecord(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => ["density", "fontSize"].includes(key))) throw new Error("外观设置字段无效");
      value = validateStartupAppearance({ ...value, ...patch });
    } catch (error) { return Promise.resolve({ ok: false, code: "appearance.invalid", message: error.message }); }
    if (dirty()) return save();
    // Matching an old baseline cannot establish what a conflicting disk revision contains.
    if (conflict) { notify(); return Promise.resolve({ ok: false, code: "appearance.conflict", message: issue }); }
    issue = ""; conflict = false; notify(); return Promise.resolve({ ok: true });
  }
  const ready = reload();
  return Object.freeze({ ready, set, reload,
    retry() { return !loaded || conflict ? reload() : dirty() ? save() : Promise.resolve({ ok: true }); },
    snapshot: () => Object.freeze({ value, phase: active ? phase : "disposed", issue, loaded, dirty: dirty(),
      persisted: stored && !dirty() && !conflict, canEdit: active && loaded && phase === "ready", canRetry: active && !!issue && phase === "ready",
      retryKind: !loaded || conflict ? "reload" : "save" }),
    subscribe(listener) {
      if (!active || typeof listener !== "function") throw new TypeError("外观设置订阅不可用");
      const deliver = () => { if (active) return listener(); };
      listeners.add(deliver); return () => listeners.delete(deliver);
    },
    dispose() { active = false; epoch++; listeners.clear(); },
  });
}
