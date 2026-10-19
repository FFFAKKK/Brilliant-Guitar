import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { mountStartupCenterVisual } from "../src/startup-center-preview.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { createStartupCenterTestShell as shell } from "./support/startup-center-fixtures.js";
const change = (node, value, type = "change") => { node.value = value; node.dispatchEvent(new Event(type)); };

test("startup center switches three pages without remounting or losing plugin drafts", () => withTestDocument(({ document }) => {
  const { root, node } = shell(document), view = mountStartupCenterVisual({ root });
  try {
    assert.equal(view.snapshot().page, "recent");
    assert.equal(node("launch-recent").hidden, false);
    assert.equal(node("launch-plugins").hidden, true);
    const toggle = root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle");
    const input = node("frame.score-info-measureLimit");
    node("launch-tab-plugins").click(); toggle.click(); change(input, "3", "input");
    node("launch-tab-settings").click(); node("launch-tab-recent").click(); node("launch-tab-plugins").click();
    assert.equal(root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle"), toggle);
    assert.equal(node("frame.score-info-measureLimit"), input);
    assert.equal(input.value, "3");
    assert.equal(view.snapshot().plugins.draft.plugins["frame.score-info"].enabled, true);
    assert.deepEqual(view.snapshot().plugins.dirtyIds, ["frame.score-info"]);
    assert.equal(node("startup-open").hidden, true, "visual draft must never activate the editor");
    const key = new Event("keydown", { cancelable: true }); Object.defineProperty(key, "key", { value: "End" });
    node("launch-tab-plugins").dispatchEvent(key);
    assert.equal(key.defaultPrevented, true);
    assert.equal(view.snapshot().page, "settings");
    assert.equal(document.activeElement, node("launch-tab-settings"));
    assert.equal(node("launch-tab-settings").tabIndex, 0);
    assert.equal(node("launch-tab-plugins").tabIndex, -1);
    view.showPage("unknown"); assert.equal(view.snapshot().page, "settings");
  } finally { view.dispose(); }
}));

test("recent selection, filtering and preview actions never create a workspace", () => withTestDocument(({ document }) => {
  const { root, node } = shell(document), view = mountStartupCenterVisual({ root });
  try {
    root.querySelector('[data-example-id="phrase"]').click();
    assert.equal(node("launch-preview-title").textContent, "乐句草稿");
    change(node("launch-search"), "不存在", "input");
    assert.deepEqual(view.snapshot().visibleIds, []);
    assert.equal(node("launch-score-card").hidden, true);
    assert.equal(node("launch-open-selected").disabled, true);
    assert.equal(node("launch-preview-title").textContent, "");
    assert.equal(node("launch-empty").hidden, false);
    change(node("launch-search"), "吉他", "input");
    assert.deepEqual(view.snapshot().visibleIds, ["arpeggio"]);
    assert.equal(node("launch-open-selected").disabled, false);
    node("launch-open-selected").click();
    assert.equal(node("launch-status").textContent, "打开分解和弦 · 视觉预览");
    node("launch-new").click(); assert.equal(node("launch-status").textContent, "新建作品 · 视觉预览");
    node("launch-open").click(); assert.equal(node("launch-status").textContent, "打开作品 · 视觉预览");
    assert.equal(view.snapshot().scope, "visual-only");
    assert.equal(view.snapshot().page, "recent");
    assert.equal(root.querySelector(".core-score-view"), null);
  } finally { view.dispose(); }
}));

test("preview settings and responsive tab semantics clean up with their view", () => withTestDocument(({ document, window }) => {
  const media = new EventTarget(); media.matches = false;
  window.matchMedia = query => { assert.equal(query, "(max-width: 440px)"); return media; };
  const { root, node } = shell(document), view = mountStartupCenterVisual({ root });
  const nav = root.querySelector('[role="tablist"]');
  change(node("launch-density"), "comfortable"); change(node("launch-font-size"), "14");
  assert.equal(root.getAttribute("data-density"), "comfortable");
  assert.equal(root.style.getPropertyValue("--launch-font-size"), "14px");
  change(node("launch-density"), "invalid"); change(node("launch-font-size"), "1000");
  assert.equal(root.getAttribute("data-density"), "comfortable");
  assert.equal(root.style.getPropertyValue("--launch-font-size"), "14px");
  assert.equal(nav.getAttribute("aria-orientation"), "vertical");
  media.matches = true; media.dispatchEvent(new Event("change"));
  assert.equal(nav.getAttribute("aria-orientation"), "horizontal");
  const oldRow = root.querySelector('[data-example-id="phrase"]');
  view.dispose(); view.dispose();
  oldRow.click(); node("launch-tab-plugins").click(); change(node("launch-density"), "compact");
  assert.equal(view.snapshot().selectedId, "melody");
  assert.equal(view.snapshot().page, "recent");
  assert.equal(root.getAttribute("data-density"), "comfortable");
  media.matches = false; media.dispatchEvent(new Event("change"));
  assert.equal(nav.getAttribute("aria-orientation"), "horizontal", "disposed media listener is removed");
}));

test("classic startup candidate uses memory only and releases its controls on page exit", () => withTestDocument(({ document, window }) => {
  const { root, node } = shell(document);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Product storage must not be read"); } });
  try {
    const source = readFileSync(new URL("../vendor/startup-center-preview.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /import\.meta|\bimport\s*\(|PluginPlatform|createBackupUiRuntime|__TAURI/);
    runInThisContext(source);
    assert.equal(root.querySelectorAll(".startup-row").length, 5);
    const toggle = root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle");
    toggle.click(); node("startup-apply").click();
    assert.match(node("startup-feedback").textContent, /已保存/);
    const restored = new Event("pagehide"); Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored); assert.equal(root.querySelectorAll(".startup-row").length, 5);
    window.dispatchEvent(new Event("pagehide"));
    assert.equal(root.querySelectorAll(".startup-row").length, 0);
    assert.equal(node("launch-file-list").children.length, 0);
    const next = mountStartupCenterVisual({ root });
    try {
      assert.equal(next.snapshot().plugins.baseline.revision, 0);
      assert.equal(next.snapshot().plugins.draft.plugins["frame.score-info"].enabled, false);
      toggle.click(); assert.deepEqual(next.snapshot().plugins.dirtyIds, []);
    } finally { next.dispose(); }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage;
  }
}));

test("standalone startup candidate is reproducible and references existing local assets", () => {
  const script = fileURLToPath(new URL("../scripts/build-startup-center.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--check"], { cwd: fileURLToPath(new URL("./support/", import.meta.url)), encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const html = readFileSync(new URL("../startup-center-static-preview.html", import.meta.url), "utf8");
  const original = readFileSync(new URL("../plugin-startup-config-static-preview.html", import.meta.url), "utf8");
  const originalShell = original.match(/<main id="startup-root"[\s\S]*?<\/main>/)[0];
  assert.ok(html.includes(originalShell.replace(/^<main\b/, "<div").replace(/<\/main>$/, "</div>")));
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs remain unique after embedding");
  assert.doesNotMatch(html, /@@PLUGIN_SHELL@@|type="module"|https?:\/\//);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!match[1].startsWith("data:")) assert.equal(existsSync(new URL("../" + match[1], import.meta.url)), true, match[1]);
  }
});
