import { createStaffProjectionPort } from "./staff-read-port.js";
import { normalizeStaffSnapshot } from "./notation-model.js";
import { notifyObservers } from "../runtime/runtime-support.js";

const freeze = value => Object.freeze(value);

function readSessionIdentity(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new TypeError("文档读取结果必须是对象");
  }
  const { documentId, documentVersion, notation } = session;
  if (typeof documentId !== "string" || !documentId
    || !Number.isSafeInteger(documentVersion) || documentVersion < 0) {
    throw new TypeError("文档读取结果缺少有效版本身份");
  }
  if (!notation || !["staff", "unsupported"].includes(notation.kind)) {
    throw new TypeError("文档读取结果不符合原子谱面投影合同");
  }
  if (notation.kind === "unsupported" && (typeof notation.message !== "string" || !notation.message.trim())) {
    throw new TypeError("不支持的谱式需要明确原因");
  }
  return { documentId, documentVersion, notation };
}

/**
 * Adapts the application document session to the backup UI's staff read port.
 * The adapter owns no document state: it only accepts an authoritative session
 * read, rejects stale results, and publishes the session's staff notation.
 */
export function createDocumentStaffProjection({ readSession, subscribe, retrySession } = {}) {
  if (typeof readSession !== "function") throw new TypeError("真实文档投影需要 readSession");
  if (subscribe !== undefined && typeof subscribe !== "function") throw new TypeError("文档投影 subscribe 必须是函数");
  if (retrySession !== undefined && typeof retrySession !== "function") throw new TypeError("文档重读必须是函数");
  const staff = createStaffProjectionPort();
  let identity = null;
  let disposed = false;
  let request = 0;
  let stop = null;
  let started = false;
  let state = freeze({ status: "empty", documentId: null, documentVersion: null });
  const listeners = new Set();

  const publishState = next => {
    state = freeze(next);
    notifyObservers(listeners);
  };
  function observe(listener) {
    if (disposed) throw new Error("文档投影端口已经释放");
    if (typeof listener !== "function") throw new TypeError("文档投影订阅者必须是函数");
    let active = true;
    const deliver = () => { if (active && !disposed) return listener(); };
    listeners.add(deliver);
    return () => { active = false; listeners.delete(deliver); };
  }

  async function refresh() {
    if (disposed) return { ok: false, code: "score.document-projection.disposed" };
    const token = ++request;
    try {
      const session = await readSession();
      if (disposed || token !== request) return { ok: false, code: "score.document-projection.superseded" };
      if (session === null) {
        identity = null;
        staff.publish(null);
        publishState({ status: "empty", documentId: null, documentVersion: null });
        return { ok: true, changed: true };
      }
      const current = readSessionIdentity(session);
      if (identity && current.documentId === identity.documentId && current.documentVersion < identity.documentVersion) {
        return { ok: false, code: "score.document-projection.stale", ...identity };
      }
      // Validate before advancing the accepted document version. Bad notation
      // must not poison the version watermark or replace the previous score.
      const projected = current.notation.kind === "staff"
        ? normalizeStaffSnapshot(current.notation) : null;
      staff.publish(projected);
      identity = freeze({ documentId: current.documentId, documentVersion: current.documentVersion });
      publishState({ status: projected ? "ready" : "unsupported", ...identity,
        ...(projected ? {} : { message: current.notation.message }) });
      return { ok: true, changed: true, status: state.status, ...identity };
    } catch (error) {
      if (disposed || token !== request) return { ok: false, code: "score.document-projection.superseded" };
      const failure = { code: "score.document-projection.read-failed", message: error?.message ?? String(error) };
      publishState({ status: "error", documentId: identity?.documentId ?? null,
        documentVersion: identity?.documentVersion ?? null, ...failure });
      return { ok: false, ...failure };
    }
  }

  function start() {
    if (disposed) return { ok: false, code: "score.document-projection.disposed" };
    if (started) return { ok: true, changed: false };
    if (subscribe) {
      const unsubscribe = subscribe(() => { void refresh(); });
      if (typeof unsubscribe !== "function") throw new TypeError("文档投影 subscribe 必须返回释放函数");
      stop = unsubscribe;
    }
    started = true;
    publishState({ status: "loading", documentId: identity?.documentId ?? null, documentVersion: identity?.documentVersion ?? null });
    void refresh();
    return { ok: true, changed: true };
  }

  return Object.freeze({
    read: freeze({ snapshot: staff.read.snapshot, status: () => state,
      subscribe: listener => observe(() => listener(staff.read.snapshot())), async retry() {
        if (disposed) return { ok: false, code: "score.document-projection.disposed" };
        if (retrySession) { const result = await retrySession(); if (result?.ok === false || subscribe) return result; }
        return refresh();
      } }),
    snapshot: () => state,
    subscribe(listener) {
      return observe(() => listener(state));
    },
    refresh,
    start,
    dispose() {
      if (disposed) return;
      disposed = true;
      request += 1;
      try { stop?.(); }
      finally { stop = null; listeners.clear(); staff.dispose(); }
    },
  });
}
