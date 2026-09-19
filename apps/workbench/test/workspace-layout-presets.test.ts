import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WORKSPACE_CONFIGURATION } from "../src/contracts/workspace-configuration.ts";
import { applyWorkspaceLayoutPreset, identifyWorkspaceLayoutPreset } from "../src/ui/workspace-layout-presets.ts";

test("workspace presets expose complete, editing and playback work zones", () => {
  assert.equal(identifyWorkspaceLayoutPreset(DEFAULT_WORKSPACE_CONFIGURATION), "complete");
  const editing = applyWorkspaceLayoutPreset(DEFAULT_WORKSPACE_CONFIGURATION, "editing");
  assert.deepEqual(editing.dock.visibility, { top: true, right: false, bottom: false, left: true });
  assert.equal(editing.dock.selection.left, "notation.note-input");
  assert.equal(identifyWorkspaceLayoutPreset(editing), "editing");
  const playback = applyWorkspaceLayoutPreset(editing, "playback");
  assert.deepEqual(playback.dock.visibility, { top: true, right: true, bottom: false, left: false });
  assert.equal(playback.dock.selection.right, "playback.output");
  assert.equal(identifyWorkspaceLayoutPreset(playback), "playback");
});

test("workspace presets preserve component placements, dock sizes and unrelated settings", () => {
  const editing = applyWorkspaceLayoutPreset(DEFAULT_WORKSPACE_CONFIGURATION, "editing");
  assert.equal(editing.uiLayout, DEFAULT_WORKSPACE_CONFIGURATION.uiLayout);
  assert.equal(editing.dock.layout, DEFAULT_WORKSPACE_CONFIGURATION.dock.layout);
  assert.equal(editing.inspectorWidth, DEFAULT_WORKSPACE_CONFIGURATION.inspectorWidth);
  const custom = { ...editing, dock: { ...editing.dock,
    visibility: { top: false, right: true, bottom: false, left: true } } };
  assert.equal(identifyWorkspaceLayoutPreset(custom), "custom");
});
