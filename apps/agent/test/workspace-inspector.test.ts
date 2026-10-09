import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { decodeRunDiagnostics } from "../src/contracts/run-diagnostics.ts";
import { runDiagnostics } from "./run-diagnostics-fixture.ts";

let vite: ViteDevServer;
let WorkspaceInspector: typeof import("../src/client/workspace-inspector.tsx").WorkspaceInspector;
let RunDiagnosticsPanel: typeof import("../src/client/run-diagnostics-panel.tsx").RunDiagnosticsPanel;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  ({ WorkspaceInspector } = await vite.ssrLoadModule("/src/client/workspace-inspector.tsx"));
  ({ RunDiagnosticsPanel } = await vite.ssrLoadModule("/src/client/run-diagnostics-panel.tsx"));
});

test("diagnostics presents frozen input separately from a blocked candidate and never invents tool completion", () => {
  const data = decodeRunDiagnostics(runDiagnostics({ admission: { schemaVersion: 1, policyVersion: "immutable-query-v1", runId: "run-1", turnId: "other-turn",
    nextTurnId: "future-turn", status: "blocked", reason: "input-budget", inputPreview: { schemaVersion: 1, runId: "run-1", turnId: "future-turn",
      status: "budget-exceeded", estimator: "utf8-json-bytes-div3-v1", estimatedInputTokens: 9999, inputTokenBudget: 8192, requestBytes: 29997, requestByteBudget: null },
    calls: [{ callId: "future-call", capabilityId: "resource.read-text", contractVersion: 1, candidateInvocationId: "candidate-future", resultJsonByteLimit: null, previewResultJsonBytes: null }] } }));
  const html = renderToStaticMarkup(createElement(RunDiagnosticsPanel, { state: { key: "current", phase: "ready", data }, disconnected: false,
    onRefresh: () => assert.fail("render must not refresh"), onOpenBudget: () => assert.fail("render must not save"), onResources: () => {} }));
  assert.match(html, /1,000/); assert.match(html, /8,192/); assert.ok(!html.includes("9,999"));
  assert.match(html, /空间不足，本组未执行/); assert.match(html, /供应商实际用量/); assert.match(html, /未提供/);
  assert.match(html, /候选调用不是完成记录/); assert.ok(!html.includes("candidate-future")); assert.ok(!html.includes("tool-card completed"));
  assert.match(html, /检查输入预算/);
  assert.ok(Object.isFrozen(data.admission?.calls) && Object.isFrozen(data.admission?.inputPreview));
  const mismatch = decodeRunDiagnostics({ ...data, admission: { ...data.admission, status: "contract-error", reason: "preview-execution-mismatch" } });
  const mismatchHtml = renderToStaticMarkup(createElement(RunDiagnosticsPanel, { state: { key: "current", phase: "ready", data: mismatch }, disconnected: false, onRefresh: () => {}, onOpenBudget: undefined, onResources: () => {} }));
  assert.match(mismatchHtml, /已完成项以活动为准/); assert.ok(!mismatchHtml.includes("本组未执行"));
});

test("missing and local-error diagnostics do not render zeros, stale metrics or a retry-generation action", () => {
  const render = (phase: "ready" | "error", availability: "no-current-run" | "configuration-changed") => renderToStaticMarkup(createElement(RunDiagnosticsPanel, {
    state: { key: "current", phase, data: phase === "error" ? null : decodeRunDiagnostics(runDiagnostics({ availability, runId: availability === "no-current-run" ? null : "run-1", modelInput: null, omittedHistoryTurns: null })) },
    disconnected: false, onRefresh: () => {}, onOpenBudget: undefined, onResources: () => {} }));
  assert.match(render("ready", "no-current-run"), /当前没有运行诊断/); assert.ok(!render("ready", "no-current-run").includes("0 tokens"));
  assert.match(render("ready", "configuration-changed"), /设置已更新/); assert.ok(!render("ready", "configuration-changed").includes("1,000"));
  const error = render("error", "no-current-run"); assert.match(error, /这只影响诊断面板/); assert.match(error, /刷新诊断/); assert.ok(!error.includes("重新生成"));
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
