import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { request as httpRequest } from "node:http";
import { isContextSelectionReportV1 } from "@brilliant-guitar/agent-runtime";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { isStandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";

async function configure(host: StandaloneAgentHost, baseUrl: string) {
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl });
  await host.saveCredential("selection-fixture-secret"); await host.setEnabled(true);
}
async function http(t: TestContext, host: StandaloneAgentHost) {
  const server = createStandaloneServer({ host }); await listenForTest(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  return `http://127.0.0.1:${address.port}`;
}

test("context-selection GET reports actual corrected history privately and read-only; probes/reconnect/switch keep v5 isolated", async (t) => {
  const fixture = await createModelFixture([textReply("按20分钟安排"), textReply("已改为12分钟"), textReply("继续按12分钟"), textReply("连接正常")]);
  t.after(fixture.close); const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const base = await http(t, host), url = `${base}/api/context-selection`;
  assert.equal(await (await fetch(url)).json(), null); assert.equal(fixture.requests.length, 0);
  await configure(host, fixture.baseUrl);
  await host.session.submit("每日20分钟"); await host.session.submit("更正为12分钟"); await host.session.submit("继续");
  const report = host.getContextSelection(); assert.ok(report && isContextSelectionReportV1(report));
  assert.equal(report.stage, "model-input"); assert.equal(report.status, "ready");
  assert.equal(report.selected.filter((item) => item.reason === "recent-conversation" && item.protected).length, 2);
  const wire = fixture.requests[2]!.body.messages as { role: string; content: string }[];
  assert.deepEqual(wire.map((m) => m.role), ["system", "user", "assistant", "user", "assistant", "user"]);
  assert.equal(wire[1]?.content, "每日20分钟"); assert.equal(wire[3]?.content, "更正为12分钟");
  const response = await fetch(url); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), report);
  const text = JSON.stringify(report);
  for (const excluded of ["selection-fixture-secret", fixture.baseUrl, "每日20分钟", "更正为12分钟", "已改为12分钟"]) assert.ok(!text.includes(excluded));
  assert.equal(await host.testConnection(), true); assert.equal(host.getContextSelection(), report);
  await fetch(`${base}/api/session`); await fetch(url);
  for (let i = 0; i < 2; ++i) {
    const events = await fetch(`${base}/api/session/events`); const reader = events.body!.getReader();
    const chunk = await reader.read(); assert.match(new TextDecoder().decode(chunk.value), /"schemaVersion":5/); await reader.cancel();
  }
  assert.equal(fixture.requests.length, 4); assert.equal(host.getContextSelection(), report);
  assert.equal((await fetch(url, { headers: { origin: "http://other.local" } })).status, 403);
  assert.equal(await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(url, { headers: { host: "other.local" } }, (res) => { res.resume(); resolve(res.statusCode); });
    request.on("error", reject); request.end();
  }), 403);
  assert.ok(isStandaloneAgentSnapshot(host.getSnapshot())); assert.equal("contextSelection" in host.getSnapshot(), false);
  const oldSessionId = host.getSnapshot().session.sessionId;
  await host.reset(); assert.equal(await (await fetch(url)).json(), null);
  await host.selectConversation(oldSessionId); assert.equal(host.getContextSelection(), null);
  assert.equal(fixture.requests.length, 4);
});

test("stopping a real pending transport clears selection; late/probe reports cannot populate a new run or disabled host", async (t) => {
  let ready!: () => void; const reached = new Promise<void>((resolve) => { ready = resolve; });
  const fixture = await createModelFixture((_request, count) => { if (count === 1) { ready(); return { hang: true }; } return textReply("完成"); });
  t.after(fixture.close); const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await configure(host, fixture.baseUrl); const pending = host.session.submit("等待回复"); await reached;
  const old = host.getContextSelection(); assert.ok(old); assert.equal(old.stage, "model-input");
  await host.cancel(); await pending; assert.equal(host.getContextSelection(), null);
  assert.equal(host.session.reportContextSelection(old), false);
  await host.reset(); await host.session.submit("新的任务");
  const current = host.getContextSelection(); assert.ok(current && current.runId !== old.runId);
  assert.equal(host.session.reportContextSelection(old), false); assert.equal(host.getContextSelection(), current);
  await host.setEnabled(false); assert.equal(host.getContextSelection(), null);
  await host.setEnabled(true); assert.equal(host.getContextSelection(), null);
  await host.dispose(); assert.equal(host.getContextSelection(), null); assert.equal(fixture.requests.length, 2);
});

test("actual repeated-page reads keep every invocation protected and every body appears once per tool reply on wire", async (t) => {
  let resourceId = "";
  const fixture = await createModelFixture((_request, count) => count <= 3
    ? toolReply("tool_1", JSON.stringify({ resourceId, start: count === 2 ? 3 : 0, maxCharacters: 3 }), `page-call-${count}`)
    : textReply("完成读取"));
  t.after(fixture.close); const host = new StandaloneAgentHost(); t.after(() => host.dispose()); await configure(host, fixture.baseUrl);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "练习.md", text: "甲乙丙丁戊己" });
  resourceId = host.getSnapshot().resources.items[0]!.resourceId;
  const outcome = await host.session.submit("按页读取资料"); assert.equal(outcome.response, "完成读取");
  assert.equal(fixture.requests.length, 4); assert.equal(outcome.run.invocations.length, 3);
  const report = host.getContextSelection(); assert.ok(report && isContextSelectionReportV1(report));
  assert.deepEqual(report.selected.filter((item) => item.reason === "executed-result").map((item) => item.contextItemId),
    outcome.run.invocations.map((item) => `capability-result:${item.invocationId}`));
  const wire = fixture.requests[3]!.body.messages as { role: string; content: string; tool_call_id?: string }[];
  const tools = wire.filter((m) => m.role === "tool");
  assert.deepEqual(tools.map((m) => m.tool_call_id), ["page-call-1", "page-call-2", "page-call-3"]);
  assert.deepEqual(tools.map((m) => (JSON.parse(m.content) as { data: { text: string } }).data.text), ["甲乙丙", "丁戊己", "甲乙丙"]);
  assert.equal(JSON.stringify(wire).split("甲乙丙").length - 1, 2);
  assert.ok(!JSON.stringify(report).includes("甲乙丙"));
});
