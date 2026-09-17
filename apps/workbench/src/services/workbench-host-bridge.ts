import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import type { ScoreEditRequest } from "../contracts/note-input";
import type { NewScoreInput } from "../contracts/new-score";
import { DEFAULT_APPLICATION_SETTINGS, isApplicationSettingsV1 } from "../contracts/application-settings.ts";
import type { ApplicationSettingsV1 } from "../contracts/application-settings.ts";
import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";

export class WorkbenchRequestError extends Error {
  readonly status: number;
  readonly issue: WorkbenchIssue | undefined;

  constructor(message: string, status: number, issue?: WorkbenchIssue) {
    super(message);
    this.status = status;
    this.issue = issue;
  }
}

/**
 * Boundary between the reusable workbench UI and the process that owns the
 * editable score session. The browser adapter uses Vite HTTP for development;
 * the production Tauri adapter implements the same contract with Rust commands.
 */
export interface WorkbenchHostBridge {
  read(workspaceId: string): Promise<unknown | null>;
  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<unknown>;
  edit(workspaceId: string, input: ScoreEditRequest): Promise<unknown>;
  exportDocument(workspaceId: string): Promise<string>;
  importDocument(workspaceId: string, document: unknown): Promise<unknown>;
  readonly nativeFiles?: boolean;
  openNativeDocument?(workspaceId: string): Promise<NativeFileResult | null>;
  saveNativeDocument?(workspaceId: string, suggestedName: string, saveAs: boolean): Promise<NativeFileResult | null>;
  onNativeCloseRequested?(handler: () => boolean | Promise<boolean>): Promise<() => void>;
  closeNativeWindow?(workspaceId: string): Promise<void>;
  readApplicationSettings?(): Promise<unknown>;
  writeApplicationSettings?(settings: ApplicationSettingsV1): Promise<unknown>;
  resetApplicationSettings?(): Promise<unknown>;
}

export interface NativeFileResult {
  readonly session: unknown;
  readonly name: string;
  readonly savedVersion: number;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type DesktopWindow = Pick<TauriWindow, "onCloseRequested" | "close">;
type CurrentWindow = () => DesktopWindow;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function browserSettingsStorage(): SettingsStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function requestError(error: unknown, fallback: string): WorkbenchRequestError {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : fallback;
    return new WorkbenchRequestError(
      message,
      typeof record.status === "number" ? record.status : 503,
      isWorkbenchIssue(record.issue) ? record.issue : undefined,
    );
  }
  return new WorkbenchRequestError(fallback, 503);
}

/** Production desktop adapter. All mutable score and file state stays in Rust. */
export class TauriWorkbenchHostBridge implements WorkbenchHostBridge {
  readonly nativeFiles = true;
  private readonly invoke: Invoke;
  private readonly currentWindow: CurrentWindow;
  private forceClosing = false;

  constructor(invokeCommand: Invoke = invoke, currentWindow: CurrentWindow = getCurrentWindow) {
    this.invoke = invokeCommand;
    this.currentWindow = currentWindow;
  }

  private async call<T>(command: string, args: Record<string, unknown>, fallback: string): Promise<T> {
    try { return await this.invoke<T>(command, args); }
    catch (error) { throw requestError(error, fallback); }
  }

  read(workspaceId: string) {
    return this.call<unknown | null>("workbench_read_v1", { workspaceId }, "无法读取当前乐谱");
  }

  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null) {
    return this.call<unknown>("workbench_create_v1", {
      request: { workspaceId, input, requestId, expectedDocumentId },
    }, "无法创建乐谱");
  }

  edit(workspaceId: string, input: ScoreEditRequest) {
    return this.call<unknown>("workbench_edit_v1", {
      request: { workspaceId, ...input },
    }, "无法完成编辑");
  }

  exportDocument(workspaceId: string) {
    return this.call<string>("workbench_export_v1", { workspaceId }, "无法导出当前乐谱");
  }

  importDocument(workspaceId: string, document: unknown) {
    return this.call<unknown>("workbench_import_v1", {
      workspaceId, documentJson: JSON.stringify(document),
    }, "无法打开乐谱文件");
  }

  openNativeDocument(workspaceId: string) {
    return this.call<NativeFileResult | null>("workbench_open_file_v1", { workspaceId }, "无法打开乐谱文件");
  }

  saveNativeDocument(workspaceId: string, suggestedName: string, saveAs: boolean) {
    return this.call<NativeFileResult | null>("workbench_save_file_v1",
      { workspaceId, suggestedName, saveAs }, "无法保存当前乐谱");
  }

  async onNativeCloseRequested(handler: () => boolean | Promise<boolean>): Promise<() => void> {
    return this.currentWindow().onCloseRequested(async (event) => {
      if (this.forceClosing) return;
      if (!await handler()) event.preventDefault();
    });
  }

  async closeNativeWindow(workspaceId: string): Promise<void> {
    await this.call<boolean>("workbench_close_v1", { workspaceId }, "无法关闭当前工作区");
    this.forceClosing = true;
    await this.currentWindow().close();
  }

  readApplicationSettings() {
    return this.call<unknown>("workbench_read_settings_v1", {}, "无法读取应用配置");
  }

  writeApplicationSettings(settings: ApplicationSettingsV1) {
    return this.call<unknown>("workbench_write_settings_v1", { settings }, "无法保存应用配置");
  }

  resetApplicationSettings() {
    return this.call<unknown>("workbench_reset_settings_v1", {}, "无法恢复默认应用配置");
  }
}

