import type { ScoreEditRequest } from "../contracts/note-input";
import type { NewScoreInput } from "../contracts/new-score";
import { isScoreSessionRead } from "../contracts/score-session.ts";
import type { ScoreSessionRead } from "../contracts/score-session";
import { isWorkspaceId } from "../contracts/workspace-id.ts";
import { createWorkbenchHostBridge } from "./workbench-host-bridge.ts";
import type { WorkbenchHostBridge } from "./workbench-host-bridge.ts";
export { WorkbenchRequestError } from "./workbench-host-bridge.ts";

const SESSION_WORKSPACE_KEY = "brilliant.workbench.session.v1";
const DESKTOP_WORKSPACE_KEY = "brilliant.workbench.desktop.v1";

interface WorkspaceIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Desktop recovery files are keyed by workspace ID, so the desktop identity
 * must survive a crashed window. Browser previews remain isolated to one tab
 * session and therefore continue to use sessionStorage.
 */
export function resolveWorkbenchWorkspaceId(
  nativeFiles: boolean,
  sessionStore: WorkspaceIdentityStorage | undefined = globalThis.sessionStorage,
  persistentStore: WorkspaceIdentityStorage | undefined = globalThis.localStorage,
  createId: () => string = () => crypto.randomUUID(),
): string {
  try {
    if (!nativeFiles) {
      const stored = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
      const workspaceId = isWorkspaceId(stored) ? stored : createId();
      sessionStore?.setItem(SESSION_WORKSPACE_KEY, workspaceId);
      return workspaceId;
    }

    const persisted = persistentStore?.getItem(DESKTOP_WORKSPACE_KEY);
    const legacySession = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
    const workspaceId = isWorkspaceId(persisted)
      ? persisted
      : isWorkspaceId(legacySession) ? legacySession : createId();
    persistentStore?.setItem(DESKTOP_WORKSPACE_KEY, workspaceId);
    return workspaceId;
  } catch {
    return createId();
  }
}

/** Browser holds session identity and read metadata, never a second editable score. */
export class WorkbenchClient {
  private readonly bridge: WorkbenchHostBridge;
  private readonly workspaceId: string;

  constructor(bridge: WorkbenchHostBridge = createWorkbenchHostBridge()) {
    this.bridge = bridge;
    this.workspaceId = resolveWorkbenchWorkspaceId(bridge.nativeFiles === true);
  }

  private session(value: unknown | null, requiredMessage?: string): ScoreSessionRead | null {
    if (value === null) {
      if (requiredMessage) throw new Error(requiredMessage);
      return null;
    }
    if (!isScoreSessionRead(value)) throw new Error("无法确认操作结果，请重试");
    return value;
  }

  async edit(input: ScoreEditRequest): Promise<ScoreSessionRead> {
    return this.session(await this.bridge.edit(this.workspaceId, input), "无法确认输入结果，请重试")!;
  }

  async read(): Promise<ScoreSessionRead | null> {
    return this.session(await this.bridge.read(this.workspaceId));
  }

  async create(input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<ScoreSessionRead> {
    return this.session(
      await this.bridge.create(this.workspaceId, input, requestId, expectedDocumentId),
      "无法确认创建结果，请重试",
    )!;
  }

  async exportDocument(): Promise<string> {
    return this.bridge.exportDocument(this.workspaceId);
  }

  async importDocument(document: unknown): Promise<ScoreSessionRead> {
    const session = await this.bridge.importDocument(this.workspaceId, document);
    if (!isScoreSessionRead(session)) throw new Error("文件打开结果无效");
    return session;
  }

  usesNativeFiles(): boolean {
    return this.bridge.nativeFiles === true;
  }

  async openNativeDocument(): Promise<{ session: ScoreSessionRead; name: string; savedVersion: number } | null> {
    if (!this.bridge.openNativeDocument) throw new Error("当前宿主不支持原生打开文件");
    const result = await this.bridge.openNativeDocument(this.workspaceId);
    if (result === null) return null;
    const session = this.session(result.session, "文件打开结果无效")!;
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion)
      || result.savedVersion < 0) throw new Error("文件打开结果无效");
    return { session, name: result.name, savedVersion: result.savedVersion };
  }

  async saveNativeDocument(suggestedName: string, saveAs: boolean): Promise<{
    session: ScoreSessionRead; name: string; savedVersion: number;
  } | null> {
    if (!this.bridge.saveNativeDocument) throw new Error("当前宿主不支持原生保存文件");
    const result = await this.bridge.saveNativeDocument(this.workspaceId, suggestedName, saveAs);
    if (result === null) return null;
    const session = this.session(result.session, "文件保存结果无效")!;
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion)
      || result.savedVersion < 0) throw new Error("文件保存结果无效");
    return { session, name: result.name, savedVersion: result.savedVersion };
  }

  onNativeCloseRequested(handler: () => boolean | Promise<boolean>): Promise<() => void> {
    return this.bridge.onNativeCloseRequested?.(handler) ?? Promise.resolve(() => {});
  }

  async closeNativeWindow(): Promise<void> {
    if (!this.bridge.closeNativeWindow) return;
    await this.bridge.closeNativeWindow(this.workspaceId);
  }
}
