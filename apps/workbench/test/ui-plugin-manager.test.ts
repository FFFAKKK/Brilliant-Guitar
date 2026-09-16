import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_PARTY_UI_PLUGINS } from "../src/ui/first-party-plugins.ts";
import { UiPluginManager } from "../src/ui/plugin-manager.ts";
import type { InternalUiPluginModule } from "../src/ui/plugin-manager.ts";
import type { UiComponentDefinition } from "../src/ui/plugin-contract.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchCapabilityRegistry } from "../src/ui/plugin-manifest.ts";

const definition = (id: string): UiComponentDefinition => ({
  id, version: "1.0", kind: "tool", domain: "test.utility", slots: ["bottom"],
  presentation: { allowed: ["panel"], default: "panel" }, capabilities: {}, permissions: { reads: [], commands: [] },
  mount: () => ({ update() {}, dispose() {} }),
});

function plugin(id: string, component: UiComponentDefinition, requires: readonly string[] = []): InternalUiPluginModule {
  return { manifest: { id, name: id, version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
    runtime: "internal-module", requires, contributes: { components: [component.id], views: [component.id], commands: [] } },
  components: [component] };
}

test("the startup extension host installs first-party plugins through manifests", () => {
  const capabilities = new WorkbenchCapabilityRegistry([
    "workbench.layout", "workbench.commands", "score.document", "score.selection", "score.input", "score.history", "view.paper",
  ]);
  const manager = new UiPluginManager(capabilities);
  for (const item of FIRST_PARTY_UI_PLUGINS) manager.install(item);
  assert.deepEqual(manager.list().map((item) => item.id), [
    "brilliant.notation.staff", "brilliant.notation.note-control", "brilliant.editing.history", "brilliant.view.paper-zoom",
  ]);
  assert.deepEqual(manager.components.list().map((item) => item.id), [
    "notation.staff-view", "notation.note-input", "notation.history-control", "notation.paper-zoom",
  ]);
  assert.equal(manager.ownerOf("notation.paper-zoom")?.id, "brilliant.view.paper-zoom");
  assert.equal(manager.ownerOfCommand("edit.undo")?.id, "brilliant.editing.history");
});

test("installation rejects missing capabilities and mismatched compiled bindings atomically", () => {
  const manager = new UiPluginManager(new WorkbenchCapabilityRegistry(["workbench.layout"]));
  assert.throws(() => manager.install(plugin("example.missing", definition("example.missing-view"), ["score.document"])), /unavailable capabilities/);
  assert.equal(manager.components.list().length, 0);
  const mismatched = plugin("example.mismatch", definition("example.actual"));
  assert.throws(() => manager.install({ ...mismatched, manifest: { ...mismatched.manifest,
    contributes: { components: ["example.declared"], views: ["example.declared"], commands: [] } } }), /does not match/);
  assert.equal(manager.components.list().length, 0);
});

test("component ownership and declared views cannot be stolen by another plugin", () => {
  const manager = new UiPluginManager(new WorkbenchCapabilityRegistry([]));
  manager.install(plugin("example.first", definition("example.panel")));
  assert.throws(() => manager.install(plugin("example.second", definition("example.panel"))), /already owned/);
  assert.throws(() => manager.indexViews([{ componentId: "unknown.panel", label: "未知", render: () => null }]), /not declared/);
});

test("command contributions are accepted only from the plugin that declared their IDs", () => {
  const manager = new UiPluginManager(new WorkbenchCapabilityRegistry([]));
  const first = plugin("example.first", definition("example.first-panel"));
  manager.install({ ...first, manifest: { ...first.manifest,
    contributes: { ...first.manifest.contributes, commands: ["example.run"] } } });
  const command = { id: "example.run", label: "运行", scope: "global" as const, enabled: true, run() {} };
  assert.deepEqual(manager.indexCommands([{ pluginId: "example.first", command }]), [command]);
  assert.throws(() => manager.indexCommands([{ pluginId: "example.other", command }]), /not declared/);
  assert.throws(() => manager.indexCommands([
    { pluginId: "example.first", command }, { pluginId: "example.first", command },
  ]), /Duplicate/);
});
