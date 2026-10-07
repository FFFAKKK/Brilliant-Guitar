import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseSessionLibrary, type AgentSessionLibrary, type SessionStorePort } from "@brilliant-guitar/agent-runtime";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { FileConnectionSettingsStore } from "../src/server/connection-store.ts";
import { FileSessionStore } from "../src/server/session-store.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { isStandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { createModelFixture, textReply } from "./model-fixture.ts";

const scratchRoot = resolve(import.meta.dirname, "../../../.tmp/agent-session-tests");
async function scratch(t: TestContext): Promise<string> {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(resolve(scratchRoot, "sessions-"));
  t.after(async () => { const path = resolve(directory); assert.ok(!relative(scratchRoot, path).startsWith("..") && path !== scratchRoot); await rm(path, { recursive: true, force: true }); });
  return directory;
}
async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 120; ++i) { if (await predicate()) return; await delay(25); }
  throw new Error("Test state did not settle");
}
const key = "session-test-private-key-only-on-host";
async function configure(host: StandaloneAgentHost, baseUrl: string): Promise<void> {
  await host.configure({ providerId: "openai-compatible", protocol: "chat-completions", modelId: "fixture-model", baseUrl });
  await host.saveCredential(key); await host.setEnabled(true);
}

test("disk restart retains more than 16 turns and rebuilds isolated model history without automatic requests", async (t) => {
  const directory = await scratch(t);
  const fixture = await createModelFixture((_request, count) => textReply(count === 1 ? "完整内容".repeat(300) + "最早回复尾部标记" : `reply-${count}`)); t.after(fixture.close);
  const openHost = () => StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory), sessionStore: new FileSessionStore(directory) });
  let host = await openHost(); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl);
  const firstId = host.getSnapshot().session.sessionId;
  for (let i = 0; i < 20; ++i) await host.session.submit(`original-turn-${i}-marker`);
  assert.equal(host.getSnapshot().session.messages.length, 40);
  assert.ok(host.getSnapshot().session.messages[1]?.content.endsWith("最早回复尾部标记"));
  assert.ok(!JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("original-turn-0-marker"));
  assert.equal(host.getSnapshot().session.omittedHistoryTurns, 3);
  const path = resolve(directory, "sessions.json");
  const disk = await readFile(path, "utf8");
  assert.ok(!disk.includes(key)); assert.ok(!JSON.stringify(host.getSnapshot()).includes(key));
  assert.equal(parseSessionLibrary(JSON.parse(disk)).sessions[0]?.messages.length, 40);
  await host.dispose(); host = await openHost();
  assert.equal(fixture.requests.length, 20);
  assert.equal(host.getSnapshot().session.enabled, false); assert.equal(host.getSnapshot().credentialPresent, false);
  assert.equal(host.getSnapshot().session.sessionId, firstId); assert.equal(host.getSnapshot().session.messages.length, 40);
  await host.saveCredential(key); await host.setEnabled(true); await host.session.submit("after-restart-marker");
  assert.ok(JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("reply-20"));
  await host.reset();
  const secondId = host.getSnapshot().session.sessionId;
  assert.notEqual(secondId, firstId); assert.equal(host.getSnapshot().conversations.items.length, 2);
  await host.session.submit("other-session-marker");
  assert.ok(!JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("after-restart-marker"));
  await host.selectConversation(firstId); await host.session.submit("first-session-continuation");
  assert.ok(!JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("other-session-marker"));
  await host.renameConversation(firstId, "持续学习 Agent");
  await host.archiveConversation(firstId, true);
  assert.equal(host.getSnapshot().session.sessionId, secondId);
  await assert.rejects(host.selectConversation(firstId), /归档/);
  await host.archiveConversation(firstId, false); await host.selectConversation(firstId);
  assert.equal(host.getSnapshot().conversations.items.find((item) => item.sessionId === firstId)?.title, "持续学习 Agent");
  assert.ok(isStandaloneAgentSnapshot(host.getSnapshot()));
  await host.dispose(); host = await openHost();
  assert.equal(host.getSnapshot().session.messages.length, 44);
  assert.equal(host.getSnapshot().session.enabled, false);
  assert.equal(host.getSnapshot().conversations.items.length, 2);
});

