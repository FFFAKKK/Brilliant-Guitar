import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { FileConnectionSettingsStore, SettingsStoreError, parseStoredConnectionSettings, type ConnectionSettingsStorePort, type StoredConnectionSettings } from "../src/server/connection-store.ts";
import { WindowsCredentialProtector } from "../src/server/credential-protector.ts";
import { isStandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { defaultConnectionSettings, parseConnectionSettings, parseSaveConnectionRequest } from "../src/contracts/connection-settings.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, textReply } from "./model-fixture.ts";

const scratchRoot = resolve(import.meta.dirname, "../../../.tmp/agent-settings-tests");
async function scratch(t: TestContext): Promise<string> {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(resolve(scratchRoot, "settings-"));
  t.after(async () => { const path = resolve(directory); assert.ok(!relative(scratchRoot, path).startsWith("..") && path !== scratchRoot); await rm(path, { recursive: true, force: true }); });
  return directory;
}
function configuration(baseUrl: string, modelId = "fixture-model") { return { providerId: "openai-compatible" as const, protocol: "chat-completions" as const, baseUrl, modelId }; }
function request(profileId: string | null, baseUrl: string, apiKey?: string, rememberCredential = false) {
  return { profileId, name: "本地测试连接", configuration: configuration(baseUrl), rememberCredential, ...(apiKey ? { apiKey } : {}) };
}

test("connection decoders reject invalid selection, duplicate IDs, future schemas and private public fields", () => {
  const settings = defaultConnectionSettings();
  assert.throws(() => parseConnectionSettings({ ...settings, schemaVersion: 2 }));
  assert.throws(() => parseConnectionSettings({ ...settings, selectedProfileId: "unknown" }));
  assert.throws(() => parseConnectionSettings({ ...settings, profiles: [settings.profiles[0], settings.profiles[0]] }));
  assert.throws(() => parseConnectionSettings({ ...settings, profiles: [{ ...settings.profiles[0], apiKey: "sentinel" }] }));
  assert.throws(() => parseConnectionSettings({ ...settings, profiles: [{ ...settings.profiles[0], recentModels: ["bad\nmodel"] }] }));
  assert.throws(() => parseSaveConnectionRequest({ ...request(null, "https://example.test"), extra: true }));
  assert.throws(() => parseSaveConnectionRequest({ ...request(null, "https://example.test"), profileId: "../../path" }));
  assert.throws(() => parseSaveConnectionRequest({ ...request(null, "https://example.test"), apiKey: "bad\nkey" }));
});

test("two supplier profiles keep independent credentials; disk restores selection but not memory-only keys", async (t) => {
  const directory = await scratch(t);
  const first = await createModelFixture(() => textReply("first supplier")); t.after(first.close);
  const second = await createModelFixture(() => textReply("second supplier")); t.after(second.close);
  const store = new FileConnectionSettingsStore(directory);
  let host = await StandaloneAgentHost.open({ settingsStore: store }); t.after(() => host.dispose());
  const firstId = host.getSnapshot().connections.selectedProfileId;
  await host.saveProfile(request(firstId, first.baseUrl, "first-private-sentinel"));
  await host.setEnabled(true);
  await host.saveProfile(request(null, second.baseUrl, "second-private-sentinel"));
  const secondId = host.getSnapshot().connections.selectedProfileId;
  assert.notEqual(firstId, secondId); assert.equal(host.getSnapshot().session.enabled, false);
  assert.equal(first.requests.length + second.requests.length, 0);
  await host.setEnabled(true); await host.session.submit("second service");
  assert.equal(second.requests[0]?.headers.authorization, "Bearer second-private-sentinel");
  await host.selectProfile(firstId); assert.equal(host.getSnapshot().session.enabled, false);
  await host.setEnabled(true); await host.session.submit("first service");
  assert.equal(first.requests[0]?.headers.authorization, "Bearer first-private-sentinel");
  assert.equal(isStandaloneAgentSnapshot(host.getSnapshot()), true);
  const disk = await readFile(store.path, "utf8");
  assert.ok(!disk.includes("private-sentinel")); assert.ok(!JSON.stringify(host.getSnapshot()).includes("private-sentinel"));
  await host.dispose();
  host = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) });
  assert.equal(host.getSnapshot().connections.selectedProfileId, firstId);
  assert.equal(host.getSnapshot().configuration.baseUrl, first.baseUrl);
  assert.equal(host.getSnapshot().credentialPresent, false); assert.equal(host.getSnapshot().session.enabled, false);
  assert.equal(first.requests.length + second.requests.length, 2);
  await host.deleteProfile(firstId);
  assert.equal(host.getSnapshot().connections.selectedProfileId, secondId);
  await assert.rejects(host.deleteProfile(secondId), /至少保留/);
});

