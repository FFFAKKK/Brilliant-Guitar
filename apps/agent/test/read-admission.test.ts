import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { isToolFeedbackAdmissionReportV1, resultJsonBytes, type ToolFeedbackAdmissionReportV1 } from "@brilliant-guitar/agent-runtime";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { TextResourceStore, createTextResourceTool } from "../src/server/text-resources.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";

test("real immutable resource preview and execute share byte limits, Unicode progress and empty EOF semantics", async () => {
  for (const text of ["汉字".repeat(100), "abc".repeat(100), "😀🎸".repeat(100), "\"\\\n\t".repeat(100), ""]) {
    const store = new TextResourceStore(); store.clear("s"); store.add({ sessionId: "s", name: "页.md", text });
    const resourceId = store.getSnapshot().items[0]!.resourceId;
    const tool = createTextResourceTool(store, (sessionId) => sessionId === "s");
    const input = { resourceId, start: 0, maxCharacters: 4096 };
    const context = { workspace: { workspaceId: "s", documentId: null, documentVersion: null, selection: null }, rangeBudget: 0,
      resultLimit: { schemaVersion: 1 as const, maxResultJsonBytes: 300 } };
    assert.equal(tool.previewRead!(input, { ...context, resultLimit: { schemaVersion: 1, maxResultJsonBytes: 1 } }).status, "insufficient-limit");
    let combined = "", start = 0;
    do {
      const call = { ...input, start };
      const preview = tool.previewRead!(call, context); assert.equal(preview.status, "ready");
      const data = await tool.execute(call, context) as { text: string; start: number; nextStart: number; eof: boolean };
      assert.deepEqual(preview.status === "ready" && preview.data, data); assert.ok(resultJsonBytes(data) <= 300);
      assert.equal(data.nextStart - data.start, [...data.text].length); combined += data.text;
      if (data.eof) break;
      assert.ok(data.nextStart > start); start = data.nextStart;
    } while (start < [...text].length);
    assert.equal(combined, text);
    assert.throws(() => tool.previewRead!(input, { ...context, workspace: { ...context.workspace, workspaceId: "other" } }), /取消|会话/);
    store.remove("s", resourceId); assert.throws(() => tool.previewRead!(input, context), /不存在/);
  }
});

test("real HTTP continuation equals prior admission estimate; report is private, current-run-only and read-only", async (t) => {
  let resourceId = ""; const captures: { report: ToolFeedbackAdmissionReportV1 | null; tokens: number | undefined }[] = [];
  let host: StandaloneAgentHost;
  const fixture = await createModelFixture((request, count) => {
    if (!request.body.tools) return textReply("连接成功");
    if (count > 1) captures.push({ report: host.getToolFeedbackAdmission(), tokens: host.getModelInput()?.estimatedInputTokens });
    const messages = request.body.messages as { role: string; content: string }[];
    const last = messages.filter((item) => item.role === "tool").at(-1);
    const start = last ? (JSON.parse(last.content) as { data: { nextStart: number } }).data.nextStart : 0;
    return toolReply("tool_1", JSON.stringify({ resourceId, start, maxCharacters: 4096 }), `read-${count}`);
  }); t.after(fixture.close);
  host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", baseUrl: fixture.baseUrl, modelId: "fixture-model" });
  await host.saveCredential("admission-local-fixture-key"); await host.setEnabled(true);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "私有资料.md", text: "甲".repeat(7465) });
  resourceId = host.getSnapshot().resources.items[0]!.resourceId;
  const server = createStandaloneServer({ host }); await listenForTest(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/tool-feedback-admission`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  assert.equal(await (await fetch(url)).json(), null);
  const outcome = await host.session.submit("读完全部资料后回答，请继续读取到eof。");
  assert.equal(host.getSnapshot().session.status, "failed"); assert.equal(fixture.requests.length, 3); assert.equal(outcome.run.invocations.length, 2);
  for (const capture of captures) { assert.equal(capture.report?.status, "admitted"); assert.equal(capture.report.inputPreview?.estimatedInputTokens, capture.tokens); }
  const report = host.getToolFeedbackAdmission(); assert.ok(isToolFeedbackAdmissionReportV1(report)); assert.equal(report.status, "blocked");
  const response = await fetch(url); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(await response.json(), report);
  for (const hidden of ["私有资料.md", "甲甲", "admission-local-fixture-key", fixture.baseUrl]) assert.ok(!JSON.stringify(report).includes(hidden));
  assert.ok(host.getSnapshot().activities.items.every((item) => item.status === "completed"));
  assert.equal((await fetch(url, { headers: { origin: "http://other.local" } })).status, 403);
  assert.equal(await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(url, { headers: { host: "other.local" } }, (res) => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); req.end();
  }), 403);
  const count = fixture.requests.length; await fetch(url); await fetch(url); assert.equal(fixture.requests.length, count);
  await host.testConnection(); assert.equal(host.getToolFeedbackAdmission(), report);
  const old = host.getSnapshot().session.sessionId;
  await host.reset(); assert.equal(await (await fetch(url)).json(), null);
  await host.selectConversation(old); assert.equal(host.getToolFeedbackAdmission(), null);
  await host.setEnabled(false); assert.equal(host.getToolFeedbackAdmission(), null);
});
