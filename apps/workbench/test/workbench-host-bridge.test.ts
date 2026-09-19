import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { NewScoreInput } from "../src/contracts/new-score.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { WorkbenchClient, resolveWorkbenchWorkspaceId } from "../src/services/workbench-client.ts";
import { BrowserPluginActivationStorage, BrowserPluginSettingsStorage, BrowserPluginStartupRecoveryStorage,
  BrowserWorkbenchHostBridge, TauriWorkbenchHostBridge,
  WorkbenchRequestError } from "../src/services/workbench-host-bridge.ts";
import type { WorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import type { CloseRequestedEvent, Window as TauriWindow } from "@tauri-apps/api/window";
import { DEFAULT_APPLICATION_SETTINGS } from "../src/contracts/application-settings.ts";
import { DEFAULT_WORKSPACE_CONFIGURATION } from "../src/contracts/workspace-configuration.ts";
import { readyPlaybackSource } from "./playback-fixture.ts";

const session: ScoreSessionRead = {
  documentId: "score-host-bridge",
  title: "宿主边界",
  measureCount: 1,
  documentVersion: 0,
  undoDepth: 0,
  redoDepth: 0,
  notation: {
    kind: "staff",
    partId: "part-1",
    staffId: "staff-1",
    clef: "treble", tempoBpm: 96, keySignatureChanges: [],
    measures: [{ id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, events: [], ruleWarnings: [] }],
  },
  playbackSource: readyPlaybackSource("score-host-bridge", 0, ["measure-1"]),
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("desktop workspace identity survives window sessions for crash recovery", () => {
  const firstSession = memoryStorage();
  const secondSession = memoryStorage();
  const persistent = memoryStorage();
  const created = "11111111-1111-4111-8111-111111111111";

  const first = resolveWorkbenchWorkspaceId(true, firstSession, persistent, () => created);
  const restored = resolveWorkbenchWorkspaceId(true, secondSession, persistent,
    () => "22222222-2222-4222-8222-222222222222");

  assert.equal(first, created);
  assert.equal(restored, created);
});

test("browser workspace identity remains isolated to its tab session", () => {
  const firstSession = memoryStorage();
  const secondSession = memoryStorage();
  const persistent = memoryStorage();

  const first = resolveWorkbenchWorkspaceId(false, firstSession, persistent,
    () => "11111111-1111-4111-8111-111111111111");
  const restored = resolveWorkbenchWorkspaceId(false, firstSession, persistent,
    () => "22222222-2222-4222-8222-222222222222");
  const anotherTab = resolveWorkbenchWorkspaceId(false, secondSession, persistent,
    () => "33333333-3333-4333-8333-333333333333");

  assert.equal(restored, first);
  assert.notEqual(anotherTab, first);
});

test("workbench client can use a non-HTTP desktop host bridge", async () => {
  const calls: string[] = [];
  const bridge: WorkbenchHostBridge = {
    async invokeCapability(request) { calls.push("capability"); return {
      status: "unavailable", invocationId: request.invocationId, capabilityId: request.capabilityId,
      contractVersion: request.contractVersion, code: "capability.test-unavailable", message: "not used",
    }; },
    async invokeAgentCapability(request) { calls.push("agent-capability"); return {
      status: "unavailable", invocationId: request.invocationId, capabilityId: request.capabilityId,
      contractVersion: request.contractVersion, code: "capability.test-unavailable", message: "not used",
    }; },
    async read() { calls.push("read"); return null; },
    async create(_workspaceId: string, _input: NewScoreInput) { calls.push("create"); return session; },
    async edit(_workspaceId: string, _input: ScoreEditRequest) { calls.push("edit"); return session; },
    async exportDocument() { calls.push("export"); return "{}"; },
    async importDocument() { calls.push("import"); return session; },
  };
  const client = new WorkbenchClient(bridge);

  assert.equal(await client.read(), null);
  assert.equal((await client.create({ title: "", measureCount: 1 }, crypto.randomUUID(), null)).documentId, session.documentId);
  assert.equal((await client.edit({ requestId: crypto.randomUUID(), documentId: session.documentId,
    expectedVersion: 0, action: { kind: "undo" } })).documentId, session.documentId);
  assert.equal(await client.exportDocument(), "{}");
  assert.equal((await client.importDocument({})).documentId, session.documentId);
  assert.deepEqual(calls, ["read", "create", "edit", "export", "import"]);
});

test("browser settings use one versioned document and preserve invalid source text", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
  const bridge = new BrowserWorkbenchHostBridge(storage);
  assert.deepEqual(await bridge.readApplicationSettings(), {
    settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: false,
  });
  const changed = { ...DEFAULT_APPLICATION_SETTINGS,
    ui: { ...DEFAULT_APPLICATION_SETTINGS.ui, animationsEnabled: false } };
  assert.deepEqual(await bridge.writeApplicationSettings(changed), changed);
  assert.deepEqual(await bridge.readApplicationSettings(), {
    settings: changed, persisted: true, recoveredFromInvalid: false,
  });

  values.set("brilliant.workbench.application-settings.v1", "{broken-json");
  assert.deepEqual(await bridge.readApplicationSettings(), {
    settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: true,
  });
  assert.equal(values.get("brilliant.workbench.application-settings.invalid.v1"), "{broken-json");
});

test("browser settings migrate pre-Agent v1 documents with the plugin disabled", async () => {
  const storage = memoryStorage();
  storage.setItem("brilliant.workbench.application-settings.v1", JSON.stringify({
    schemaVersion: 1,
    ui: { animationsEnabled: false, ruleWarningsVisible: true },
    editing: { deleteTimePolicy: "collapse" },
  }));
  const bridge = new BrowserWorkbenchHostBridge(storage);
  assert.deepEqual(await bridge.readApplicationSettings(), {
    settings: {
      schemaVersion: 1,
      ui: { animationsEnabled: false, ruleWarningsVisible: true },
      editing: { deleteTimePolicy: "collapse",
        noteInput: { retention: "rhythm", defaultDuration: { base: 4, dots: 0 } } },
      agent: { enabled: false, providerSelection: null },
      shortcuts: { profileName: "官方默认", bindings: {} },
    },
    persisted: true,
    recoveredFromInvalid: false,
  });
});

test("browser plugin activation storage keeps a versioned document and isolates invalid JSON", async () => {
  const storage = memoryStorage();
  const activation = new BrowserPluginActivationStorage(storage);
  assert.deepEqual(await activation.read(), {});
  const document = { schemaVersion: 1 as const, enabledPluginIds: ["brilliant.instrument.guitar"] };
  await activation.write(document);
  assert.deepEqual(await activation.read(), document);

  storage.setItem("brilliant.workbench.plugin-activation.v1", "{broken-json");
  assert.deepEqual(await activation.read(), {});
  assert.equal(storage.getItem("brilliant.workbench.plugin-activation.invalid.v1"), "{broken-json");
});

test("browser plugin startup recovery preserves the crash marker and isolates invalid JSON", async () => {
  const storage = memoryStorage();
  const recovery = new BrowserPluginStartupRecoveryStorage(storage);
  assert.deepEqual(await recovery.read(), {});
  const document = {
    schemaVersion: 1 as const,
    state: "launching" as const,
    attemptedPluginIds: ["brilliant.instrument.guitar"],
    lastKnownGoodPluginIds: ["brilliant.notation.foundation"],
  };
  await recovery.write(document);
  assert.deepEqual(await recovery.read(), document);

  storage.setItem("brilliant.workbench.plugin-startup-recovery.v1", "{broken-json");
  assert.deepEqual(await recovery.read(), {});
  assert.equal(storage.getItem("brilliant.workbench.plugin-startup-recovery.invalid.v1"), "{broken-json");
});

test("browser plugin settings storage preserves namespaced documents and isolates invalid JSON", async () => {
  const storage = memoryStorage();
  const settings = new BrowserPluginSettingsStorage(storage);
  assert.deepEqual(await settings.read(), {});
  const document = {
    "brilliant.instrument.guitar": { schemaVersion: 1, value: { tuning: "standard" } },
  };
  await settings.write(document);
  assert.deepEqual(await settings.read(), document);

  storage.setItem("brilliant.workbench.plugin-settings.v1", "{broken-json");
  assert.deepEqual(await settings.read(), {});
  assert.equal(storage.getItem("brilliant.workbench.plugin-settings.invalid.v1"), "{broken-json");
});

test("browser preview reports credential storage as unavailable and never persists a secret", async () => {
  const values = new Map<string, string>();
  const bridge = new BrowserWorkbenchHostBridge({
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  });
  const client = new WorkbenchClient(bridge);

  assert.deepEqual(await client.readAgentProviderCredentialStatus("provider.example"), {
    providerId: "provider.example",
    present: false,
    status: "unavailable",
    message: "系统凭据库仅在桌面宿主中可用",
  });
  await assert.rejects(() => client.setAgentProviderCredential("provider.example", "secret-token"),
    /浏览器开发宿主不会保存/);
  assert.equal([...values.values()].some((value) => value.includes("secret-token")), false);
});

test("browser workspace configuration is isolated by workspace identity and preserves invalid source text", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
  const bridge = new BrowserWorkbenchHostBridge(storage);
  const workspaceId = crypto.randomUUID();
  assert.deepEqual(await bridge.readWorkspaceConfiguration(workspaceId), {
    configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: false, recoveredFromInvalid: false,
  });
  const changed = { ...DEFAULT_WORKSPACE_CONFIGURATION, inspectorWidth: 360 };
  assert.deepEqual(await bridge.writeWorkspaceConfiguration(workspaceId, changed), changed);
  assert.deepEqual(await bridge.readWorkspaceConfiguration(workspaceId), {
    configuration: changed, persisted: true, recoveredFromInvalid: false,
  });

  values.set(`brilliant.workbench.workspace-configuration.v1.${workspaceId}`, "{broken-json");
  assert.deepEqual(await bridge.readWorkspaceConfiguration(workspaceId), {
    configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: false, recoveredFromInvalid: true,
  });
  assert.equal(values.get(`brilliant.workbench.workspace-configuration.invalid.v1.${workspaceId}`), "{broken-json");
});

