import type { NewScoreInput } from "../contracts/new-score.ts";
import { validateNewScoreInput } from "../contracts/new-score.ts";
import type { ScoreSessionRead } from "../contracts/score-session.ts";
import { isScoreSessionRead } from "../contracts/score-session.ts";
import { hasUnsavedDocument, checkpointMatches, fileStem, reconcileSavedSession } from "./document-file.ts";
import type { SavedFileCheckpoint } from "./document-file.ts";
import { readOrCreateInitialScore } from "./initial-score.ts";
import { notifyObservers } from "../ui/notify-observers.ts";
import type { DocumentReplacementPrecondition } from "../contracts/document-replacement.ts";
import type { WorkbenchNativeFileResult } from "./workbench-client.ts";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { RecentDocumentsSnapshotV1 } from "../contracts/recent-documents.ts";
import { isRecentRecordId } from "../contracts/recent-documents.ts";
import { isScoreEditRequest } from "../contracts/note-input.ts";
import type { ScoreEditRequest } from "../contracts/note-input.ts";
import { equalEventProperties } from "../contracts/note-input.ts";
import { equalMeter, measureMeterTargets } from "../../../../shared/notation/measure-edit.ts";
import { keySignatureChangeIsNoOp } from "../../../../shared/notation/key-signature.ts";
import { documentMetadataKey } from "../contracts/document-metadata.ts";
import type { ScoreDocumentMetadataProjection } from "../contracts/score-session.ts";
import { isFrettedPosition } from "../../../../shared/notation/tablature-model.ts";

