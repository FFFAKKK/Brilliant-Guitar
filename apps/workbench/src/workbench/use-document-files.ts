import { useCallback, useEffect, useRef, useState } from "react";
import type { NewScoreInput } from "../contracts/new-score";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { NotationRenderer } from "../notation/notation-renderer";
import type { WorkbenchClient } from "../services/workbench-client";
import { checkpointMatches, downloadText, fileStem, hasUnsavedDocument, readFileCheckpoint, writeFileCheckpoint } from "../services/document-file";
import type { SavedFileCheckpoint } from "../services/document-file";
import { exportStaffSvg } from "../services/score-svg-export";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import { issueFromError } from "./issue-from-error.ts";

type PendingAction = { readonly kind: "new" } | { readonly kind: "open"; readonly file: File }
  | { readonly kind: "open-native" } | { readonly kind: "close-native" };

/** Document commands own file prompts/checkpoints; the score and Core stay authoritative. */
export function useDocumentFiles(session: ScoreSessionRead | null, client: WorkbenchClient,
  onSession: (session: ScoreSessionRead) => void, renderer: NotationRenderer, unavailable: boolean,
  runtime?: WorkbenchTaskRuntime) {
  const [checkpoint, setCheckpoint] = useState<SavedFileCheckpoint | null>(readFileCheckpoint);
  const [newScoreOpen, setNewScoreOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [fileError, setFileError] = useState("");
  const [saveFailure, setSaveFailure] = useState(false);
  const [working, setWorking] = useState<"save" | "open" | "export" | "close" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const available = !unavailable && !working;
  const nativeFiles = client.usesNativeFiles();
  const saved = checkpointMatches(session, checkpoint);
  const dirty = hasUnsavedDocument(session, checkpoint);
  const name = session && checkpoint?.documentId === session.documentId ? checkpoint.name : fileStem(session?.title ?? "");
  const state = working === "save" ? "saving" : saveFailure ? "error" : saved ? "saved" : "unsaved";

  function remember(value: SavedFileCheckpoint | null) {
    setCheckpoint(value);
    writeFileCheckpoint(value);
  }

  async function saveDocument(asName?: string, forceSaveAs = false): Promise<boolean> {
    if (!session || !available) return false;
    const saving = session;
    setWorking("save"); setSaveFailure(false); setFileError("");
    const token = runtime?.operations.begin("file.save", "document");
    let succeeded = false;
    try {
      const nextName = fileStem(asName ?? name);
      if (nativeFiles) {
        const result = await client.saveNativeDocument(nextName, forceSaveAs);
        if (!result) { succeeded = true; return false; }
        remember({ documentId: result.session.documentId, documentVersion: result.savedVersion, name: result.name });
        onSession(result.session);
      } else {
        const text = await client.exportDocument();
        downloadText(text, `${nextName}.bgp.json`, "application/json;charset=utf-8");
        remember({ documentId: saving.documentId, documentVersion: saving.documentVersion, name: nextName });
      }
      succeeded = true;
      return true;
    } catch (error) {
      const issue = issueFromError(error, { code: "file.save-failed", message: "无法保存当前乐谱", severity: "error",
        source: "file", target: { scope: "component", componentId: "navigation.file" }, retryable: true });
      setSaveFailure(true);
      setFileError(issue.message); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue);
      return false;
    } finally { if (succeeded && token) runtime?.operations.finish(token); setWorking(null); }
  }

  async function exportSvg(): Promise<void> {
    if (!session || !available || session.notation.kind !== "staff") return;
    setWorking("export"); setFileError("");
    const token = runtime?.operations.begin("file.export-svg", "document");
    let succeeded = false;
    try {
      const svg = await exportStaffSvg(session.notation, renderer);
      downloadText(svg, `${name}.svg`, "image/svg+xml;charset=utf-8");
      succeeded = true;
    } catch (error) {
      const issue = issueFromError(error, { code: "file.export-failed", message: "无法导出当前谱面", severity: "error",
        source: "renderer", target: { scope: "component", componentId: "notation.staff-view" }, retryable: true });
      setFileError(issue.message); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue);
    } finally { if (succeeded && token) runtime?.operations.finish(token); setWorking(null); }
  }

  async function openDocument(file: File): Promise<void> {
    if (!available) return;
    setWorking("open"); setFileError(""); setSaveFailure(false);
    const token = runtime?.operations.begin("file.open", "document");
    let succeeded = false;
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); }
      catch { throw new Error("文件不是有效的项目 JSON"); }
      const imported = await client.importDocument(parsed);
      remember({ documentId: imported.documentId, documentVersion: imported.documentVersion, name: fileStem(file.name) });
      onSession(imported);
      succeeded = true;
    } catch (error) {
      const issue = issueFromError(error, { code: "file.open-failed", message: "无法打开该乐谱文件", severity: "error",
        source: "file", target: { scope: "component", componentId: "navigation.file" }, retryable: true });
      setFileError(issue.message); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue);
    } finally { if (succeeded && token) runtime?.operations.finish(token); setWorking(null); }
  }

  async function openNativeDocument(): Promise<void> {
    if (!available) return;
    setWorking("open"); setFileError(""); setSaveFailure(false);
    const token = runtime?.operations.begin("file.open", "document");
    let succeeded = false;
    try {
      const result = await client.openNativeDocument();
      if (!result) { succeeded = true; return; }
      remember({ documentId: result.session.documentId, documentVersion: result.savedVersion, name: result.name });
      onSession(result.session);
      succeeded = true;
    } catch (error) {
      const issue = issueFromError(error, { code: "file.open-failed", message: "无法打开该乐谱文件", severity: "error",
        source: "file", target: { scope: "component", componentId: "navigation.file" }, retryable: true });
      setFileError(issue.message); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue);
    } finally { if (succeeded && token) runtime?.operations.finish(token); setWorking(null); }
  }

  const closeNativeWindow = useCallback(async (): Promise<boolean> => {
    setWorking("close"); setFileError("");
    const token = runtime?.operations.begin("file.close", "document");
    let succeeded = false;
    try {
      await client.closeNativeWindow();
      succeeded = true;
      return true;
    } catch (error) {
      const issue = issueFromError(error, { code: "file.close-failed", message: "无法安全关闭当前工作区", severity: "error",
        source: "file", target: { scope: "component", componentId: "navigation.file" }, retryable: true });
      setFileError(issue.message); runtime?.feedback.report(issue); if (token) runtime?.operations.fail(token, issue);
      return false;
    } finally { if (succeeded && token) runtime?.operations.finish(token); setWorking(null); }
  }, [client, runtime?.feedback, runtime?.operations]);

  function requestNewScore() {
    if (!available) return;
    setFileError("");
    if (dirty) setPendingAction({ kind: "new" }); else setNewScoreOpen(true);
  }

  function requestOpenFile(file: File) {
    if (!available) return;
    setFileError("");
    if (dirty) setPendingAction({ kind: "open", file }); else void openDocument(file);
  }

  function requestOpenPicker() {
    if (!available) return;
    if (!nativeFiles) { fileInputRef.current?.click(); return; }
    setFileError("");
    if (dirty) setPendingAction({ kind: "open-native" }); else void openNativeDocument();
  }

  function continuePendingAction(action: PendingAction) {
    setPendingAction(null);
    if (action.kind === "new") setNewScoreOpen(true);
    else if (action.kind === "open") void openDocument(action.file);
    else if (action.kind === "open-native") void openNativeDocument();
    else void closeNativeWindow();
  }

  async function createScore(input: NewScoreInput, requestId: string): Promise<void> {
    const created = await client.create(input, requestId, session?.documentId ?? null);
    remember(null); setFileError(""); setSaveFailure(false);
    onSession(created);
  }

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(() => {
    if (!nativeFiles) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void client.onNativeCloseRequested(async () => {
      if (!dirty) {
        await closeNativeWindow();
        return false;
      }
      if (active) setPendingAction({ kind: "close-native" });
      return false;
    }).then((dispose) => { if (active) unlisten = dispose; else dispose(); });
    return () => { active = false; unlisten?.(); };
  }, [client, closeNativeWindow, dirty, nativeFiles]);

  return { available, working, state, name, fileError, fileInputRef, newScoreOpen, setNewScoreOpen,
    saveAsOpen, setSaveAsOpen, pendingAction, setPendingAction, requestNewScore,
    requestOpenPicker, requestOpenFile,
    requestSaveAs: () => { if (available && session) {
      if (nativeFiles) void saveDocument(undefined, true); else setSaveAsOpen(true);
    } },
    saveDocument, exportSvg, createScore,
    discardPending: () => { if (pendingAction) continuePendingAction(pendingAction); },
    saveAndContinue: async () => { if (pendingAction && await saveDocument()) continuePendingAction(pendingAction); },
    clearError: () => { setFileError(""); setSaveFailure(false); },
  };
}
