import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { DEFAULT_MODEL_INPUT_POLICY } from "@brilliant-guitar/agent-runtime";
import { defaultConnectionSettings, parseConnectionSettings, parseSaveConnectionRequest, parseSaveConnectionRequestV2 } from "../src/contracts/connection-settings.ts";
import { isStandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { FileConnectionSettingsStore, parseStoredConnectionSettings, type ConnectionSettingsStorePort } from "../src/server/connection-store.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";

const configuration = (baseUrl: string, modelId = "fixture-model") => ({ providerId: "deepseek" as const, protocol: "chat-completions" as const, baseUrl, modelId });
const policy = (inputTokenBudget = 16384, declaredContextWindow: number | null = null) => ({ schemaVersion: 1 as const, inputTokenBudget, declaredContextWindow });
function save(host: StandaloneAgentHost, baseUrl: string, inputTokenBudget = 16384) {
  return { schemaVersion: 2, profileId: host.getSnapshot().connections.selectedProfileId, name: "预算测试", configuration: configuration(baseUrl),
    inputPolicy: policy(inputTokenBudget), rememberCredential: false, apiKey: "budget-fixture-only-secret" };
}
async function scratch(t: TestContext) {
  const root = resolve(import.meta.dirname, "../../../.tmp/agent-input-budget-tests");
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(resolve(root, "budget-"));
  t.after(async () => { assert.ok(!relative(root, directory).startsWith("..") && directory !== root); await rm(directory, { recursive: true, force: true }); });
  return directory;
}

test("v2 save/public decoders require exact policies; old endpoints reject v2 fields and v4 snapshots", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const valid = save(host, "https://fixture.example.test/v1");
  assert.deepEqual(parseSaveConnectionRequestV2(valid).inputPolicy, policy());
  for (const value of [{ ...valid, schemaVersion: 3 }, { ...valid, extra: true }, { ...valid, apiKey: "bad\nkey" },
    { ...valid, inputPolicy: { ...policy(), extra: true } }, { ...valid, inputPolicy: policy(16384, 16384) }]) assert.throws(() => parseSaveConnectionRequestV2(value));
  assert.throws(() => parseSaveConnectionRequest(valid));
  const settings = defaultConnectionSettings();
  assert.equal(settings.schemaVersion, 2); assert.throws(() => parseConnectionSettings({ ...settings, schemaVersion: 1 }));
  assert.throws(() => parseConnectionSettings({ ...settings, profiles: settings.profiles.map(({ inputPolicy: _policy, ...profile }) => profile) }));
  assert.equal(isStandaloneAgentSnapshot({ ...host.getSnapshot(), schemaVersion: 4 }), false);
  assert.equal(isStandaloneAgentSnapshot({ ...host.getSnapshot(), connections: { ...settings, schemaVersion: 1 } }), false);
});

test("strict v1 migration is memory-only until explicit save; invalid old/future fields preserve original bytes", async (t) => {
  const directory = await scratch(t); const path = resolve(directory, "connections.json");
  const publicSettings = defaultConnectionSettings();
  const old = { ...publicSettings, schemaVersion: 1, profiles: publicSettings.profiles.map(({ credentialRemembered: _key, inputPolicy: _policy, ...profile }) => ({ ...profile, sealedCredential: null })) };
  const raw = JSON.stringify(old, null, 3) + "\n"; await writeFile(path, raw);
  let host = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) });
  t.after(() => host.dispose()); assert.equal(host.getSnapshot().schemaVersion, 5);
  assert.deepEqual(host.getSnapshot().connections.profiles[0]?.inputPolicy, DEFAULT_MODEL_INPUT_POLICY);
  assert.equal(host.getSnapshot().session.enabled, false); assert.equal(await readFile(path, "utf8"), raw);
  await host.dispose(); assert.equal(await readFile(path, "utf8"), raw);
  for (const value of [{ ...old, future: true }, { ...old, schemaVersion: 3 },
    { ...old, profiles: [{ ...old.profiles[0], inputPolicy: policy() }] },
    { ...old, profiles: [{ ...old.profiles[0], configuration: { ...old.profiles[0]!.configuration, private: true } }] },
    { ...old, profiles: [{ ...old.profiles[0], recentModels: ["bad\nmodel"] }] }]) {
    const bytes = JSON.stringify(value); await writeFile(path, bytes);
    await assert.rejects(StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) }), /保留原文件/);
    assert.equal(await readFile(path, "utf8"), bytes);
  }
  await writeFile(path, raw); host = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory) });
  await host.configure(host.getSnapshot().configuration);
  const stored = JSON.parse(await readFile(path, "utf8"));
  assert.equal(stored.schemaVersion, 2); assert.deepEqual(parseStoredConnectionSettings(stored).profiles[0]?.inputPolicy, DEFAULT_MODEL_INPUT_POLICY);
});