test("browser bridge preserves structured issue codes and targets", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "容量不足", issue: {
    code: "editor.measure-capacity-exceeded", message: "容量不足", severity: "error", source: "editor",
    target: { scope: "measure", measureId: "measure-1" },
  } }), { status: 422, headers: { "Content-Type": "application/json" } });
  try {
    const bridge = new BrowserWorkbenchHostBridge();
    await assert.rejects(bridge.edit(crypto.randomUUID(), { requestId: crypto.randomUUID(), documentId: "document",
      expectedVersion: 0, action: { kind: "undo" } }), (error: unknown) =>
      error instanceof WorkbenchRequestError && error.status === 422
        && error.issue?.code === "editor.measure-capacity-exceeded"
        && error.issue.target.scope === "measure" && error.issue.target.measureId === "measure-1");
  } finally { globalThis.fetch = previous; }
});

test("browser preview describes a missing local host without implying Internet access", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("local host unavailable"); };
  try {
    const bridge = new BrowserWorkbenchHostBridge();
    await assert.rejects(bridge.read(crypto.randomUUID()), (error: unknown) =>
      error instanceof WorkbenchRequestError
        && error.message === "工作台服务暂时不可用，请重新加载"
        && error.issue?.code === "bridge.unavailable"
        && error.issue.retryable === true);
  } finally { globalThis.fetch = previous; }
});

