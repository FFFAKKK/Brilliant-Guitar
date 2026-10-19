import { createBackupUiRuntime } from "../host/backup-ui-runtime.js";
import { prepareBackupStartupEntries } from "../host/backup-plugin-assembly.js";
import { assertSynchronousResult, captureConfig, createDisposalScope, isRecord, notifyObservers } from "../runtime/runtime-support.js";
import { createPluginStartupController } from "./plugin-startup-controller.js";
import { readStartupPlan, readStartupPlanAsync } from "./plugin-startup-plan.js";

const failed = (code, message) => Object.freeze({ ok: false, code, message });
const succeeded = extra => Object.freeze({ ok: true, changed: false, ...extra });
const text = error => error?.message ?? String(error);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const owners = new WeakSet();
const validIntent = intent => isRecord(intent)
  && Object.hasOwn({ new: 1, open: 1, recent: 1, continue: 1 }, intent.kind)
  && Object.keys(intent).every(key => ["kind", ...(intent.kind === "new" ? ["input"] : intent.kind === "recent" ? ["recordId"] : [])].includes(key))
  && (intent.kind !== "recent" || typeof intent.recordId === "string");

/** Application lifecycle only: no score copy, alternate platform, or automatic page bootstrap. */
export function createStartupCenterSession({ store, storageMode = "async", createDocumentSession,
  workspaceRoot, showView, startupEntries = [], createWorkspace = createBackupUiRuntime } = {}) {
  if (typeof createDocumentSession !== "function" || typeof createWorkspace !== "function" || typeof showView !== "function" || !workspaceRoot) {
    throw new TypeError("启动协调需要文档工厂、工作区root、同步工作区工厂与showView端口");
  }
  if (owners.has(workspaceRoot)) throw new Error("同一工作区已有启动协调所有者");
  const startup = prepareBackupStartupEntries(startupEntries), scope = createDisposalScope();
  const documents = createDocumentSession({ initialization: "read-existing" });
  assertSynchronousResult(documents, "文档工厂必须同步返回只读源");
  if (!documents || ["read", "reload", "newScore", "open", "openRecent", "snapshot", "subscribeState", "dispose"].some(key => typeof documents[key] !== "function")
    || !documents.recent || ["list", "remove"].some(key => typeof documents.recent[key] !== "function")) {
    if (typeof documents?.dispose === "function") documents.dispose();
    throw new TypeError("启动协调需要完整的原只读文档与最近目录端口");
  }
  scope.add(() => documents.dispose());
  let controller;
  try { controller = createPluginStartupController({ directory: startup.directory, store, storageMode }); }
  catch (error) { scope.dispose(); throw error; }
  scope.add(() => controller.dispose());
  owners.add(workspaceRoot);
  let active = true, busy = false, prepared = false, phase = "preparing", issue = null;
  let runtime = null, runningPlan = null, pendingStart = null, requiresRestart = false, epoch = 0;
  let recentEntries = Object.freeze([]), recentIssue = null, recentLoading = false, recentMutation = false, recentEpoch = 0;
  const listeners = new Set(), notify = () => { if (active) notifyObservers(listeners); };
  const documentState = () => documents.snapshot();
  const unavailable = () => !active ? failed("startup.disposed", "启动中心已释放")
    : requiresRestart ? failed("startup.restart-required", "工作区清理未能确认，请重新启动应用")
      : busy || recentMutation ? failed("startup.busy", "启动或最近记录操作尚未完成") : null;
  const assertCurrent = token => { if (!active || token !== epoch) throw new Error("启动中心已释放"); };
  const identity = () => {
    const value = documentState();
    if (!value.documentId || value.status !== "ready" || value.busy) throw new Error("请先重新读取当前作品");
    return Object.freeze({ documentId: value.documentId, documentVersion: value.documentVersion });
  };
  async function present(mode, token) {
    assertCurrent(token);
    const result = await showView(mode);
    assertCurrent(token);
    if (result !== undefined) throw new TypeError("showView完成后必须返回void");
  }
  function snapshot() {
    return Object.freeze({ phase: active ? phase : "disposed", busy, prepared, issue, requiresRestart,
      hasWorkspace: active && runtime !== null, runningPlan, canContinue: active && prepared && !busy && !recentMutation && !pendingStart && !requiresRestart && documentState().status === "ready" && (!!runtime || controller.snapshot().canStart),
      canRetryStart: active && !!pendingStart && !requiresRestart,
      canChoose: active && prepared && !busy && !recentMutation && !pendingStart && !requiresRestart && documentState().status !== "error" && (!!runtime || controller.snapshot().canStart),
      document: documentState(), recent: Object.freeze({ entries: recentEntries, issue: recentIssue, loading: recentLoading, busy: recentMutation }) });
  }
  try { scope.add(documents.subscribeState(notify)); }
  catch (error) { scope.dispose(); owners.delete(workspaceRoot); throw error; }
  async function refreshRecents() {
    if (!active) return failed("startup.disposed", "启动中心已释放");
    if (recentMutation) return failed("startup.busy", "最近记录操作尚未完成");
    const token = ++recentEpoch; recentLoading = true; notify();
    if (!active) return failed("startup.disposed", "启动中心已释放");
    try {
      const value = await documents.recent.list();
      if (!active || token !== recentEpoch) return failed("startup.superseded", "最近目录读取已过期");
      recentEntries = captureConfig(value.entries); recentIssue = null;
      return succeeded();
    } catch (error) {
      if (!active || token !== recentEpoch) return failed("startup.superseded", "最近目录读取已过期");
      recentIssue = text(error); return failed("startup.recent-unavailable", recentIssue);
    } finally { if (active && token === recentEpoch) { recentLoading = false; notify(); } }
  }
  async function removeRecent(recordId) {
    if (!active) return failed("startup.disposed", "启动中心已释放");
    if (busy || recentMutation) return failed("startup.busy", "启动或最近记录操作尚未完成");
    const token = ++recentEpoch; recentMutation = true; recentLoading = false; notify();
    try {
      if (!active) return failed("startup.disposed", "启动中心已释放");
      const value = await documents.recent.remove(recordId);
      if (!active || token !== recentEpoch) return failed("startup.superseded", "最近目录结果已过期");
      recentEntries = captureConfig(value.entries); recentIssue = null; return succeeded();
    } catch (error) {
      if (!active || token !== recentEpoch) return failed("startup.superseded", "最近目录结果已过期");
      recentIssue = text(error); return failed("startup.recent-unavailable", recentIssue);
    } finally { if (active && token === recentEpoch) { recentMutation = false; notify(); } }
  }
  async function exclusive(operation) {
    const denied = unavailable(); if (denied) return denied;
    busy = true; issue = null; const token = ++epoch; notify();
    try { assertCurrent(token); return await operation(token); }
    catch (error) {
      if (!active || token !== epoch) return failed("startup.disposed", "启动中心已释放");
      if (phase !== "workspace") phase = "welcome";
      issue = text(error);
      return failed(requiresRestart ? "startup.restart-required" : "startup.operation-failed", issue);
    } finally { if (active && token === epoch) { busy = false; notify(); } }
  }
  async function prepare() {
    return exclusive(async token => {
      if (pendingStart || phase === "workspace") throw new Error("请在启动中心继续或重试工作区");
      phase = "preparing"; notify(); assertCurrent(token);
      const loaded = await controller.ready; assertCurrent(token);
      if (!runtime && !loaded.ok && !controller.snapshot().canStart) throw new Error(controller.snapshot().issue || "请重新读取插件配置");
      const value = prepared || documentState().status === "error" ? await documents.reload() : await documents.read();
      assertCurrent(token);
      if (value?.ok === false) throw new Error(value.message);
      prepared = true; phase = "welcome";
      void refreshRecents();
      assertCurrent(token);
      return succeeded();
    });
  }
  async function capturePlan(token) {
    const before = controller.snapshot();
    if (!before.canStart) throw new Error(before.issue || "请先保存或撤销插件配置草稿");
    const plan = storageMode === "async" ? await readStartupPlanAsync(startup.directory, store) : readStartupPlan(startup.directory, store);
    assertCurrent(token);
    const after = controller.snapshot();
    if (!after.canStart || !equal(before.baseline, after.baseline) || !equal(plan, before.baseline)) {
      throw new Error("启动计划已改变，请重新读取配置后再选择作品");
    }
    return plan;
  }
  async function startWorkspace(token) {
    phase = "starting"; notify(); assertCurrent(token);
    if (pendingStart && !equal(identity(), pendingStart.document)) throw new Error("已接受作品已改变，请重新选择作品");
    try {
      await present("workspace", token);
      if (!runtime) {
        assertCurrent(token);
        const created = createWorkspace({ root: workspaceRoot, startupPlan: pendingStart.plan, startupEntries: startup.entries,
          documentSession: documents, documentActions: documents });
        if (typeof created?.then === "function" || typeof created?.dispose !== "function") {
          requiresRestart = true; assertSynchronousResult(created, "工作区工厂必须同步返回实例");
          throw new TypeError("工作区工厂未返回可释放实例");
        }
        runtime = created;
        scope.add(() => { try { return created.dispose(); } finally { runtime = null; runningPlan = null; } });
        assertCurrent(token);
        runningPlan = pendingStart.plan;
      }
      pendingStart = null; phase = "workspace"; return succeeded({ changed: true });
    } catch (error) {
      if (!active || token !== epoch) throw error;
      if (error instanceof AggregateError) requiresRestart = true;
      phase = "welcome";
      try { await present("welcome", token); }
      catch (restorationError) {
        if (!active || token !== epoch) throw restorationError;
        requiresRestart = true;
        throw new AggregateError([error, restorationError], "工作区启动及欢迎窗口恢复失败，请重新启动应用");
      }
      throw error;
    }
  }
  async function enter(intent) {
    if (!validIntent(intent)) return failed("startup.invalid-intent", "启动意图无效");
    try { intent = captureConfig(intent); }
    catch { return failed("startup.invalid-intent", "启动意图必须是可捕获的普通数据"); }
    return exclusive(async token => {
      if (!prepared || documentState().status === "error") throw new Error("请先完成作品读取或显式重试");
      if (phase === "workspace") throw new Error("请先返回启动中心");
      if (pendingStart) throw new Error("作品已接受，请重试工作区启动");
      const plan = runtime ? runningPlan : await capturePlan(token);
      assertCurrent(token); phase = "selecting"; notify(); assertCurrent(token);
      let result;
      switch (intent.kind) {
        case "new": result = await documents.newScore(intent.input); break;
        case "open": result = await documents.open(); break;
        case "recent": result = await documents.openRecent(intent.recordId); break;
        case "continue": identity(); result = succeeded(); break;
      }
      assertCurrent(token); phase = "welcome";
      if (!result.ok) { issue = result.message; return result; }
      if (result.cancelled) return result;
      pendingStart = Object.freeze({ plan, document: identity() });
      if (intent.kind !== "continue") void refreshRecents();
      assertCurrent(token);
      return startWorkspace(token);
    });
  }
  function retryStart() {
    return exclusive(async token => {
      if (!pendingStart) throw new Error("没有可重试的工作区启动");
      return startWorkspace(token);
    });
  }
  function returnToWelcome() {
    return exclusive(async token => {
      if (!runtime || phase !== "workspace") throw new Error("当前没有可返回的工作区");
      await present("welcome", token); phase = "welcome";
      void refreshRecents(); return succeeded();
    });
  }
  const ready = prepare();
  return Object.freeze({ controller, ready, snapshot, prepare, enter, retryStart, returnToWelcome, refreshRecents, removeRecent,
    subscribe(listener) {
      if (!active) throw new Error("启动中心已释放");
      if (typeof listener !== "function") throw new TypeError("启动中心订阅者必须是函数");
      const deliver = () => { if (active) return listener(); };
      listeners.add(deliver); return () => { listeners.delete(deliver); };
    },
    dispose() {
      if (!active) return; active = false; epoch++; recentEpoch++; busy = recentLoading = recentMutation = false;
      listeners.clear(); scope.dispose(); owners.delete(workspaceRoot);
    },
  });
}