test("policy follows profile and model; legacy same-model/key updates preserve it, write failures roll back it", async (t) => {
  let fail = false;
  const store: ConnectionSettingsStorePort = { kind: "memory", load: async () => null, save: async () => { if (fail) throw new Error("save failure"); } };
  const host = await StandaloneAgentHost.open({ settingsStore: store }); t.after(() => host.dispose());
  const base = "https://fixture.example.test/v1";
  await host.saveProfileV2(save(host, base)); await host.setEnabled(true);
  const selected = () => host.getSnapshot().connections.profiles.find((p) => p.id === host.getSnapshot().connections.selectedProfileId)!;
  await host.saveCredential("replacement-test-key"); assert.deepEqual(selected().inputPolicy, policy());
  await host.configure(configuration(base)); assert.deepEqual(selected().inputPolicy, policy());
  assert.equal(host.getSnapshot().session.enabled, true);
  const before = host.getSnapshot(); fail = true;
  await assert.rejects(host.saveProfileV2({ ...save(host, base, 32768), inputPolicy: policy(32768, 65536) }), /save failure/);
  assert.deepEqual(host.getSnapshot(), before); fail = false;
  await host.saveProfileV2({ ...save(host, base, 32768), inputPolicy: policy(32768, 65536) });
  assert.deepEqual(selected().inputPolicy, policy(32768, 65536)); assert.equal(host.getSnapshot().credentialPresent, true);
  await host.configure(configuration(base, "other-model"));
  assert.deepEqual(selected().inputPolicy, DEFAULT_MODEL_INPUT_POLICY); assert.equal(host.getSnapshot().credentialPresent, true);
  await host.saveProfileV2({ ...save(host, base), configuration: configuration(base, "other-model") });
  const first = selected().id;
  await host.saveProfileV2({ ...save(host, base, 24576), profileId: null }); const second = selected().id;
  await host.selectProfile(first); assert.deepEqual(selected().inputPolicy, policy());
  await host.selectProfile(second); assert.deepEqual(selected().inputPolicy, policy(24576));
  await host.configure(configuration("https://other.example.test/v1"));
  assert.deepEqual(selected().inputPolicy, DEFAULT_MODEL_INPUT_POLICY); assert.equal(host.getSnapshot().credentialPresent, false);
});