test("tauri bridge sends versioned commands without HTTP and preserves structured errors", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_edit_v1") throw {
      message: "容量不足", status: 422, issue: {
        code: "editor.measure-capacity-exceeded", message: "容量不足", severity: "error", source: "editor",
        target: { scope: "measure", measureId: "measure-1" },
      },
    };
    return (command === "workbench_read_v1" ? session : null) as T;
  };
  const bridge = new TauriWorkbenchHostBridge(invoke);
  const workspaceId = crypto.randomUUID();
  assert.equal(await bridge.read(workspaceId), session);
  await assert.rejects(bridge.edit(workspaceId, {
    requestId: crypto.randomUUID(), documentId: session.documentId, expectedVersion: 0,
    action: { kind: "append", measureId: "measure-1", anchor: { kind: "start" },
      duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  }), (error: unknown) => error instanceof WorkbenchRequestError && error.status === 422
    && error.issue?.code === "editor.measure-capacity-exceeded");
  assert.equal(calls[0]?.command, "workbench_read_v1");
  assert.deepEqual(calls[0]?.args, { workspaceId });
  assert.equal(calls[1]?.command, "workbench_edit_v1");
  assert.deepEqual((calls[1]?.args?.request as Record<string, unknown>).workspaceId, workspaceId);
});

