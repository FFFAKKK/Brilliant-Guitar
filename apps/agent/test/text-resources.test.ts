import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentToolRegistry, type RegisteredAgentTool } from "@brilliant-guitar/agent-runtime";
import { decodeTextResourceFile, parseAddTextResource, parseRemoveTextResource, isReadTextResourceInput,
  isTextResourcesSnapshot, MAX_TEXT_RESOURCE_BYTES, MAX_TEXT_PAGE_JSON_BYTES } from "../src/contracts/resources.ts";
import { isStandaloneAgentSnapshot, type StandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { TextResourceStore } from "../src/server/text-resources.ts";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { FileSessionStore } from "../src/server/session-store.ts";
import { createModelFixture, textReply, toolReply, type ModelRequest } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";

const key = "resource-fixture-key-host-only";
async function scratch(t: TestContext) {
  const parent = resolve(".test-tmp"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(resolve(parent, "resource-"));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
async function configure(host: StandaloneAgentHost, baseUrl: string) {
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl });
  await host.saveCredential(key); await host.setEnabled(true);
}
function catalog(request: ModelRequest): { items: { resourceId: string }[] } {
  const messages = request.body.messages as { role: string; content: string }[];
  const user = JSON.parse([...messages].reverse().find((m) => m.role === "user")!.content) as { context: { contextItemId: string; content: { items: { resourceId: string }[] } }[] };
  return user.context.find((item) => item.contextItemId === "resource.catalog")!.content;
}
function waitFor(host: StandaloneAgentHost, predicate: (snapshot: StandaloneAgentSnapshot) => boolean) {
  if (predicate(host.getSnapshot())) return Promise.resolve(host.getSnapshot());
  return new Promise<StandaloneAgentSnapshot>((resolvePromise, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("Resource state did not settle")); }, 5000);
    const unsubscribe = host.subscribe((snapshot) => { if (predicate(snapshot)) { clearTimeout(timer); unsubscribe(); resolvePromise(snapshot); } });
  });
}
async function http(t: TestContext, host: StandaloneAgentHost) {
  const server = createStandaloneServer({ host });
  await listenForTest(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolvePromise) => server.close(() => resolvePromise())); });
  const base = `http://127.0.0.1:${address.port}`;
  return { base, api: async (path: string, body?: unknown) => {
    const response = await fetch(`${base}/api/${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() as unknown };
  } };
}

test("real UTF-8 MD file flows through catalog, Controller tool execution, Pi continuation and actual wire", async (t) => {
  const directory = await scratch(t), content = "# 节奏练习\n每日 12 分钟，🎸 保留这个实际文件标记。\n";
  const file = resolve(directory, "练习.md"); await writeFile(file, content, "utf8");
  const text = decodeTextResourceFile("练习.md", new Uint8Array(await readFile(file)));
  const fixture = await createModelFixture((request, count) => count === 1
    ? toolReply("tool_1", JSON.stringify({ resourceId: catalog(request).items[0]!.resourceId, start: 0, maxCharacters: 2048 }), "actual-file-call")
    : textReply("读取完毕：每日12分钟。")); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  const events: StandaloneAgentSnapshot[] = []; host.subscribe((snapshot) => events.push(snapshot));
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "练习.md", text });
  assert.equal(fixture.requests.length, 0); assert.ok(!JSON.stringify(host.getSnapshot()).includes("实际文件标记"));
  const outcome = await host.session.submit("按资料解释练习安排");
  assert.equal(outcome.response, "读取完毕：每日12分钟。"); assert.equal(outcome.run.invocations.length, 1);
  assert.ok(!JSON.stringify(fixture.requests[0]!.body).includes("实际文件标记"));
  const wire = fixture.requests[1]!.body.messages as { role: string; content: string; tool_call_id?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }[];
  assert.deepEqual(wire.map((m) => m.role), ["system", "user", "assistant", "tool"]);
  assert.equal(wire[2]!.tool_calls![0]!.id, "actual-file-call");
  assert.equal(wire[2]!.tool_calls![0]!.function.name, "tool_1"); assert.equal(wire[3]!.tool_call_id, "actual-file-call");
  const returned = JSON.parse(wire[3]!.content) as { invocationId: string; data: { text: string; eof: boolean; contentTrust: string } };
  assert.equal(returned.invocationId, outcome.run.invocations[0]!.invocationId);
  assert.equal(returned.data.text, content); assert.equal(returned.data.eof, true); assert.equal(returned.data.contentTrust, "user-provided");
  assert.equal(JSON.stringify(wire).split("实际文件标记").length - 1, 1);
  assert.equal(JSON.stringify(wire).split("按资料解释练习安排").length - 1, 1);
  assert.ok(events.some((s) => s.activities.items[0]?.status === "running"));
  assert.equal(host.getSnapshot().activities.items[0]?.status, "completed");
  assert.equal(host.getSnapshot().activities.items[0]?.invocationId, returned.invocationId);
  assert.ok(events.every(isStandaloneAgentSnapshot)); assert.ok(!JSON.stringify(host.getSnapshot()).includes(key));
});

test("Unicode pages preserve every code point and bounded escaped JSON with accurate nextStart/eof", () => {
  for (const text of ["中文🎸\\\"\t\n".repeat(1000), "😀".repeat(4096), "\t".repeat(MAX_TEXT_RESOURCE_BYTES), ""]) {
    const store = new TextResourceStore(); store.clear("legacy_session-id"); store.add({ sessionId: "legacy_session-id", name: "page.TXT", text });
    const id = store.getSnapshot().items[0]!.resourceId; let start = 0, combined = "", pages = 0;
    do {
      const page = store.read("legacy_session-id", { resourceId: id, start, maxCharacters: 4096 }); ++pages;
      assert.ok(Buffer.byteLength(JSON.stringify(page)) <= MAX_TEXT_PAGE_JSON_BYTES);
      assert.equal(page.nextStart - start, [...page.text].length); assert.equal(page.eof, page.nextStart === [...text].length);
      combined += page.text; if (page.eof) break; assert.ok(page.nextStart > start); start = page.nextStart;
    } while (pages < 100);
    assert.equal(combined, text); assert.ok(isTextResourcesSnapshot(store.getSnapshot()));
    assert.throws(() => store.read("legacy_session-id", { resourceId: id, start: [...text].length + 1, maxCharacters: 1 }), /起点/);
  }
});

test("strict text contracts enforce encoding, byte/count limits, names and exact parameters", () => {
  const bytes = new TextEncoder();
  assert.equal(decodeTextResourceFile("a.txt", Uint8Array.from([239, 187, 191, 65])), "A");
  assert.throws(() => decodeTextResourceFile("a.txt", Uint8Array.from([0xff, 0xfe, 65])), /UTF-8/);
  assert.throws(() => decodeTextResourceFile("a.txt", Uint8Array.from([0])), /二进制/);
  assert.throws(() => decodeTextResourceFile("a.txt", bytes.encode("a".repeat(MAX_TEXT_RESOURCE_BYTES + 1))), /32KiB/);
  assert.throws(() => parseAddTextResource({ sessionId: "s", name: "a.txt", text: "\ud800" }), /UTF-8/);
  for (const name of ["a.pdf", "../a.txt", "a/b.md", " a.md", "a\n.md"]) assert.throws(() => decodeTextResourceFile(name, bytes.encode("a")));
  assert.throws(() => parseAddTextResource({ sessionId: "s", name: "a.txt", text: "a", path: "arbitrary.txt" }));
  assert.throws(() => parseRemoveTextResource({ sessionId: "s", resourceId: "id", text: "extra" }));
  assert.ok(isReadTextResourceInput({ resourceId: "id", start: 0, maxCharacters: 4096 }));
  for (const invalid of [{ resourceId: "id", start: -1, maxCharacters: 1 }, { resourceId: "id", start: 0, maxCharacters: 4097 }, { resourceId: "id", start: 0, maxCharacters: 1, path: "a" }]) assert.equal(isReadTextResourceInput(invalid), false);
  const store = new TextResourceStore(); store.clear("s");
  for (let i = 0; i < 3; ++i) store.add({ sessionId: "s", name: `a${i}.txt`, text: "a" });
  assert.throws(() => store.add({ sessionId: "s", name: "four.txt", text: "a" }), /3/);
  const id = store.getSnapshot().items[0]!.resourceId; store.remove("s", id);
  assert.throws(() => store.read("s", { resourceId: id, start: 0, maxCharacters: 1 }), /不存在/);
  assert.throws(() => store.read("other", { resourceId: store.getSnapshot().items[0]!.resourceId, start: 0, maxCharacters: 1 }), /会话/);
});

test("actual multi-page reads replay each result once and retain call order", async (t) => {
  const source = "第一页🎸第二页中文尾部";
  const fixture = await createModelFixture((request, count) => {
    if (count === 1) return toolReply("tool_1", JSON.stringify({ resourceId: catalog(request).items[0]!.resourceId, start: 0, maxCharacters: 4 }), "page-1");
    if (count === 2) {
      const wire = request.body.messages as { role: string; content: string }[];
      const data = JSON.parse(wire.at(-1)!.content).data as { resourceId: string; nextStart: number };
      return toolReply("tool_1", JSON.stringify({ resourceId: data.resourceId, start: data.nextStart, maxCharacters: 4096 }), "page-2");
    }
    return textReply("分页读取完成");
  }); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "page.txt", text: source });
  await host.session.submit("读全部");
  const wire = fixture.requests[2]!.body.messages as { role: string; content: string; tool_call_id?: string }[];
  const tools = wire.filter((m) => m.role === "tool");
  assert.deepEqual(tools.map((m) => m.tool_call_id), ["page-1", "page-2"]);
  assert.equal(tools.map((m) => (JSON.parse(m.content).data as { text: string }).text).join(""), source);
  assert.deepEqual(host.getSnapshot().activities.items.map((a) => a.status), ["completed", "completed"]);
});

test("unknown or removed IDs produce actual failed activities and no success feedback or second model request", async (t) => {
  const fixture = await createModelFixture([toolReply("tool_1", '{"resourceId":"not-authorized","start":0,"maxCharacters":1}')]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "a.md", text: "authorized" });
  await host.session.submit("Read");
  assert.equal(fixture.requests.length, 1); assert.equal(host.getSnapshot().session.status, "failed");
  assert.equal(host.getSnapshot().activities.items[0]?.status, "failed");
});

test("resources stay process-local, never persist to chat filev1, and late uploads cannot cross sessions", async (t) => {
  const directory = await scratch(t); let host = await StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) });
  t.after(() => host.dispose()); const old = host.getSnapshot().session.sessionId;
  host.addResource({ sessionId: old, name: "private.md", text: "resource-body-not-persisted" });
  await host.renameConversation(old, "Original");
  const disk = JSON.parse(await readFile(resolve(directory, "sessions.json"), "utf8")) as { schemaVersion: number };
  assert.equal(disk.schemaVersion, 1); assert.ok(!JSON.stringify(disk).includes("resource-body-not-persisted"));
  await host.reset(); assert.equal(host.getSnapshot().resources.items.length, 0);
  assert.throws(() => host.addResource({ sessionId: old, name: "late.txt", text: "late" }), /会话已变化/);
  await host.selectConversation(old); assert.equal(host.getSnapshot().resources.items.length, 0);
  host.addResource({ sessionId: old, name: "temporary.txt", text: "temporary" });
  await host.dispose(); host = await StandaloneAgentHost.open({ sessionStore: new FileSessionStore(directory) });
  assert.equal(host.getSnapshot().resources.items.length, 0); assert.equal(host.getSnapshot().session.enabled, false);
});

test("HTTP/SSE refresh and reconnect preserve resources without generation; busy mutation is 409", async (t) => {
  const fixture = await createModelFixture([{ hang: true }]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); const { api, base } = await http(t, host);
  const sessionId = host.getSnapshot().session.sessionId;
  const added = await api("resources/add", { sessionId, name: "a.txt", text: "chosen-content" });
  assert.equal(added.status, 200); assert.ok(isStandaloneAgentSnapshot(added.value));
  const id = added.value.resources.items[0]!.resourceId;
  assert.equal((await api("session")).status, 200);
  for (let i = 0; i < 2; ++i) {
    const abort = new AbortController(); const response = await fetch(`${base}/api/session/events`, { signal: abort.signal });
    const part = await response.body!.getReader().read(); abort.abort();
    const frame = new TextDecoder().decode(part.value).split("\n").find((line) => line.startsWith("data: "))!.slice(6);
    const snapshot: unknown = JSON.parse(frame); assert.ok(isStandaloneAgentSnapshot(snapshot));
    assert.equal(snapshot.resources.items[0]?.resourceId, id); assert.ok(!frame.includes("chosen-content"));
  }
  assert.equal(fixture.requests.length, 0); await configure(host, fixture.baseUrl);
  const pending = host.session.submit("Wait"); await waitFor(host, (s) => s.session.messages.some((m) => m.content === "尚未结束"));
  assert.equal((await api("resources/add", { sessionId, name: "busy.txt", text: "busy" })).status, 409);
  assert.equal((await api("resources/remove", { sessionId, resourceId: id })).status, 409);
  await host.cancel(); await pending;
  assert.equal((await api("resources/remove", { sessionId, resourceId: id })).status, 200);
  assert.equal(fixture.requests.length, 1);
});

test("resource upload permits escaped 32KiB text; ordinary API still enforces its smaller request limit", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); const { api } = await http(t, host);
  const sessionId = host.getSnapshot().session.sessionId;
  assert.equal((await api("resources/add", { sessionId, name: "tabs.txt", text: "\t".repeat(MAX_TEXT_RESOURCE_BYTES) })).status, 200);
  const invalid = await api("resources/add", { sessionId, name: "large.txt", text: "a".repeat(MAX_TEXT_RESOURCE_BYTES + 1) });
  assert.equal(invalid.status, 400); assert.match(JSON.stringify(invalid.value), /32KiB/);
  const tooLarge = await api("session/messages", { message: "\t".repeat(MAX_TEXT_RESOURCE_BYTES + 1) });
  assert.equal(tooLarge.status, 400); assert.equal(host.getSnapshot().session.messages.length, 0);
});

test("probe has no catalog/tools and does not replace resource or activity state", async (t) => {
  const fixture = await createModelFixture([textReply("连接成功")]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "a.txt", text: "probe-private-body" });
  await host.testConnection();
  assert.equal(fixture.requests[0]?.body.tools, undefined);
  assert.ok(!JSON.stringify(fixture.requests[0]?.body).includes("resource.catalog"));
  assert.ok(!JSON.stringify(fixture.requests[0]?.body).includes("probe-private-body"));
  assert.equal(host.getSnapshot().resources.items.length, 1); assert.equal(host.getSnapshot().activities.items.length, 0);
});

test("cancelled slow actual tool cannot upgrade activity or generate after late resolution/new session", async (t) => {
  let release!: () => void, executions = 0;
  const slow: RegisteredAgentTool = { descriptor: { id: "demo.slow", contractVersion: 1, name: "Slow", description: "Slow read", kind: "query", inputSchema: { type: "object" }, outputSummary: "Result", preconditions: [],
    sideEffects: { document: "none", filesystem: "none", network: "none", settings: "none", playback: "none" }, scopeLimit: "none", requiresDocument: false,
    approvalRequirement: "risk-based", costClass: "constant", allowedPhases: ["planning"], validateInput: () => true },
    execute: async () => { ++executions; await new Promise<void>((resolvePromise) => { release = resolvePromise; }); return { text: "late result" }; } };
  const fixture = await createModelFixture([toolReply("tool_1", "{}")]); t.after(fixture.close);
  const host = new StandaloneAgentHost({ tools: new AgentToolRegistry([slow]) }); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  const pending = host.session.submit("Slow"); await waitFor(host, (s) => s.activities.items[0]?.status === "running");
  await host.cancel(); await pending;
  assert.equal(host.getSnapshot().activities.items[0]?.status, "cancelled");
  release(); await Promise.resolve(); await Promise.resolve();
  assert.equal(host.getSnapshot().activities.items[0]?.status, "cancelled");
  await host.reset(); assert.equal(host.getSnapshot().activities.items.length, 0);
  assert.equal(executions, 1); assert.equal(fixture.requests.length, 1);
});

test("public v5 decoder rejects unknown fields, forged session/run identities and malformed activity", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose()); const snapshot = host.getSnapshot();
  assert.ok(isStandaloneAgentSnapshot(snapshot));
  for (const changed of [{ ...snapshot, schemaVersion: 3 }, { ...snapshot, extra: true },
    { ...snapshot, resources: { ...snapshot.resources, sessionId: "other" } },
    { ...snapshot, resources: { ...snapshot.resources, text: "not-metadata" } },
    { ...snapshot, activities: { runId: "other", items: [] } },
    { ...snapshot, activities: { runId: null, items: [{ invocationId: "forged" }] } }]) assert.equal(isStandaloneAgentSnapshot(changed), false);
});