export function createWorkbenchHostBridge(): WorkbenchHostBridge {
  return import.meta.env.VITE_BRILLIANT_DESKTOP === "1" || isTauri()
    ? new TauriWorkbenchHostBridge() : new BrowserWorkbenchHostBridge();
}

export class BrowserWorkbenchHostBridge implements WorkbenchHostBridge {
  private static readonly SETTINGS_KEY = "brilliant.workbench.application-settings.v1";
  private static readonly INVALID_SETTINGS_KEY = "brilliant.workbench.application-settings.invalid.v1";
  private readonly settingsStorage: SettingsStorage | undefined;

  constructor(settingsStorage: SettingsStorage | undefined = browserSettingsStorage()) {
    this.settingsStorage = settingsStorage;
  }
  private endpoint(workspaceId: string, resource: "session" | "document") {
    return `/api/workbench/${resource}?workspaceId=${encodeURIComponent(workspaceId)}`;
  }

  private async requestSession(workspaceId: string, init?: RequestInit): Promise<unknown | null> {
    let response: Response;
    try {
      response = await fetch(this.endpoint(workspaceId, "session"), {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      const message = "工作台服务暂时不可用，请重新加载";
      throw new WorkbenchRequestError(message, 503,
        { code: "bridge.unavailable", message, severity: "error", source: "bridge", target: { scope: "workbench" }, retryable: true });
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error("无法确认操作结果，请重试");
    }
    if (typeof result !== "object" || result === null) throw new Error("无法确认操作结果，请重试");
    const record = result as Record<string, unknown>;
    if (!response.ok) {
      throw new WorkbenchRequestError(
        typeof record.message === "string" ? record.message : "操作失败，请重试",
        response.status,
        isWorkbenchIssue(record.issue) ? record.issue : undefined,
      );
    }
    return record.session ?? null;
  }

  read(workspaceId: string) {
    return this.requestSession(workspaceId);
  }

  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null) {
    return this.requestSession(workspaceId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, requestId, expectedDocumentId }),
    });
  }

  edit(workspaceId: string, input: ScoreEditRequest) {
    return this.requestSession(workspaceId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async exportDocument(workspaceId: string): Promise<string> {
    const response = await fetch(this.endpoint(workspaceId, "document"), {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("无法保存当前乐谱");
    return response.text();
  }

  async importDocument(workspaceId: string, document: unknown): Promise<unknown> {
    const response = await fetch(this.endpoint(workspaceId, "document"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(15000),
    });
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null) throw new Error("无法打开乐谱文件");
    const record = result as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof record.message === "string" ? record.message : "无法打开乐谱文件");
    return record.session;
  }

  async readApplicationSettings(): Promise<unknown> {
    const value = this.settingsStorage?.getItem(BrowserWorkbenchHostBridge.SETTINGS_KEY);
    if (value === null || value === undefined) return {
      settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: false,
    };
    try {
      const settings: unknown = JSON.parse(value);
      if (!isApplicationSettingsV1(settings)) throw new Error("invalid application settings");
      return {
        settings,
        persisted: true,
        recoveredFromInvalid: false,
      };
    } catch {
      this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.INVALID_SETTINGS_KEY, value);
      return { settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: true };
    }
  }

  async writeApplicationSettings(settings: ApplicationSettingsV1): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }

  async resetApplicationSettings(): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.SETTINGS_KEY, JSON.stringify(DEFAULT_APPLICATION_SETTINGS));
    return DEFAULT_APPLICATION_SETTINGS;
  }
}
