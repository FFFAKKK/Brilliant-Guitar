import assert from "node:assert/strict";
import test from "node:test";
import { createPluginStatusReadPort } from "../src/runtime/plugin-status-read-port.js";

test("plugin status read port exposes only frozen lifecycle data and follows platform changes", () => {
  const listeners = new Set();
  let records = [{ namespace: "example.one", status: "active", active: true }];
  const platform = {
    list: () => records,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const port = createPluginStatusReadPort(platform);
  const seen = [];
  const stop = port.subscribe(value => seen.push(value));
  const first = port.snapshot();
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first[0]));
  assert.deepEqual(first, [{ namespace: "example.one", status: "active", active: true }]);
  records = [{ namespace: "example.one", status: "failed", active: false, error: new Error("坏了") }];
  for (const listener of listeners) listener();
  assert.deepEqual(seen[0], [{ namespace: "example.one", status: "failed", active: false, error: "坏了" }]);
  stop();
});

test("plugin status read port projects contribution metadata without executable fields", () => {
  const manifest = {
    namespace: "example.score",
    components: [{ id: "example.score.panel", title: "谱面工具", role: "tool", uiKind: "panel", slots: ["right"],
      mount() {}, run() {} }],
    commands: [{ id: "example.score.insert", label: "插入音符", run() {} }],
    menuItems: [{ menu: "score", command: "example.score.insert", label: "插入音符", run() {} }],
    shortcuts: [{ id: "example.score.insert-key", command: "example.score.insert", scope: "score", keys: ["N"], run() {} }],
  };
  const platform = {
    list: () => [{ namespace: manifest.namespace, status: "active", active: true, manifest }],
    describe: () => [{ namespace: manifest.namespace, status: "active", active: true, manifest }],
    subscribe() { return () => {}; },
  };
  const port = createPluginStatusReadPort(platform);
  const record = port.snapshot()[0];
  assert.ok(Object.isFrozen(record.manifest));
  assert.ok(Object.isFrozen(record.manifest.components));
  assert.deepEqual(record.manifest, {
    namespace: "example.score",
    components: [{ id: "example.score.panel", title: "谱面工具", role: "tool", kind: "panel", slots: ["right"] }],
    commands: [{ id: "example.score.insert", label: "插入音符" }],
    menuItems: [{ menu: "score", command: "example.score.insert", label: "插入音符" }],
    shortcuts: [{ id: "example.score.insert-key", command: "example.score.insert", scope: "score", keys: ["N"] }],
  });
  assert.equal("run" in record.manifest, false);
  assert.equal("mount" in record.manifest.components[0], false);
  assert.equal("run" in record.manifest.commands[0], false);
});