test("streaming checkpoint restores as interrupted after a crash and never resumes or replays", async (t) => {
  const directory = await scratch(t);
  const fixture = await createModelFixture([{ hang: true }, textReply("new successful output")]); t.after(fixture.close);
  const openHost = () => StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(directory), sessionStore: new FileSessionStore(directory) });
  let host = await openHost(); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl); host.submit("crash-input-must-not-be-model-memory");
  await waitUntil(() => host.getSnapshot().session.messages[1]?.content === "尚未结束");
  const path = resolve(directory, "sessions.json");
  let crashCheckpoint = "";
  await waitUntil(async () => { crashCheckpoint = await readFile(path, "utf8"); return crashCheckpoint.includes("尚未结束"); });
  assert.equal(parseSessionLibrary(JSON.parse(crashCheckpoint)).sessions[0]?.messages[1]?.status, "streaming");
  await host.dispose();
  // Replay the durable pre-crash checkpoint, not the graceful cancellation written by dispose.
  await writeFile(path, crashCheckpoint, "utf8");
  host = await openHost();
  assert.equal(fixture.requests.length, 1);
  assert.equal(host.getSnapshot().session.messages[1]?.status, "interrupted");
  assert.equal(host.getSnapshot().session.messages[1]?.content, "尚未结束");
  assert.equal(host.getSnapshot().session.enabled, false);
  assert.equal(parseSessionLibrary(JSON.parse(await readFile(path, "utf8"))).sessions[0]?.messages[1]?.status, "interrupted");
  await host.saveCredential(key); await host.setEnabled(true); await host.session.submit("explicit new request");
  assert.ok(!JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("crash-input-must-not-be-model-memory"));
});

test("new conversation cancels old work but retains its stopped transcript; active switching is rejected", async (t) => {
  const directory = await scratch(t);
  const fixture = await createModelFixture([{ hang: true }, textReply("new conversation reply")]); t.after(fixture.close);
  const host = await StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) }); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl);
  const oldId = host.getSnapshot().session.sessionId;
  host.submit("old active conversation");
  await waitUntil(() => host.getSnapshot().session.messages[1]?.content === "尚未结束");
  await assert.rejects(host.selectConversation(oldId), /停止/);
  await assert.rejects(host.renameConversation(oldId, "busy"), /停止/);
  await assert.rejects(host.archiveConversation(oldId, true), /停止/);
  await host.reset();
  assert.equal(host.getSnapshot().conversations.items.length, 2);
  await host.session.submit("new conversation marker");
  assert.ok(!JSON.stringify(fixture.requests.at(-1)?.body.messages).includes("old active conversation"));
  await host.selectConversation(oldId);
  assert.equal(host.getSnapshot().session.messages[1]?.status, "cancelled");
  assert.equal(host.getSnapshot().session.messages[1]?.content, "尚未结束");
});

test("failed session saves keep old selection, expose unsaved state, and block generation until disk is writable", async (t) => {
  let fail = false;
  let saved: AgentSessionLibrary | null = null;
  const store: SessionStorePort = { kind: "file", load: async () => null, save: async (value) => { if (fail) throw new Error("simulated disk failure"); saved = parseSessionLibrary(value); } };
  const fixture = await createModelFixture([textReply("retained successful output")]); t.after(fixture.close);
  const host = await StandaloneAgentHost.open({ sessionStore: store }); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl);
  const firstId = host.getSnapshot().session.sessionId;
  fail = true;
  await assert.rejects(host.reset(), /尚未保存/);
  assert.equal(host.getSnapshot().session.sessionId, firstId); assert.equal(host.getSnapshot().conversations.items.length, 1);
  assert.ok(host.getSnapshot().conversations.notice);
  await assert.rejects(host.session.submit("blocked before model"));
  assert.equal(fixture.requests.length, 0); assert.equal(host.getSnapshot().session.messages[1]?.status, "failed");
  fail = false; await host.retrySessionSave();
  assert.equal(host.getSnapshot().conversations.notice, null);
  await host.session.submit("disk recovered");
  assert.equal(fixture.requests.length, 1);
  assert.ok(!JSON.stringify(fixture.requests[0]?.body.messages).includes("blocked before model"));
  assert.ok(saved); assert.equal((saved as AgentSessionLibrary).sessions[0]?.messages[3]?.content, "retained successful output");
});

test("invalid, null and future session files are preserved and an active file lock prevents another host", async (t) => {
  const directory = await scratch(t);
  const path = resolve(directory, "sessions.json");
  for (const content of ["invalid-json", "null", JSON.stringify({ schemaVersion: 99, selectedSessionId: "future", sessions: [] })]) {
    await writeFile(path, content, "utf8");
    await assert.rejects(StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) }), /保留原文件/);
    assert.equal(await readFile(path, "utf8"), content);
  }
  await rm(path);
  const host = await StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) }); t.after(() => host.dispose());
  await assert.rejects(StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) }), /已被使用/);
  await host.renameConversation(host.getSnapshot().session.sessionId, "first lock owner remains usable");
  assert.equal(parseSessionLibrary(JSON.parse(await readFile(path, "utf8"))).sessions[0]?.title, "first lock owner remains usable");
});

