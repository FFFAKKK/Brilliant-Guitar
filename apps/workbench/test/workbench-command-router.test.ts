import assert from "node:assert/strict";
import test from "node:test";
import type { KeyboardEvent } from "react";
import { normalizedShortcut, WorkbenchCommandRouter } from "../src/commands/workbench-command.ts";

function keyboardEvent(key: string, options: Partial<Pick<KeyboardEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat">> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    nativeEvent: { isComposing: false },
    preventDefault() {},
    stopPropagation() {},
    ...options,
  } as unknown as KeyboardEvent;
}

test("shortcut normalization gives desktop commands a platform-neutral identity", () => {
  assert.equal(normalizedShortcut({ key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), "Mod+Shift+S");
  assert.equal(normalizedShortcut({ key: "=", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), "Mod+Plus");
});

test("the command router enforces scope, enabled state and duplicate identities without owning menu UI", () => {
  const calls: string[] = [];
  const router = new WorkbenchCommandRouter([
    { id: "global.save", label: "保存", shortcut: "Mod+S", scope: "global", enabled: true, run: () => { calls.push("save"); } },
    { id: "score.delete", label: "删除", shortcut: "Delete", scope: "score", enabled: false, run: () => { calls.push("delete"); } },
  ]);
  const prevented: string[] = [];
  const event = { key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false,
    nativeEvent: { isComposing: false }, preventDefault: () => prevented.push("prevent"),
    stopPropagation: () => prevented.push("stop") } as unknown as KeyboardEvent;
  assert.equal(router.handle(event, "score"), true);
  assert.deepEqual(calls, ["save"]);
  assert.deepEqual(prevented, ["prevent", "stop"]);
  assert.equal(router.execute("score.delete"), false);
  const dispose = router.register({ id: "score.insert", label: "输入", scope: "score", enabled: true, run: () => { calls.push("insert"); } });
  assert.deepEqual(router.list("score").map((command) => command.id), ["global.save", "score.delete", "score.insert"]);
  dispose();
  assert.equal(router.get("score.insert"), undefined);
  assert.throws(() => new WorkbenchCommandRouter([
    { id: "same", label: "A", scope: "global", enabled: true, run() {} },
    { id: "same", label: "B", scope: "global", enabled: true, run() {} },
  ]), /Duplicate/);
});

test("history and zoom shortcuts are resolved by the shared router without consuming note keys", () => {
  const calls: string[] = [];
  const router = new WorkbenchCommandRouter([
    { id: "edit.undo", label: "撤销", shortcut: "Mod+Z", scope: "global", enabled: true, run: () => { calls.push("undo"); } },
    { id: "edit.redo", label: "重做", shortcut: "Mod+Shift+Z", scope: "global", enabled: true, run: () => { calls.push("redo"); } },
    { id: "view.zoom-in", label: "放大", shortcut: "Mod+Plus", scope: "score", enabled: true, run: () => { calls.push("in"); } },
    { id: "view.zoom-out", label: "缩小", shortcut: "Mod+Minus", scope: "score", enabled: true, run: () => { calls.push("out"); } },
    { id: "view.zoom-fit", label: "适合页面", shortcut: "Mod+0", scope: "score", enabled: true, run: () => { calls.push("fit"); } },
  ]);

  assert.equal(router.handle(keyboardEvent("z"), "score"), false);
  assert.equal(router.handle(keyboardEvent("+"), "score"), false);
  assert.equal(router.handle(keyboardEvent("-"), "score"), false);
  assert.equal(router.handle(keyboardEvent("z", { ctrlKey: true }), "score"), true);
  assert.equal(router.handle(keyboardEvent("z", { metaKey: true, shiftKey: true }), "score"), true);
  assert.equal(router.handle(keyboardEvent("=", { ctrlKey: true }), "score"), true);
  assert.equal(router.handle(keyboardEvent("-", { metaKey: true }), "score"), true);
  assert.equal(router.handle(keyboardEvent("0", { ctrlKey: true }), "score"), true);
  assert.equal(router.handle(keyboardEvent("z", { ctrlKey: true, altKey: true }), "score"), false);
  assert.deepEqual(calls, ["undo", "redo", "in", "out", "fit"]);
});
