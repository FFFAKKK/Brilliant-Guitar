import assert from "node:assert/strict";
import test from "node:test";
import { applyShortcutBindings, shortcutLabel } from "../src/commands/workbench-command.ts";
import type { WorkbenchCommand } from "../src/commands/workbench-command.ts";
import { createShortcutTemplate, notationInputShortcutConflict, parseShortcutTemplate } from "../src/contracts/shortcut-settings.ts";

const commands: readonly WorkbenchCommand[] = [
  { id: "file.save", label: "保存", shortcut: "Mod+S", shortcutLabel: "Ctrl/⌘ + S", scope: "global", enabled: true, run() {} },
  { id: "playback.toggle", label: "播放", shortcut: "Space", shortcutLabel: "Space", scope: "score", enabled: true, run() {} },
  { id: "view.reset-layout", label: "恢复布局", scope: "global", enabled: true, run() {} },
];

test("user bindings override, clear and retain official command shortcuts", () => {
  const resolved = applyShortcutBindings(commands, {
    "file.save": "Mod+Shift+S",
    "playback.toggle": null,
    "view.reset-layout": "Mod+Alt+0",
  });
  assert.equal(resolved[0]?.shortcut, "Mod+Shift+S");
  assert.equal(resolved[0]?.shortcutLabel, "Ctrl/⌘ + Shift + S");
  assert.equal(resolved[0]?.defaultShortcut, "Mod+S");
  assert.equal(resolved[1]?.shortcut, undefined);
  assert.equal(resolved[1]?.defaultShortcut, "Space");
  assert.equal(resolved[2]?.shortcut, "Mod+Alt+0");
  assert.equal(shortcutLabel("Mod+Alt+ArrowLeft"), "Ctrl/⌘ + Alt + ←");
});

test("shortcut templates round-trip strict portable mappings", () => {
  const template = createShortcutTemplate("演奏模板", { "file.save": "Mod+S", "playback.toggle": "Space" });
  assert.deepEqual(parseShortcutTemplate(JSON.parse(JSON.stringify(template))), template);
  assert.equal(parseShortcutTemplate({ ...template, surprise: true }), null);
  assert.equal(parseShortcutTemplate({ ...template,
    bindings: { "file.save": "Mod+S", "file.open": "Mod+S" } }), null);
  assert.equal(parseShortcutTemplate({ ...template, bindings: { "Bad Command": "Mod+S" } }), null);
});

test("staff direct-entry conflicts are explicit without blocking customized bindings", () => {
  assert.equal(notationInputShortcutConflict("C"), "会占用五线谱音名输入");
  assert.equal(notationInputShortcutConflict("Shift+R"), "会占用五线谱休止符输入");
  assert.equal(notationInputShortcutConflict("5"), "会占用五线谱组号输入");
  assert.equal(notationInputShortcutConflict("Mod+C"), null);
  assert.equal(notationInputShortcutConflict("Alt+R"), null);
  assert.equal(notationInputShortcutConflict("Shift+5"), null);
});