test("terminal save failure retains full output in memory and explicit save repairs disk without another model call", async (t) => {
  let failTerminal = true;
  let saved: AgentSessionLibrary | null = null;
  const store: SessionStorePort = { kind: "file", load: async () => null, save: async (value) => {
    if (failTerminal && value.sessions[0]?.messages.at(-1)?.status === "complete") throw new Error("terminal save failed");
    saved = parseSessionLibrary(value);
  } };
  const fixture = await createModelFixture([textReply("complete output remains visible")]); t.after(fixture.close);
  const host = await StandaloneAgentHost.open({ sessionStore: store }); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl);
  const result = await host.session.submit("request");
  assert.equal(result.run.state.lifecycle, "terminal");
  assert.equal(host.getSnapshot().session.messages[1]?.content, "complete output remains visible");
  assert.equal(host.getSnapshot().session.messages[1]?.status, "complete");
  assert.ok(host.getSnapshot().conversations.notice);
  assert.ok(saved); assert.equal((saved as AgentSessionLibrary).sessions[0]?.messages[1]?.status, "streaming");
  failTerminal = false; await host.retrySessionSave();
  assert.equal(host.getSnapshot().conversations.notice, null);
  assert.equal((saved as AgentSessionLibrary).sessions[0]?.messages[1]?.status, "complete");
  assert.equal(fixture.requests.length, 1);
});

test("failed partial model output remains readable and is excluded from the next successful context", async (t) => {
  const fixture = await createModelFixture([textReply("partial-output-marker", { unfinished: true }), textReply("next complete reply")]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl); await host.session.submit("partial-failed-input-marker");
  assert.equal(host.getSnapshot().session.messages[1]?.status, "failed");
  assert.equal(host.getSnapshot().session.messages[1]?.content, "partial-output-marker");
  await host.session.submit("new explicit input");
  assert.ok(!JSON.stringify(fixture.requests[1]?.body.messages).includes("partial-failed-input-marker"));
  assert.equal(host.getSnapshot().session.messages.length, 4);
});

test("metadata mutations serialize with writes and leave the original active conversation visible until save completes", async (t) => {
  let pause = false;
  let release!: () => void;
  let started!: () => void;
  const writing = new Promise<void>((resolve) => { started = resolve; });
  const store: SessionStorePort = { kind: "file", load: async () => null, save: async () => { if (pause) { pause = false; started(); await new Promise<void>((resolve) => { release = resolve; }); } } };
  const host = await StandaloneAgentHost.open({ sessionStore: store }); t.after(() => host.dispose());
  const oldId = host.getSnapshot().session.sessionId;
  pause = true;
  const pending = host.reset(); await writing;
  assert.equal(host.getSnapshot().session.sessionId, oldId);
  await assert.rejects(host.renameConversation(oldId, "overlap"), /停止/);
  await assert.rejects(host.reset(), /保存/);
  release(); await pending;
  assert.notEqual(host.getSnapshot().session.sessionId, oldId);
  assert.ok(isStandaloneAgentSnapshot(host.getSnapshot()));
});

test("conversation HTTP commands validate exact bodies, publish v3 and preserve metadata on failure", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const api = async (path: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() as unknown };
  };
  const id = host.getSnapshot().session.sessionId;
  assert.equal((await api("conversations/select", { sessionId: id, extra: true })).status, 400);
  assert.equal((await api("conversations/rename", { sessionId: id, title: "new name", extra: true })).status, 400);
  assert.equal((await api("conversations/rename", { sessionId: id, title: "\n" })).status, 400);
  assert.equal((await api("conversations/archive", { sessionId: id, archived: "true" })).status, 400);
  const renamed = await api("conversations/rename", { sessionId: id, title: "HTTP会话" });
  assert.equal(renamed.status, 200); assert.ok(isStandaloneAgentSnapshot(renamed.value)); assert.equal(renamed.value.schemaVersion, 3);
  assert.equal((await api("conversations/archive", { sessionId: id, archived: true })).status, 200);
  assert.equal(host.getSnapshot().conversations.items.length, 2);
  assert.equal((await api("conversations/select", { sessionId: id })).status, 400);
  assert.equal((await api("conversations/archive", { sessionId: id, archived: false })).status, 200);
  const selected = await api("conversations/select", { sessionId: id });
  assert.equal(selected.status, 200); assert.ok(isStandaloneAgentSnapshot(selected.value));
  assert.equal(isStandaloneAgentSnapshot({ ...selected.value, conversations: { ...selected.value.conversations, selectedSessionId: "different" } }), false);
  assert.equal(isStandaloneAgentSnapshot({ ...selected.value, conversations: { ...selected.value.conversations, apiKey: key } }), false);
});
