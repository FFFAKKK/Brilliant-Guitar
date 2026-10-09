import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";
import type { AgentChatMessage, AgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";
import type { ToolActivitiesSnapshot } from "../src/contracts/tool-activities.ts";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createModelFixture, textReply, toolReply } from "./model-fixture.ts";

let vite: ViteDevServer;
let ChatMessage: typeof import("../src/client/chat-message.tsx").ChatMessage;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ ChatMessage } = await vite.ssrLoadModule("/src/client/chat-message.tsx"));
});
after(async () => { await vite?.close(); });

const emptyActivities: ToolActivitiesSnapshot = { runId: null, items: [] };
const failedReply: AgentChatMessage = { id: "reply-1", runId: "run-1", role: "assistant", content: "先读取资料。", status: "failed" };
const session: AgentSessionSnapshot = { sessionId: "session-1", sequence: 2, enabled: true, status: "failed", runId: "run-1",
  messages: [failedReply], message: "模型必需输入超过当前上下文预算，请缩短问题或减少资料", omittedHistoryTurns: 0 };
function render(message = failedReply, snapshot = session, activities = emptyActivities) {
  return renderToStaticMarkup(createElement(ChatMessage, { message, session: snapshot, activities }));
}

test("partial failed reply shows the current reason before the body, with distinct copy wording and escaped text", () => {
  const html = render();
  assert.match(html, /role="status"/); assert.match(html, /回复未完成/); assert.match(html, /以下仅为中断前的部分回复/);
  assert.ok(html.indexOf("原因：模型必需输入超过") < html.indexOf("先读取资料。"));
  assert.match(html, /aria-label="复制部分回复"/);
  const escaped = render(failedReply, { ...session, message: '<img src=x onerror="alert(1)"> **预算**' });
  assert.ok(!escaped.includes("<img")); assert.ok(!escaped.includes("<strong>预算"));
  assert.match(escaped, /&lt;img/); assert.match(escaped, /\*\*预算\*\*/);
});

test("empty failures produce no invented reply or copy button; absent reasons are explicit", () => {
  const html = render({ ...failedReply, content: "" });
  assert.match(html, /未收到回复正文/); assert.match(html, /原因：模型必需输入超过/);
  assert.ok(!html.includes('class="message-content')); assert.ok(!html.includes("copy-button"));
  assert.match(render(failedReply, { ...session, message: "  " }), /具体失败原因未保留/);
});

test("historical, restored, disabled and newer-run replies never borrow a different status message", () => {
  for (const snapshot of [
    { ...session, runId: "run-2", message: "新的请求连接失败" },
    { ...session, runId: null, status: "idle" as const, message: "可以继续对话" },
    { ...session, status: "disabled" as const, enabled: false, message: "Agent 已停用" },
    { ...session, status: "running" as const, message: "正在思考" },
  ]) {
    const html = render(failedReply, snapshot);
    assert.match(html, /回复未完成/); assert.match(html, /具体失败原因未保留/);
    assert.ok(!html.includes(snapshot.message)); assert.ok(!html.includes('role="status"'));
  }
});

test("completed, streaming, stopped, interrupted and user messages retain their own meaning", () => {
  for (const status of ["complete", "streaming", "cancelled", "interrupted"] as const) {
    const html = render({ ...failedReply, status, content: "" });
    assert.ok(!html.includes("reply-notice")); assert.ok(!html.includes(session.message));
    if (status === "streaming") assert.match(html, /正在思考/);
    if (status === "cancelled") assert.match(html, /已停止/);
    if (status === "interrupted") assert.match(html, /宿主退出时回复尚未完成/);
  }
  assert.match(render({ ...failedReply, status: "complete" }), /aria-label="复制消息"/);
  const user = render({ ...failedReply, role: "user", content: "**原文** <b>保留</b>" });
  assert.ok(!user.includes("reply-notice")); assert.match(user, /\*\*原文\*\* &lt;b&gt;保留&lt;\/b&gt;/);
});

test("completed tool activities remain completed when the reply fails and different-run activities stay hidden", () => {
  const activities: ToolActivitiesSnapshot = { runId: failedReply.runId, items: [{ invocationId: "invocation-1", turnId: "turn-1",
    label: "读取文本资料", status: "completed", startedAt: 1, finishedAt: 2, errorCode: null }] };
  const html = render(failedReply, session, activities);
  assert.match(html, /tool-card completed/); assert.match(html, /已完成/); assert.match(html, /回复未完成/);
  assert.ok(!render(failedReply, session, { ...activities, runId: "run-2" }).includes("tool-card"));
});

test("actual HTTP pages shrink before execution and UI shows a local rejection without a fake third tool card", async (t) => {
  let resourceId = "";
  const prefix = "先分段读取资料，再整理完整结果。";
  const fixture = await createModelFixture((request, count) => {
    const messages = request.body.messages as { role: string; content: string }[];
    const lastTool = messages.filter((item) => item.role === "tool").at(-1);
    const start = lastTool ? (JSON.parse(lastTool.content) as { data: { nextStart: number } }).data.nextStart : 0;
    const reply = toolReply("tool_1", JSON.stringify({ resourceId, start, maxCharacters: 4096 }), `page-${count}`);
    assert.ok("chunks" in reply);
    return count === 1 ? { ...reply, chunks: [{ id: "partial-text", object: "chat.completion.chunk", model: "fixture",
      choices: [{ index: 0, delta: { role: "assistant", content: prefix }, finish_reason: null }] }, ...reply.chunks] } : reply;
  });
  t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl: fixture.baseUrl });
  await host.saveCredential("failure-ui-fixture-secret"); await host.setEnabled(true);
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "预算验收.md", text: "甲".repeat(7465) });
  resourceId = host.getSnapshot().resources.items[0]!.resourceId;
  await host.session.submit("读完全部资料后回答，请继续读取到eof。");
  const snapshot = host.getSnapshot();
  const message = snapshot.session.messages.at(-1)!;
  assert.equal(snapshot.session.status, "failed"); assert.equal(message.status, "failed"); assert.equal(message.content, prefix);
  assert.equal(fixture.requests.length, 3); assert.equal(snapshot.activities.items.length, 2);
  assert.ok(snapshot.activities.items.every((item) => item.status === "completed"));
  assert.equal(host.getModelInput()?.status, "ready");
  assert.equal(host.getToolFeedbackAdmission()?.status, "blocked");
  assert.equal(host.getToolFeedbackAdmission()?.calls[0]?.callId, "page-3");
  const html = render(message, snapshot.session, snapshot.activities);
  assert.match(html, /回复未完成/); assert.match(html, /部分回复/); assert.match(html, /原因：剩余输入空间不足，本组读取未执行/);
  assert.match(html, /先分段读取资料，再整理完整结果/);
  assert.equal((html.match(/tool-card completed/g) ?? []).length, 2); assert.ok(!html.includes("failure-ui-fixture-secret"));
});