test("v2 HTTP save is strict/read-only until submit and busy during a Run/probe", async (t) => {
  let reached!: () => void; let ready = new Promise<void>((resolve) => { reached = resolve; });
  const fixture = await createModelFixture(() => { reached(); return { hang: true }; }); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host }); await listenForTest(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { await host.cancel(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const api = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/connections/profiles-v2`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const request = save(host, fixture.baseUrl);
  const before = host.getSnapshot(); assert.equal((await api({ ...request, inputPolicy: policy(16384, 17000) })).status, 400);
  assert.deepEqual(host.getSnapshot(), before);
  const response = await api(request); assert.equal(response.status, 200); assert.ok(isStandaloneAgentSnapshot(await response.json()));
  await fetch(`http://127.0.0.1:${address.port}/api/session`); assert.equal(fixture.requests.length, 0);
  await host.setEnabled(true); const pending = host.session.submit("wait"); await ready;
  const current = host.getSnapshot(); const report = host.getContextSelection(); assert.equal(report?.budget.tokenBudget, 16384);
  assert.equal((await api({ ...request, inputPolicy: policy(32768) })).status, 409);
  await assert.rejects(host.configure(configuration(fixture.baseUrl, "other")), /停止当前任务/);
  assert.deepEqual(host.getSnapshot().connections, current.connections);
  assert.deepEqual(host.getSnapshot().configuration, current.configuration);
  assert.equal(host.getModelInput()?.inputTokenBudget, 16384);
  await host.cancel(); await pending;
  ready = new Promise<void>((resolve) => { reached = resolve; }); const probe = host.testConnection(); await ready;
  assert.equal((await api(request)).status, 409); await host.cancel(); await probe;
  assert.equal(host.getContextSelection(), null); assert.equal(fixture.requests.length, 2);
});

for (const character of ["甲", "A"]) for (const inputTokenBudget of [8192, 16384]) {
  test(`actual HTTP ${character === "甲" ? "Chinese" : "ASCII"} 7465-character pages at ${inputTokenBudget} preserve complete tool pairs and actual budget`, async (t) => {
    let resourceId = "";
    const text = character.repeat(7465);
    const fixture = await createModelFixture((request, count) => {
      const wire = request.body.messages as { role: string; content: string }[];
      const lastTool = wire.filter((m) => m.role === "tool").at(-1);
      const result = lastTool ? (JSON.parse(lastTool.content) as { data: { nextStart: number; eof: boolean } }).data : null;
      return result?.eof ? textReply("资料已读完，给出完整回答。")
        : toolReply("tool_1", JSON.stringify({ resourceId, start: result?.nextStart ?? 0, maxCharacters: 4096 }), `page-${count}`);
    }); t.after(fixture.close);
    const host = new StandaloneAgentHost(); t.after(() => host.dispose());
    await host.saveProfileV2(save(host, fixture.baseUrl, inputTokenBudget)); await host.setEnabled(true);
    host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "预算验收.md", text });
    resourceId = host.getSnapshot().resources.items[0]!.resourceId;
    const outcome = await host.session.submit("读完全部资料后回答，请继续读取到eof。");
    const overflow = character === "甲" && inputTokenBudget === 8192;
    assert.equal(host.getSnapshot().session.status, overflow ? "failed" : "completed");
    assert.equal(fixture.requests.length, overflow ? 2 : 3);
    assert.equal(outcome.run.invocations.length, 2); assert.ok(outcome.run.invocations.every((i) => i.state.status === "succeeded"));
    assert.ok(host.getSnapshot().activities.items.every((i) => i.status === "completed"));
    const diagnostic = host.getModelInput(); assert.ok(diagnostic);
    assert.equal(diagnostic.inputTokenBudget, inputTokenBudget); assert.equal(diagnostic.status, overflow ? "budget-exceeded" : "ready");
    assert.equal(diagnostic.maxOutputTokens, 1500); assert.equal(diagnostic.timeoutMs, 45000);
    const report = host.getContextSelection(); assert.ok(report);
    assert.equal(report.budget.tokenBudget, inputTokenBudget); assert.equal(report.selected.filter((i) => i.reason === "executed-result").length, 2);
    if (overflow) assert.ok(diagnostic.estimatedInputTokens > inputTokenBudget);
    else {
      assert.equal(outcome.response, "资料已读完，给出完整回答。");
      const wire = fixture.requests[2]!.body.messages as { role: string; content: string; tool_call_id?: string; tool_calls?: { id: string }[] }[];
      const results = wire.filter((m) => m.role === "tool");
      assert.deepEqual(results.map((m) => m.tool_call_id), ["page-1", "page-2"]);
      assert.deepEqual(wire.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []), ["page-1", "page-2"]);
      assert.equal(results.map((m) => (JSON.parse(m.content) as { data: { text: string } }).data.text).join(""), text);
      assert.equal(fixture.requests[2]!.body.max_tokens, 1500);
      const frozen = host.getContextSelection(); await host.testConnection(); assert.equal(host.getContextSelection(), frozen);
      const probe = fixture.requests[3]!.body; assert.equal(probe.tools, undefined); assert.ok(!JSON.stringify(probe).includes(resourceId));
    }
  });
}
