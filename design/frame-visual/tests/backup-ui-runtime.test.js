import assert from "node:assert/strict";
import test from "node:test";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function rootWithSentinel() {
  const root = document.createElement("main");
  const sentinel = document.createElement("span");
  sentinel.id = "owned-by-app";
  root.append(sentinel);
  document.body.append(root);
  return { root, sentinel };
}

test("backup UI entry registers notation.core in the fixed platform and releases the projection", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel();
  const runtime = createBackupUiRuntime({ root });
  try {
    assert.ok(root.querySelector(".visual-shell"));
    assert.ok(root.querySelector(".core-score-view"));
    assert.equal(runtime.score.snapshot().kind, "staff");
    assert.equal(runtime.document.snapshot().status, "ready");
  } finally {
    runtime.dispose();
  }
  assert.deepEqual([...root.children], [sentinel]);
  assert.equal(runtime.score.snapshot(), null);
}));

test("backup UI entry connects a real document session through the read-only projection", async () => withTestDocument(async () => {
  const { root } = rootWithSentinel();
  let notify;
  let current = {
    documentId: "score-1",
    documentVersion: 3,
    notation: {
      kind: "staff", partId: "part-1", staffId: "staff-1", title: "真实文档",
      clef: "treble", tempoBpm: 96, keySignatureChanges: [],
      measures: [{ id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
        { id: "event-1", duration: { base: 1, dots: 0 }, content: { kind: "rest" } },
      ] }],
    },
  };
  const runtime = createBackupUiRuntime({
    root,
    documentSession: {
      read: async () => current,
      subscribe(listener) { notify = listener; return () => { notify = null; }; },
    },
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(runtime.document.snapshot().status, "ready");
    assert.equal(runtime.document.snapshot().documentId, "score-1");
    current = { ...current, documentVersion: 4 };
    notify?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(runtime.document.snapshot().documentVersion, 4);
    assert.equal(runtime.score.snapshot().measures[0].id, "measure-1");
  } finally {
    runtime.dispose();
  }
}));

test("backup UI entry enables the platform status page only when requested", () => withTestDocument(() => {
  const { root } = rootWithSentinel();
  const runtime = createBackupUiRuntime({ root, enablePluginDiagnostics: true });
  try {
    root.querySelector("#menu-plugins").click();
    assert.match([...document.querySelectorAll(".v-menu-item")].map(item => item.textContent).join(" "), /插件状态/);
    assert.equal(runtime.execute("frame.workspace.page.select", { id: "frame.plugins.diagnostics", toggle: false }).ok, true);
    assert.ok(root.querySelector(".plugin-manager"));
    [...root.querySelectorAll(".plugin-status-row")].find(item => item.textContent.includes("notation.core"))?.click();
    assert.match(root.textContent, /notation\.core/);
    const search = root.querySelector(".plugin-manager-search");
    search.value = "frame.layout";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(root.querySelectorAll(".plugin-status-row").length, 1);
    assert.match(root.querySelector(".plugin-manager-detail").textContent, /frame\.layout/);
  } finally {
    runtime.dispose();
  }
}));