test("tauri settings commands keep configuration outside score requests", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const changed = { ...DEFAULT_APPLICATION_SETTINGS,
    editing: { ...DEFAULT_APPLICATION_SETTINGS.editing, deleteTimePolicy: "collapse" as const } };
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_read_settings_v1") return {
      settings: changed, persisted: true, recoveredFromInvalid: false,
    } as T;
    if (command === "workbench_write_settings_v1") return changed as T;
    if (command === "workbench_reset_settings_v1") return DEFAULT_APPLICATION_SETTINGS as T;
    throw new Error("unexpected command");
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(invoke));
  assert.equal((await client.readApplicationSettings()).settings.editing.deleteTimePolicy, "collapse");
  assert.deepEqual(await client.writeApplicationSettings(changed), changed);
  assert.deepEqual(await client.resetApplicationSettings(), DEFAULT_APPLICATION_SETTINGS);
  assert.deepEqual(calls, [
    { command: "workbench_read_settings_v1", args: {} },
    { command: "workbench_write_settings_v1", args: { settings: changed } },
    { command: "workbench_reset_settings_v1", args: {} },
  ]);
});

test("tauri credential commands expose status but never return the secret", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  let present = false;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_agent_provider_credential_status_v1") return {
      providerId: args?.providerId, present, status: present ? "configured" : "missing",
      message: present ? "Provider 凭据已保存在系统凭据库" : "尚未配置 Provider 凭据",
    } as T;
    if (command === "workbench_agent_provider_set_credential_v1") {
      present = true;
      return { providerId: args?.providerId, present: true, status: "configured",
        message: "Provider 凭据已保存在系统凭据库" } as T;
    }
    if (command === "workbench_agent_provider_delete_credential_v1") {
      present = false;
      return { providerId: args?.providerId, present: false, status: "missing",
        message: "尚未配置 Provider 凭据" } as T;
    }
    throw new Error("unexpected command");
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(invoke));

  assert.equal((await client.readAgentProviderCredentialStatus("provider.example")).present, false);
  const saved = await client.setAgentProviderCredential("provider.example", "secret-token");
  assert.deepEqual(saved, { providerId: "provider.example", present: true, status: "configured",
    message: "Provider 凭据已保存在系统凭据库" });
  assert.equal(Object.values(saved).includes("secret-token"), false);
  assert.equal((await client.deleteAgentProviderCredential("provider.example")).present, false);
  assert.deepEqual(calls, [
    { command: "workbench_agent_provider_credential_status_v1", args: { providerId: "provider.example" } },
    { command: "workbench_agent_provider_set_credential_v1",
      args: { providerId: "provider.example", secret: "secret-token" } },
    { command: "workbench_agent_provider_delete_credential_v1", args: { providerId: "provider.example" } },
  ]);
});

test("credential client rejects invalid identifiers, secrets, and secret-bearing responses", async () => {
  const client = new WorkbenchClient({
    async invokeCapability() { return null; },
    async invokeAgentCapability() { return null; },
    async read() { return null; },
    async create() { return null; },
    async edit() { return null; },
    async exportDocument() { return ""; },
    async importDocument() { return null; },
    async setAgentProviderCredential(providerId) {
      return { providerId, present: true, status: "configured", message: "已配置", secret: "leaked" };
    },
  });

  await assert.rejects(() => client.readAgentProviderCredentialStatus("Invalid Provider"), /标识无效/);
  await assert.rejects(() => client.setAgentProviderCredential("provider.example", " line-break"), /格式无效/);
  await assert.rejects(() => client.setAgentProviderCredential("provider.example", "secret-token"), /结果无效/);
});

