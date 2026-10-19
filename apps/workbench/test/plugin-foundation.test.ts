import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginSettingsRegistry } from "../src/plugins/plugin-settings.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

const identity = (id: string) => ({ id, name: id, version: "0.1.0" });
const settings = { schemaVersion: 1, defaults: 1,
  parse: (value: unknown) => Number.isSafeInteger(value) ? value : null };
const observerFault = () => { throw new Error("observer fault"); };

test("formal platform commits and notifies healthy subscribers despite a throwing observer", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  const seen: unknown[] = [];
  platform.subscribe(observerFault);
  platform.subscribe(() => seen.push(platform.list().map(item => [item.manifest.id, item.status, item.nextLaunchActive])));
  assert.doesNotThrow(() => platform.register(definePlugin({ ...identity("foundation.panel"), activation: "user" })));
  assert.deepEqual(seen.at(-1), [["foundation.panel", "discovered", false]]);
  assert.equal(platform.activate("foundation.panel").effect, "configured");
  assert.doesNotThrow(() => platform.start());
  assert.deepEqual(seen.at(-1), [["foundation.panel", "active", true]]);
  assert.equal(platform.deactivate("foundation.panel").effect, "restart-required");
  assert.doesNotThrow(() => platform.dispose());
  assert.deepEqual(seen.at(-1), []);
  assert.equal(platform.phase(), "disposed");
  assert.doesNotThrow(() => platform.dispose());
});

test("settings write, reset and restore return their committed result and notify remaining observers", () => {
  const registry = new PluginSettingsRegistry();
  registry.register("foundation.settings", settings);
  const seen: number[] = [];
  registry.subscribe(observerFault);
  registry.subscribe(() => seen.push(registry.read<number>("foundation.settings")));
  assert.equal(registry.write("foundation.settings", 2), 2);
  assert.equal(registry.reset("foundation.settings"), 1);
  assert.deepEqual(registry.restore({ "foundation.settings": { schemaVersion: 1, value: 3 } }),
    { restored: ["foundation.settings"], defaulted: [] });
  assert.deepEqual(seen, [2, 1, 3]);
  registry.dispose();
});

test("a platform subscription added during dispatch waits until the next notification", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  let added = false, late = 0;
  platform.subscribe(() => { if (!added) { added = true; platform.subscribe(() => { late++; }); } });
  platform.register(definePlugin(identity("foundation.first"))); assert.equal(late, 0);
  platform.register(definePlugin(identity("foundation.second"))); assert.equal(late, 1);
  platform.dispose();
});

test("settings capture immutable JSON values so an input/read/serialized reference cannot bypass validation or poison reset", () => {
  const registry = new PluginSettingsRegistry(), defaults = { nested: { count: 1 }, tags: ["default"] };
  registry.register("foundation.mutable", { schemaVersion: 1, defaults,
    parse: value => typeof value === "object" && value !== null ? value : null });
  defaults.nested.count = 9;
  assert.deepEqual(registry.read("foundation.mutable"), { nested: { count: 1 }, tags: ["default"] });
  const input = { nested: { count: 2 }, tags: ["accepted"] };
  registry.write("foundation.mutable", input); input.nested.count = 99; input.tags.push("late");
  const accepted = registry.read<typeof input>("foundation.mutable");
  assert.deepEqual(accepted, { nested: { count: 2 }, tags: ["accepted"] });
  assert.throws(() => { accepted.nested.count = 42; }, TypeError);
  assert.throws(() => { accepted.tags.push("read-write"); }, TypeError);
  assert.equal(Object.isFrozen(registry.serialize()["foundation.mutable"]?.value), true);
  assert.deepEqual(registry.reset("foundation.mutable"), { nested: { count: 1 }, tags: ["default"] });
  registry.dispose();
});

test("settings reject nonpersistent parser output atomically while preserving false, zero, arrays and nested null", () => {
  const registry = new PluginSettingsRegistry();
  registry.register("foundation.json", { schemaVersion: 1, defaults: false, parse: value => value });
  for (const value of [false, 0, "", [], {}, { nested: null }]) assert.deepEqual(registry.write("foundation.json", value), value);
  const previous = registry.read("foundation.json"), cycle: Record<string, unknown> = {}; cycle.self = cycle;
  let getters = 0;
  const accessor = { get count() { getters++; return 1; } };
  for (const value of [cycle, accessor, { fn() {} }, { missing: undefined }, { value: Infinity }, new Date(), [, 1]]) {
    assert.throws(() => registry.write("foundation.json", value), /invalid/);
    assert.equal(registry.read("foundation.json"), previous);
  }
  assert.equal(getters, 0); registry.dispose();
});

test("a throwing diagnostic hook cannot stop later plugins or leave a failed package discovered", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    onDiagnostic: observerFault });
  platform.register(definePlugin({ ...identity("foundation.bad"), hostFeatures: ["foundation.missing"] }));
  platform.register(definePlugin(identity("foundation.good")));
  assert.doesNotThrow(() => platform.start());
  assert.deepEqual(platform.list().map(item => [item.manifest.id, item.status]),
    [["foundation.bad", "failed"], ["foundation.good", "active"]]);
  assert.equal(platform.diagnostics.list().length, 1);
  platform.dispose();
});

for (const mode of ["diagnostic-sync", "platform-async", "settings-async", "diagnostic-async", "hook-async", "readonly-read-async", "readonly-state-async", "settings-parser-async"]) {
  test(`${mode}: rejected notification callbacks are contained under strict Node rejection handling`, () => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--unhandled-rejections=strict",
      fileURLToPath(new URL("./fixtures/plugin-foundation-probe.ts", import.meta.url)), mode],
    { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${mode}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /"healthyNotifications":[12]/);
  });
}
