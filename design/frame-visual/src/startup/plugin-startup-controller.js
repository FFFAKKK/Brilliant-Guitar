import { captureConfig } from "../runtime/runtime-support.js";
import { defaultStartupPlan, readStartupPlan, readStartupPlanAsync, validateSetting, validateStartupPlan } from "./plugin-startup-plan.js";

const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const message = error => error instanceof Error ? error.message : String(error);

/** One draft owner for synchronous preview and asynchronous host storage. Never owns a platform. */
export function createPluginStartupController({ directory, store, storageMode = "sync" } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.write !== "function") throw new TypeError("启动管理需要 read/write 存储端口");
  if (!["sync", "async"].includes(storageMode)) throw new TypeError("storageMode 必须是 sync 或 async");
  let baseline = defaultStartupPlan(directory), draft = copy(baseline), issue = "", loadIssue = "", saved = false;
  let phase = "ready", epoch = 0;
  const invalid = new Map();
  const refusal = () => phase === "disposed" ? { ok: false, code: "startup.disposed", error: "启动管理已释放" }
    : phase !== "ready" ? { ok: false, code: "startup.busy", error: "请等待配置操作完成" } : null;
  const current = token => phase !== "disposed" && token === epoch;
  const plugin = id => {
    const item = directory.find(entry => entry.id === id);
    if (!item) throw new Error(`未知插件 ${id}`);
    return item;
  };
  function acceptLoad(next, token) {
    if (!current(token)) return refusal();
    baseline = next; draft = copy(next); invalid.clear(); issue = loadIssue = ""; saved = false; phase = "ready";
    return { ok: true };
  }
  function failLoad(error, token) {
    if (!current(token)) return refusal();
    loadIssue = message(error); issue = loadIssue; phase = "ready";
    return { ok: false, error: loadIssue };
  }
  function reload() {
    const denied = refusal(); if (denied) return denied;
    phase = "loading"; const token = ++epoch;
    if (storageMode === "async") return (async () => {
      try { return acceptLoad(await readStartupPlanAsync(directory, store), token); }
      catch (error) { return failLoad(error, token); }
    })();
    try { return acceptLoad(readStartupPlan(directory, store), token); }
    catch (error) { return failLoad(error, token); }
  }
  function planError() {
    try { validateStartupPlan(directory, draft); return ""; }
    catch (error) { return message(error); }
  }
  function snapshot() {
    const dirtyIds = directory.filter(item => !equal(draft.plugins[item.id], baseline.plugins[item.id])
      || item.fields.some(field => invalid.has(`${item.id}:${field.key}`))).map(item => item.id);
    const validationError = planError(), idle = phase === "ready";
    return captureConfig({ draft, baseline, dirtyIds, invalid: Object.fromEntries(invalid), issue: issue || validationError,
      phase, saved, canEdit: idle,
      canSave: idle && dirtyIds.length > 0 && !loadIssue && !invalid.size && !validationError,
      canStart: idle && !loadIssue && !dirtyIds.length && !validationError,
      canReload: idle && !!issue });
  }
  function prepareSave(actual) {
    if (!equal(actual, baseline)) throw new Error("配置已在其他页面改变，重新读取将撤销当前草稿");
    return validateStartupPlan(directory, { ...draft, revision: baseline.revision + 1 });
  }
  function acceptSave(next, token) {
    if (!current(token)) return refusal();
    baseline = next; draft = copy(next); saved = true; issue = ""; phase = "ready";
    return { ok: true, revision: next.revision };
  }
  function failSave(error, token) {
    if (!current(token)) return refusal();
    issue = `保存失败：${message(error)}`; phase = "ready";
    return { ok: false, error: issue };
  }
  function save() {
    const denied = refusal(); if (denied) return denied;
    if (!snapshot().canSave) return { ok: false, error: loadIssue || planError() || "请先修正参数" };
    phase = "saving"; const token = ++epoch;
    const options = Object.freeze({ expectedRevision: baseline.revision });
    if (storageMode === "async") return (async () => {
      try {
        const actual = await readStartupPlanAsync(directory, store);
        if (!current(token)) return refusal();
        const next = prepareSave(actual);
        // Storage may wait behind another namespace write; check ownership again at dispatch.
        const result = await store.write(next, Object.freeze({ ...options, isCurrent: () => current(token) }));
        if (result !== undefined) throw new Error("启动管理 write() 完成后需要返回 void");
        return acceptSave(next, token);
      } catch (error) { return failSave(error, token); }
    })();
    try {
      const next = prepareSave(readStartupPlan(directory, store));
      const result = store.write(next, options);
      if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => undefined);
      if (result !== undefined) throw new Error("同步 write() 需要返回 void；Promise 端口请使用 async 模式");
      return acceptSave(next, token);
    } catch (error) { return failSave(error, token); }
  }
  const ready = Promise.resolve(reload());
  return Object.freeze({
    directory, snapshot, reload, save, ready,
    dispose() { if (phase !== "disposed") { phase = "disposed"; epoch++; } },
    setEnabled(id, enabled) {
      const denied = refusal(); if (denied) return denied;
      const item = plugin(id);
      if (typeof enabled !== "boolean") throw new TypeError("enabled 必须是布尔值");
      if (item.required && !enabled) return { ok: false, error: `${item.name} 为必需插件，不能停用` };
      draft.plugins[id].enabled = enabled; issue = loadIssue; saved = false;
      return { ok: true };
    },
    setSetting(id, key, raw) {
      const denied = refusal(); if (denied) return denied;
      const field = plugin(id).fields.find(item => item.key === key);
      if (!field) throw new Error(`未知参数 ${id}.${key}`);
      const errorKey = `${id}:${key}`;
      try {
        if (field.type === "number" && (typeof raw !== "number" && (typeof raw !== "string" || !raw.trim()))) throw new Error(`${field.label}：请输入整数`);
        const value = validateSetting(field, field.type === "number" ? Number(raw) : raw);
        draft.plugins[id].settings[key] = value; invalid.delete(errorKey); issue = loadIssue; saved = false;
        return { ok: true };
      } catch (error) {
        invalid.set(errorKey, { raw: String(raw), message: message(error) }); issue = loadIssue; saved = false;
        return { ok: false, error: message(error) };
      }
    },
    discard() {
      const denied = refusal(); if (denied) return denied;
      draft = copy(baseline); invalid.clear(); issue = loadIssue; saved = false; return { ok: true };
    },
  });
}