test("tauri workspace configuration commands remain workspace-scoped", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const changed = { ...DEFAULT_WORKSPACE_CONFIGURATION, inspectorWidth: 360 };
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_read_workspace_configuration_v1") return {
      configuration: changed, persisted: true, recoveredFromInvalid: false,
    } as T;
    if (command === "workbench_write_workspace_configuration_v1") return changed as T;
    if (command === "workbench_reset_workspace_configuration_v1") return DEFAULT_WORKSPACE_CONFIGURATION as T;
    throw new Error("unexpected command");
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(invoke));
  assert.equal((await client.readWorkspaceConfiguration()).configuration.inspectorWidth, 360);
  assert.deepEqual(await client.writeWorkspaceConfiguration(changed), changed);
  assert.deepEqual(await client.resetWorkspaceConfiguration(), DEFAULT_WORKSPACE_CONFIGURATION);
  assert.equal(calls.length, 3);
  const workspaceId = calls[0]?.args?.workspaceId;
  assert.equal(typeof workspaceId, "string");
  assert.deepEqual(calls, [
    { command: "workbench_read_workspace_configuration_v1", args: { workspaceId } },
    { command: "workbench_write_workspace_configuration_v1", args: { workspaceId, configuration: changed } },
    { command: "workbench_reset_workspace_configuration_v1", args: { workspaceId } },
  ]);
});

test("tauri native file commands return the persisted version and cancellation", async () => {
  const invoked: string[] = [];
  const invoke = async <T>(command: string): Promise<T> => {
    invoked.push(command);
    if (command === "workbench_open_file_v1") return null as T;
    if (command === "workbench_save_file_v1") {
      return { session, name: "宿主边界", savedVersion: session.documentVersion } as T;
    }
    throw new Error("unexpected command");
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(invoke));
  assert.equal(client.usesNativeFiles(), true);
  assert.equal(await client.openNativeDocument(), null);
  assert.deepEqual(await client.saveNativeDocument("宿主边界", true), {
    session, name: "宿主边界", savedVersion: session.documentVersion,
  });
  assert.deepEqual(invoked, ["workbench_open_file_v1", "workbench_save_file_v1"]);
});

test("tauri close requests are prevented until Rust closes the workspace", async () => {
  const invoked: Array<{ command: string; args?: Record<string, unknown> }> = [];
  let closeHandler: ((event: CloseRequestedEvent) => void | Promise<void>) | undefined;
  let nativeCloseCount = 0;
  const window = {
    async onCloseRequested(handler: (event: CloseRequestedEvent) => void | Promise<void>) {
      closeHandler = handler;
      return () => { closeHandler = undefined; };
    },
    async close() { nativeCloseCount += 1; },
  } satisfies Pick<TauriWindow, "onCloseRequested" | "close">;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    invoked.push({ command, ...(args ? { args } : {}) });
    return true as T;
  };
  const bridge = new TauriWorkbenchHostBridge(invoke, () => window);
  const dispose = await bridge.onNativeCloseRequested(() => false);
  let prevented = 0;
  await closeHandler?.({ preventDefault: () => { prevented += 1; } } as CloseRequestedEvent);
  assert.equal(prevented, 1);

  const workspaceId = crypto.randomUUID();
  await bridge.closeNativeWindow(workspaceId);
  assert.deepEqual(invoked, [{ command: "workbench_close_v1", args: { workspaceId } }]);
  assert.equal(nativeCloseCount, 1);

  await closeHandler?.({ preventDefault: () => { prevented += 1; } } as CloseRequestedEvent);
  assert.equal(prevented, 1, "the forced close is allowed through without a second prompt");
  dispose();
});