interface ReadonlyDocumentClient {
  edit?(input: ScoreEditRequest): Promise<ScoreSessionRead>;
  read(): Promise<ScoreSessionRead | null>;
  create(input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<ScoreSessionRead>;
  createGuarded(input: NewScoreInput, requestId: string, expected: DocumentReplacementPrecondition): Promise<ScoreSessionRead>;
  openNativeDocumentGuarded(expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult | null>;
  openRecentDocumentGuarded?(recordId: string, expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult>;
  listRecentDocuments?(): Promise<RecentDocumentsSnapshotV1>;
  removeRecentDocument?(recordId: string): Promise<RecentDocumentsSnapshotV1>;
  recordCurrentFile?(expected: DocumentReplacementPrecondition): Promise<RecentDocumentsSnapshotV1>;
  saveNativeDocumentGuarded?(suggestedName: string, saveAs: boolean, expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult | null>;
  usesNativeFiles(): boolean;
}
export interface ReadonlyDocumentState {
  readonly status: "empty" | "loading" | "ready" | "error" | "disposed";
  readonly busy: boolean;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly title: string;
  readonly dirty: boolean;
  readonly saved: boolean;
  readonly measureCount: number;
  readonly tempoBpm: number | null;
  readonly metadata: ScoreDocumentMetadataProjection | null;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly message: string | null;
  readonly warnings: readonly WorkbenchIssue[];
}
type Result = { readonly ok: true; readonly changed: boolean; readonly cancelled?: true }
  | { readonly ok: false; readonly code: string; readonly message: string };
export type ReadonlyDocumentInitialization = "ensure-document" | "read-existing";

/** Application read model only. The Rust session remains the music/file authority. */
export function createReadonlyScoreDocumentSession({ client, createId = () => crypto.randomUUID(), initialization = "ensure-document" }: {
  client: ReadonlyDocumentClient; createId?: () => string; initialization?: ReadonlyDocumentInitialization;
}) {
  if (initialization !== "ensure-document" && initialization !== "read-existing") throw new TypeError("initialization 必须是 ensure-document 或 read-existing");
  let current: ScoreSessionRead | null | undefined;
  let checkpoint: SavedFileCheckpoint | null = null;
  let failure: Error | null = null;
  let warnings: readonly WorkbenchIssue[] = Object.freeze([]);
  let busy = false, disposed = false, epoch = 0;
  let initial: Promise<ScoreSessionRead | null> | null = null;
  const initialId = createId();
  const readListeners = new Set<() => void>(), stateListeners = new Set<() => void>();
  const notify = notifyObservers;
  function subscribe(listeners: Set<() => void>, listener: () => void) {
    if (disposed) throw new Error("作品会话已释放");
    if (typeof listener !== "function") throw new TypeError("作品订阅者必须是函数");
    const deliver = () => { if (!disposed) return listener(); };
    listeners.add(deliver);
    return () => { listeners.delete(deliver); };
  }
  const dirty = () => hasUnsavedDocument(current ?? null, checkpoint) || Boolean(current && !checkpointMatches(current, checkpoint)
    && (current.notation.kind === "unsupported" || current.notation.measures.some(measure => measure.events.length > 0)));
  const snapshot = (): ReadonlyDocumentState => Object.freeze({
    status: disposed ? "disposed" : failure ? "error" : busy ? "loading" : current ? "ready" : "empty",
    busy, documentId: current?.documentId ?? null, documentVersion: current?.documentVersion ?? null,
    title: current?.title ?? "", dirty: dirty(), saved: checkpointMatches(current ?? null, checkpoint), measureCount: current?.measureCount ?? 0,
    tempoBpm: current?.metadata?.tempoBpm ?? (current?.notation.kind === "staff" ? current.notation.tempoBpm : null),
    metadata: current?.metadata ? Object.freeze({ ...current.metadata, authors: Object.freeze([...current.metadata.authors]) }) : null,
    undoDepth: current?.undoDepth ?? 0, redoDepth: current?.redoDepth ?? 0, message: failure?.message ?? null, warnings,
  });
  function accept(value: ScoreSessionRead | null, replacement = false) {
    if (value !== null && !isScoreSessionRead(value)) throw new Error("无法确认作品读取结果");
    if (!replacement && current && value?.documentId === current.documentId && value.documentVersion < current.documentVersion) {
      throw new Error("作品读取版本已过期，请重新读取");
    }
    current = value; failure = null;
    // A fresh accepted read replaces observed recovery status. Unrelated
    // post-commit warnings still keep their existing retry lifecycle.
    warnings = Object.freeze([
      ...(replacement ? [] : warnings.filter(warning => warning.code !== "file.recovery-unavailable")),
      ...(value?.warnings ?? []),
    ]);
  }
  async function loadInitial(): Promise<ScoreSessionRead | null> {
    const token = epoch;
    const assertCurrent = () => { if (disposed || token !== epoch) throw new Error("作品会话已释放"); };
    // Guard follow-up requests, including auto-create and the helper's 409 reread.
    // Requests already issued to the host are not assumed cancellable.
    const guardedClient = {
      read() { assertCurrent(); return client.read(); },
      create(input: NewScoreInput, requestId: string, expectedDocumentId: string | null) {
        assertCurrent(); return client.create(input, requestId, expectedDocumentId);
      },
    };
    return initialization === "read-existing" ? guardedClient.read() : readOrCreateInitialScore(guardedClient, initialId);
  }
  function ensureLoaded(): Promise<ScoreSessionRead | null> {
    if (disposed) return Promise.reject(new Error("作品会话已释放"));
    if (initial) return initial;
    if (failure) return Promise.reject(failure);
    if (current !== undefined) return Promise.resolve(current);
    busy = true;
    const token = ++epoch;
    initial = loadInitial().then(value => {
      if (disposed || token !== epoch) throw new Error("作品会话已释放");
      accept(value); return current ?? null;
    }).catch((error: unknown) => {
      if (!disposed && token === epoch) failure = error instanceof Error ? error : new Error("作品读取失败");
      throw error;
    }).finally(() => {
      if (!disposed && token === epoch) { busy = false; initial = null; notify(stateListeners); }
    });
    notify(stateListeners);
    return initial;
  }
  async function run(operation: () => Promise<ScoreSessionRead | null>, cancelled = false, nextCheckpoint?: () => SavedFileCheckpoint | null, replacement = false): Promise<Result> {
    if (disposed) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
    if (busy) return { ok: false, code: "document.busy", message: "作品操作尚未完成" };
    busy = true; const token = ++epoch; notify(stateListeners);
    try {
      // State observers may synchronously end the session before IO is issued.
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
      const next = await operation();
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
      if (cancelled && next === null) return { ok: true, changed: false, cancelled: true };
      // A guarded explicit replacement can reopen an earlier disk revision of the same ID.
      // Ordinary reads still reject late older snapshots.
      accept(next, replacement); if (nextCheckpoint) checkpoint = nextCheckpoint(); notify(readListeners);
      return { ok: true, changed: true };
    } catch (error) {
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
      failure = error instanceof Error ? error : new Error("作品操作失败");
      notify(readListeners);
      return { ok: false, code: "document.operation-failed", message: failure.message };
    } finally {
      if (!disposed && token === epoch) { busy = false; notify(stateListeners); }
    }
  }
  function replacementGuard(): Result | null {
    if (disposed) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
    if (busy) return { ok: false, code: "document.busy", message: "作品操作尚未完成" };
    if (failure || current === undefined) return { ok: false, code: "document.not-ready", message: "请先重新读取作品" };
    if (dirty()) return { ok: false, code: "document.unsaved", message: "当前作品有未保存内容，暂不替换；请保留当前会话" };
    return null;
  }
  const replacementPrecondition = (): DocumentReplacementPrecondition => current
    ? { kind: "document", documentId: current.documentId, documentVersion: current.documentVersion }
    : { kind: "empty" };
  async function recentRequest(operation: () => Promise<RecentDocumentsSnapshotV1>): Promise<RecentDocumentsSnapshotV1> {
    if (disposed) throw new Error("作品会话已释放");
    const result = await operation();
    if (disposed) throw new Error("作品会话已释放");
    return result;
  }
  function runFileOpen(operation: () => Promise<WorkbenchNativeFileResult | null>, cancellable: boolean): Promise<Result> {
    let opened: WorkbenchNativeFileResult | null = null;
    return run(async () => { opened = await operation(); if (!opened && !cancellable) throw new Error("文件打开结果无效"); return opened?.session ?? null; }, cancellable, () => {
      if (!opened) throw new Error("文件打开结果无效");
      warnings = Object.freeze([...(opened.session.warnings ?? []), ...(opened.warnings ?? [])]);
      return { documentId: opened.session.documentId, documentVersion: opened.savedVersion, name: opened.name };
    }, true);
  }
  function editGuard(projection: "staff" | "tablature" | "either" = "staff"): Result | null {
    if (disposed) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
    if (busy) return { ok: false, code: "document.busy", message: "作品操作尚未完成" };
    if (failure || !current) return { ok: false, code: "document.not-ready", message: "请先读取作品" };
    const supported = projection === "staff" ? current.notation.kind === "staff"
      : projection === "tablature" ? current.tablature?.kind === "tablature"
      : current.notation.kind === "staff" || current.tablature?.kind === "tablature";
    if (!supported) return { ok: false, code: projection === "tablature" ? "document.tablature-unavailable" : "document.not-ready",
      message: "当前作品没有可用的编辑谱式" };
    if (!client.edit) return { ok: false, code: "document.edit-unavailable", message: "当前宿主未提供编辑接口" };
    return null;
  }
  async function applyEdit(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
    const edit = client.edit?.bind(client);
    if (!edit) return { ok: false, code: "document.edit-unavailable", message: "当前宿主未提供编辑接口" };
    // Capture before observers can mutate caller-owned input or end the session.
    const request: ScoreEditRequest = structuredClone({ requestId: input.requestId, documentId: input.documentId,
      expectedVersion: input.expectedVersion, action: input.action });
    const targetEventId = request.action.kind === "set-fretted-position" ? request.action.eventId : null;
    const targetNote = current?.tablature?.kind === "tablature"
      ? current.tablature.measures.flatMap(measure => measure.events).find(event => event.id === targetEventId)?.content : null;
    const targetNoteId = targetNote?.kind === "note" ? targetNote.noteId : null;
    const accepted: { value?: ScoreSessionRead } = {};
    const result = await run(async () => {
      const next = await edit(request);
      if (!isScoreSessionRead(next) || next.documentId !== request.documentId || next.documentVersion <= request.expectedVersion) {
        throw new Error("编辑结果不匹配当前作品或没有推进版本，请重新读取");
      }
      if (request.action.kind === "set-document-metadata" && (!next.metadata
        || documentMetadataKey(next.metadata) !== documentMetadataKey(request.action.metadata))) {
        throw new Error("作品信息回执缺失或不匹配，请重新读取");
      }
      if (request.action.kind === "set-fretted-position") {
        const action = request.action, tab = next.tablature;
        const event = tab?.kind === "tablature" && tab.partId === action.partId
          ? tab.measures.flatMap(measure => measure.events).find(event => event.id === action.eventId) : null;
        if (!event || event.content.kind !== "note" || event.content.noteId !== targetNoteId
          || event.content.position.stringNumber !== action.position.stringNumber || event.content.position.fret !== action.position.fret) {
          throw new Error("弦品回执缺失或不匹配，请重新读取");
        }
      }
      accepted.value = next; return next;
    });
    return result.ok && accepted.value ? { ...result, session: accepted.value } : result;
  }
  async function history(kind: "undo" | "redo"): Promise<Result> {
    const guard = editGuard("either"); if (guard) return guard;
    const value = current!;
    if (!(kind === "undo" ? value.undoDepth : value.redoDepth)) return { ok: false, code: "document.history-empty", message: "当前没有可恢复的历史" };
    const request = { requestId: createId(), documentId: value.documentId, expectedVersion: value.documentVersion, action: { kind } };
    if (!isScoreEditRequest(request)) return { ok: false, code: "document.invalid-input", message: "历史请求无效" };
    return applyEdit(request);
  }
  return Object.freeze({
    read: ensureLoaded,
    subscribe: (listener: () => void) => subscribe(readListeners, listener),
    snapshot,
    subscribeState: (listener: () => void) => subscribe(stateListeners, listener),
    canReplace: () => !disposed && !busy && !failure && current !== undefined && !dirty(),
    canReload: () => !disposed && !busy,
    canUndo: () => !editGuard("either") && Boolean(current?.undoDepth),
    canRedo: () => !editGuard("either") && Boolean(current?.redoDepth),
    canSave: () => !disposed && !busy && !failure && Boolean(current) && dirty() && client.usesNativeFiles()
      && typeof client.saveNativeDocumentGuarded === "function",
    canSaveAs: () => !disposed && !busy && !failure && Boolean(current) && client.usesNativeFiles()
      && typeof client.saveNativeDocumentGuarded === "function",
    undo: () => history("undo"),
    redo: () => history("redo"),
    async save(saveAs = false): Promise<Result> {
      if (typeof saveAs !== "boolean") return { ok: false, code: "document.invalid-input", message: "保存参数无效" };
      if (disposed) return { ok: false, code: "document.disposed", message: "作品会话已释放" };
      if (busy) return { ok: false, code: "document.busy", message: "作品操作尚未完成" };
      if (failure || !current) return { ok: false, code: "document.not-ready", message: "请先重新读取作品" };
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "请在桌面应用中保存作品" };
      if (!client.saveNativeDocumentGuarded) return { ok: false, code: "document.save-unavailable", message: "当前宿主不支持受保护保存" };
      const saving = current;
      const expected = { kind: "document" as const, documentId: saving.documentId, documentVersion: saving.documentVersion };
      const name = fileStem(checkpoint?.name ?? current.title);
      let saved: WorkbenchNativeFileResult | null = null;
      return run(async () => {
        saved = await client.saveNativeDocumentGuarded!(name, saveAs, expected);
        if (saved === null) return null;
        if (!isScoreSessionRead(saved.session) || saved.session.documentId !== expected.documentId
          || saved.session.documentVersion !== expected.documentVersion || saved.savedVersion !== expected.documentVersion
          || typeof saved.name !== "string" || !saved.name) throw new Error("保存结果不匹配当前作品，请重新读取");
        if (saving.persistence && (!reconcileSavedSession(saving, current ?? null, saved.session)
          || saved.session.persistence?.savedVersion !== saved.savedVersion || saved.session.persistence.dirty)) {
          throw new Error("保存结果不匹配当前会话，请重新读取");
        }
        return saved.session;
      }, true, () => {
        warnings = Object.freeze([...(saved!.session.warnings ?? []), ...(saved!.warnings ?? [])]);
        return { documentId: saved!.session.documentId, documentVersion: saved!.savedVersion, name: saved!.name };
      });
    },
    async append(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "append") return { ok: false, code: "document.invalid-input", message: "本入口只接受音符或休止输入" };
      if (input.documentId !== current!.documentId || input.expectedVersion !== current!.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      return applyEdit(input);
    },
    async setDocumentMetadata(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-document-metadata"
        || Object.keys(input).some(key => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受作品信息修改" };
      }
      const value = current!;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新读取" };
      }
      if (!value.metadata) return { ok: false, code: "document.metadata-unavailable", message: "宿主未提供完整作品信息，请更新宿主" };
      if (documentMetadataKey(input.action.metadata) === documentMetadataKey(value.metadata)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async setFrettedPosition(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard("tablature"); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-fretted-position"
        || Object.keys(input).some(key => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受弦品修改" };
      }
      const value = current!, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新选择" };
      }
      const tab = value.tablature;
      if (tab?.kind !== "tablature") return { ok: false, code: "document.tablature-unavailable", message: "当前宿主或作品尚不能编辑Tab" };
      if (action.partId !== tab.partId) return { ok: false, code: "document.part-stale", message: "目标声部已改变，请重新选择" };
      if (!isFrettedPosition(action.position, tab)) return { ok: false, code: "document.invalid-input", message: "弦品超出当前乐器范围" };
      const event = tab.measures.flatMap(measure => measure.events).find(event => event.id === action.eventId);
      if (!event || event.content.kind !== "note") return { ok: false, code: "document.selection-stale", message: "请重新选择单个音符" };
      if (event.content.position.stringNumber === action.position.stringNumber && event.content.position.fret === action.position.fret) {
        return { ok: true, changed: false, session: value };
      }
      return applyEdit(input);
    },
    async setStaffClef(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-staff-clef"
        || Object.keys(input).some(key => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受谱号修改" };
      }
      const value = current!, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      if (value.notation.kind !== "staff" || action.staffId !== value.notation.staffId) {
        return { ok: false, code: "document.staff-stale", message: "目标谱表已改变，请重新选择" };
      }
      if (action.clef === value.notation.clef) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async setKeySignature(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-key-signature"
        || Object.keys(input).some(key => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受调号修改" };
      }
      const value = current!, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      if (value.notation.kind !== "staff" || action.partId !== value.notation.partId
        || !value.notation.measures.some(measure => measure.id === action.measureId)) {
        return { ok: false, code: "document.key-signature-stale", message: "目标声部或小节已改变，请重新选择" };
      }
      if (keySignatureChangeIsNoOp(value.notation, action.measureId, action.change)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async editMeasure(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || !["insert-measure", "remove-measure", "set-measure-meter"].includes(input.action.kind)) {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受小节结构和拍号修改" };
      }
      const value = current!;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      const action = input.action;
      if (value.notation.kind !== "staff" || !("measureId" in action)) return { ok: false, code: "document.invalid-input", message: "小节请求无效" };
      const measure = value.notation.measures.find(item => item.id === action.measureId);
      if (!measure) return { ok: false, code: "document.measure-stale", message: "目标小节已改变，请重新选择" };
      if (action.kind === "remove-measure" && value.notation.measures.length <= 1) {
        return { ok: false, code: "document.measure-required", message: "乐谱至少需要保留一个小节" };
      }
      if (action.kind === "set-measure-meter") {
        if (equalMeter(measure.meter, action.meter)) return { ok: true, changed: false, session: value };
        if (measureMeterTargets(value.notation.measures, action.measureId, action.scope).length > 100) {
          return { ok: false, code: "document.measure-budget", message: "单次拍号事务最多修改 100 个小节，请缩小范围" };
        }
      }
      return applyEdit(input);
    },
    async deleteEvent(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "delete-event") {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受删除单个事件" };
      }
      if (input.documentId !== current!.documentId || input.expectedVersion !== current!.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      return applyEdit(input);
    },
    async deleteRange(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "delete-range") {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受范围删除" };
      }
      if (input.documentId !== current!.documentId || input.expectedVersion !== current!.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新选择" };
      }
      return applyEdit(input);
    },
    async pasteFragment(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "paste-fragment") {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受音乐片段粘贴" };
      }
      if (input.documentId !== current!.documentId || input.expectedVersion !== current!.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新定位" };
      }
      return applyEdit(input);
    },
    async setEventProperties(input: ScoreEditRequest): Promise<Result & { readonly session?: ScoreSessionRead }> {
      const guard = editGuard(); if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-event-properties") {
        return { ok: false, code: "document.invalid-input", message: "本入口只接受单个事件属性" };
      }
      if (input.documentId !== current!.documentId || input.expectedVersion !== current!.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "作品已改变，请重新选择" };
      }
      const value = current!, action = input.action;
      const event = value.notation.kind === "staff" ? value.notation.measures.flatMap(measure => measure.events)
        .find(event => event.id === action.eventId) : undefined;
      if (!event) return { ok: false, code: "document.selection-stale", message: "选中事件已不存在" };
      if (event.content.kind !== action.properties.content.kind) {
        return { ok: false, code: "document.invalid-input", message: "属性编辑不能切换音符和休止符类型" };
      }
      if (equalEventProperties(event, action.properties)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async newScore(input: unknown = { title: "", measureCount: 1 }): Promise<Result> {
      const guard = replacementGuard(); if (guard) return guard;
      if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "document.invalid-input", message: "新建作品参数无效" };
      const value = input as Record<string, unknown>;
      if (Object.keys(value).some(key => !["title", "measureCount"].includes(key)) || typeof value.title !== "string" || typeof value.measureCount !== "number") {
        return { ok: false, code: "document.invalid-input", message: "新建作品参数无效" };
      }
      const accepted = { title: value.title, measureCount: value.measureCount };
      if (Object.keys(validateNewScoreInput(accepted)).length) return { ok: false, code: "document.invalid-input", message: "新建作品参数超出支持范围" };
      const expected = replacementPrecondition();
      return run(() => client.createGuarded(accepted, createId(), expected), false,
        () => null, true);
    },
    async open(): Promise<Result> {
      const guard = replacementGuard(); if (guard) return guard;
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "请在桌面应用中打开作品" };
      const expected = replacementPrecondition();
      return runFileOpen(() => client.openNativeDocumentGuarded(expected), true);
    },
    async openRecent(recordId: string): Promise<Result> {
      const guard = replacementGuard(); if (guard) return guard;
      if (!isRecentRecordId(recordId)) return { ok: false, code: "document.invalid-input", message: "最近文件记录ID无效" };
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "请在桌面应用中打开作品" };
      const expected = replacementPrecondition();
      return runFileOpen(async () => {
        if (!client.openRecentDocumentGuarded) throw new Error("当前宿主不支持受保护打开最近文件");
        return client.openRecentDocumentGuarded(recordId, expected);
      }, false);
    },
    recent: Object.freeze({
      list: () => recentRequest(() => {
        if (!client.listRecentDocuments) throw new Error("当前宿主不支持最近文件目录");
        return client.listRecentDocuments();
      }),
      remove: (recordId: string) => recentRequest(() => {
        if (!isRecentRecordId(recordId)) throw new Error("最近文件记录ID无效");
        if (!client.removeRecentDocument) throw new Error("当前宿主不支持移除最近文件记录");
        return client.removeRecentDocument(recordId);
      }),
      async retryRegistration(): Promise<RecentDocumentsSnapshotV1> {
        if (disposed || busy || failure || !current) throw new Error("当前作品尚不可登记");
        if (!client.recordCurrentFile) throw new Error("当前宿主不支持登记最近文件");
        const expected = replacementPrecondition(), token = ++epoch;
        busy = true; notify(stateListeners);
        try {
          if (disposed || token !== epoch) throw new Error("作品会话已释放");
          const result = await client.recordCurrentFile(expected);
          if (disposed || token !== epoch) throw new Error("作品会话已释放");
          warnings = Object.freeze(warnings.filter(warning => warning.code !== "file.recent-unavailable"));
          return result;
        } finally { if (!disposed && token === epoch) { busy = false; notify(stateListeners); } }
      },
    }),
    reload: () => run(() => current === undefined ? loadInitial() : client.read()),
    dispose() {
      if (disposed) return; disposed = true; epoch++; busy = false;
      readListeners.clear(); stateListeners.clear(); current = undefined; failure = null; checkpoint = null; warnings = Object.freeze([]);
    },
  });
}
