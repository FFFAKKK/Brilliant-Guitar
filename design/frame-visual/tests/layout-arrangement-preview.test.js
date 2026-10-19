import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { layoutArrangementPreview } from "../src/shell/layout-visual-state.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture({ rejected = false } = {}) {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: store.read.snapshot().adjusting });
  const commands = [];
  const view = createWorkspaceLayoutVisual({ state: accepted(), begin: () => store.beginAdjustment(),
    finish: confirm => store.finishAdjustment(confirm), region: side => store.toggleRegion(side),
    resize: (side, value) => store.resize(side, value), arrange: mode => {
      commands.push(mode); return rejected ? { ok: false } : store.arrange(mode);
    } });
  const stop = store.read.subscribe(() => view.update(accepted()));
  document.body.append(view.element);
  return { store, view, commands, query: id => view.element.querySelector("#" + id), dispose() { stop(); view.dispose(); } };
}

test("preset forecast agrees with the unchanged host command across capacities and custom peer sizes", () => {
  for (const [width, height] of [[800, 600], [1024, 720], [1280, 720], [1440, 900], [1920, 1080]]) {
    for (const mode of ["balanced", "compact"]) {
      const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width, height });
      store.resize("right", 400); store.resize("top", 280);
      const before = store.read.snapshot(), preview = layoutArrangementPreview(before, mode);
      assert.equal(store.read.snapshot(), before, "forecast is read-only");
      store.arrange(mode);
      for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "arrangement"]) {
        assert.equal(preview[key], store.read.snapshot()[key], `${width}x${height}/${mode}/${key}`);
      }
    }
  }
});

test("preview choice moves only private artwork; applying invokes the original command exactly once", () => withTestDocument(() => {
  const f = fixture(), before = f.store.read.snapshot();
  const input = f.query("layout-size-right");
  f.query("layout-compact").click();
  assert.equal(f.store.read.snapshot(), before);
  assert.deepEqual(f.commands, []);
  assert.equal(f.view.element.dataset.previewing, "true");
  assert.equal(f.query("layout-compact").getAttribute("aria-pressed"), "true");
  assert.equal(Number(input.value), 260);
  assert.equal(f.query("layout-apply-arrangement").disabled, false);
  f.query("layout-apply-arrangement").click();
  assert.deepEqual(f.commands, ["compact"]);
  assert.equal(f.store.read.snapshot().rightWidth, 230);
  assert.equal(f.query("layout-size-right"), input, "input lifetime survives the deliberate application");
  assert.equal(f.view.element.dataset.previewing, "false");
  assert.equal(f.query("layout-apply-arrangement").disabled, true);
  f.query("layout-balanced").click(); f.query("layout-default").click();
  assert.equal(f.view.element.dataset.previewing, "false", "unchanged default still discards the private forecast");
  assert.equal(f.query("layout-balanced").getAttribute("aria-pressed"), "true");
  f.query("layout-apply-arrangement").click();
  assert.deepEqual(f.commands, ["compact", "default"]);
  f.dispose();
}));

test("rejected apply preserves the forecast and accepted values; hiding or geometry changes discard it", () => withTestDocument(() => {
  const f = fixture({ rejected: true });
  f.query("layout-compact").click(); f.query("layout-apply-arrangement").click();
  assert.equal(f.store.read.snapshot().rightWidth, 260);
  assert.equal(f.view.element.dataset.previewing, "true");
  f.view.setVisible(false); f.view.setVisible(true);
  assert.equal(f.query("layout-balanced").getAttribute("aria-pressed"), "true");
  assert.equal(f.query("layout-apply-arrangement").disabled, true);
  f.query("layout-compact").click(); f.store.resize("right", 300);
  assert.equal(f.view.element.dataset.previewing, "false");
  assert.equal(Number(f.query("layout-size-right").value), 300);
  f.query("layout-compact").click(); f.store.setViewport(800, 600);
  assert.equal(f.view.element.dataset.previewing, "false");
  f.dispose();
}));

test("content editing has scoped names and does not imply cancellation of live region dimensions", () => withTestDocument(() => {
  const f = fixture();
  assert.equal(f.query("composer-edit").textContent, "编辑内容");
  f.query("composer-edit").click(); f.store.resize("right", 300);
  assert.equal(f.query("layout-cancel").getAttribute("aria-label"), "取消内容编辑");
  assert.equal(f.query("layout-confirm").getAttribute("aria-label"), "确认内容编辑");
  assert.equal(f.query("layout-cancel").getAttribute("title"), "取消内容编辑");
  assert.equal(f.query("layout-session").textContent, "编辑中 · 未修改");
  f.query("layout-cancel").click();
  assert.equal(f.store.read.snapshot().adjusting, false);
  assert.equal(f.store.read.snapshot().rightWidth, 300);
  f.dispose();
}));