test("Windows DPAPI remembered key survives restart, is target-bound, and can be forgotten", { skip: process.platform !== "win32" }, async (t) => {
  const directory = await scratch(t);
  const protector = new WindowsCredentialProtector();
  const sentinel = "dpapi-test-only-private-sentinel";
  const sealed = await protector.protect(sentinel, "profile-a-target-a");
  assert.equal(await protector.unprotect(sealed, "profile-a-target-a"), sentinel);
  await assert.rejects(protector.unprotect(sealed, "profile-b-target-b"));
  let store = new FileConnectionSettingsStore(directory);
  let host = await StandaloneAgentHost.open({ settingsStore: store, credentialProtector: protector }); t.after(() => host.dispose());
  const id = host.getSnapshot().connections.selectedProfileId;
  await host.saveProfile(request(id, "https://dpapi-fixture.example.test/v1", sentinel, true));
  const disk = await readFile(store.path, "utf8");
  const stored = parseStoredConnectionSettings(JSON.parse(disk));
  assert.ok(stored.profiles[0]?.sealedCredential); assert.ok(!disk.includes(sentinel));
  assert.ok(!JSON.stringify(host.getSnapshot()).includes(stored.profiles[0]!.sealedCredential!));
  await host.dispose();
  store = new FileConnectionSettingsStore(directory); host = await StandaloneAgentHost.open({ settingsStore: store, credentialProtector: protector });
  assert.equal(host.getSnapshot().credentialPresent, true); assert.equal(host.getSnapshot().session.enabled, false);
  await host.saveProfile(request(id, "https://dpapi-fixture.example.test/v1", undefined, false));
  assert.equal(host.getSnapshot().credentialPresent, true);
  assert.equal(parseStoredConnectionSettings(JSON.parse(await readFile(store.path, "utf8"))).profiles[0]?.sealedCredential, null);
  await host.dispose(); host = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) });
  assert.equal(host.getSnapshot().credentialPresent, false);
  await host.saveProfile(request(id, "https://dpapi-fixture.example.test/v1", sentinel, true));
  await host.configure(configuration("https://another-fixture.example.test/v1"));
  assert.equal(host.getSnapshot().credentialPresent, false);
  assert.equal(host.getSnapshot().connections.profiles[0]?.credentialRemembered, false);
});

test("write failure rolls back public and memory state, and pending mutation rejects concurrent changes", async (t) => {
  let fail = false; let release: (() => void) | null = null; let delay = false;
  const store: ConnectionSettingsStorePort = { kind: "file", load: async () => null, save: async (_settings: StoredConnectionSettings) => {
    if (fail) throw new SettingsStoreError("settings-unavailable", "test-only save failed");
    if (delay) await new Promise<void>((resolve) => { release = resolve; });
  } };
  const host = await StandaloneAgentHost.open({ settingsStore: store }); t.after(() => host.dispose());
  const id = host.getSnapshot().connections.selectedProfileId;
  await host.saveProfile(request(id, "https://first.example.test", "first-memory-key"));
  const before = host.getSnapshot(); fail = true;
  await assert.rejects(host.saveProfile(request(id, "https://other.example.test", "replacement-key")), /save failed/);
  assert.deepEqual(host.getSnapshot(), before);
  fail = false; delay = true;
  const pending = host.saveProfile(request(null, "https://other.example.test", "second-key"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(host.selectProfile(id), /停止当前任务/);
  await assert.rejects(host.setEnabled(true), /保存/);
  assert.ok(release); (release as () => void)(); await pending;
  assert.equal(host.getSnapshot().configuration.baseUrl, "https://other.example.test");
});

test("invalid and future disk files remain intact; live-directory lock rejects a second host", async (t) => {
  const directory = await scratch(t);
  const path = resolve(directory, "connections.json");
  for (const content of ["invalid-json", JSON.stringify({ schemaVersion: 99, selectedProfileId: "unknown", profiles: [] })]) {
    await writeFile(path, content, "utf8");
    await assert.rejects(StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) }), /保留原文件/);
    assert.equal(await readFile(path, "utf8"), content);
  }
  await rm(path);
  const first = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) }); t.after(() => first.dispose());
  await assert.rejects(StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) }), /已有Agent/);
  await first.saveProfile(request(first.getSnapshot().connections.selectedProfileId, "https://first.example.test"));
  assert.equal(parseStoredConnectionSettings(JSON.parse(await readFile(path, "utf8"))).profiles.length, 1);
});

test("profile HTTP commands enforce schemas and busy state, with v3 SSE metadata free of credentials", async (t) => {
  const fixture = await createModelFixture([{ hang: true }]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { await host.cancel(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const api = async (path: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() as unknown };
  };
  const id = host.getSnapshot().connections.selectedProfileId;
  assert.equal((await api("profiles/save", { ...request(id, fixture.baseUrl, "http-private-sentinel"), extra: true })).status, 400);
  const result = await api("profiles/save", request(id, fixture.baseUrl, "http-private-sentinel"));
  assert.equal(result.status, 200); assert.ok(isStandaloneAgentSnapshot(result.value)); assert.ok(!JSON.stringify(result.value).includes("http-private-sentinel"));
  assert.equal((await api("profiles/save", request(id, fixture.baseUrl, undefined, true))).status, 400);
  assert.equal((await api("profiles/select", { profileId: id, extra: true })).status, 400);
  await host.setEnabled(true); host.submit("hang");
  assert.equal((await api("profiles/save", request(id, fixture.baseUrl))).status, 409);
  assert.equal((await api("profiles/delete", { profileId: id })).status, 409);
  assert.equal((await api("profiles/select", { profileId: id })).status, 409);
});
