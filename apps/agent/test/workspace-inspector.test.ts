import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";

let vite: ViteDevServer;
let WorkspaceInspector: typeof import("../src/client/workspace-inspector.tsx").WorkspaceInspector;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ WorkspaceInspector } = await vite.ssrLoadModule("/src/client/workspace-inspector.tsx"));
});
after(async () => { await vite?.close(); });

test("inspector presents the authorized directory without resource bodies and preserves busy guards", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const text = "资料正文不能仅因打开检查区而发给模型。";
  host.addResource({ sessionId: host.getSnapshot().session.sessionId, name: "练习计划.md", text });
  const snapshot = host.getSnapshot();
  const html = renderToStaticMarkup(createElement(WorkspaceInspector, { snapshot, open: false, tab: "resources", disabled: true,
    onTabChange: () => {}, onClose: () => {}, onBusyChange: () => {}, action: async () => { assert.fail("render must not execute actions"); } }));
  assert.match(html, /练习计划.md/); assert.match(html, /工具读取成功后发送给模型/);
  assert.ok(!html.includes(text)); assert.ok(!html.includes(snapshot.resources.items[0]!.resourceId));
  assert.match(html, /aria-label="选择文本资料" disabled=""/);
  assert.match(html, /aria-label="移除 练习计划.md" disabled=""/);
  assert.match(html, /暂无工具活动/); assert.ok(!html.includes("还没有添加资料"));
});

test("inspector labels actual tool status independently of the final reply and handles an empty new session", async (t) => {
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const empty = host.getSnapshot();
  const render = (snapshot = empty) => renderToStaticMarkup(createElement(WorkspaceInspector, { snapshot, open: false,
    tab: "activities", disabled: false, onTabChange: () => {}, onClose: () => {}, onBusyChange: () => {}, action: async () => {} }));
  const html = render({ ...empty, activities: { runId: "run-1", items: [{ invocationId: "actual-call-1", turnId: "turn-1", label: "读取文本资料",
    status: "completed", startedAt: 1, finishedAt: 2, errorCode: null }] } });
  assert.match(html, /工具完成后，回答可能仍在继续/); assert.match(html, /actual-call-1/); assert.match(html, /tool-card completed/);
  assert.ok(!html.includes("暂无工具活动"));
  const next = render();
  assert.match(next, /还没有添加资料/); assert.match(next, /暂无工具活动/); assert.ok(!next.includes("actual-call-1"));
});
