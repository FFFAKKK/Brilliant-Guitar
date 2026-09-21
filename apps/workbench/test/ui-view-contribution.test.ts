import assert from "node:assert/strict";
import test from "node:test";
import { UiPluginHost } from "../src/ui/plugin-manager.ts";
import type { InternalUiPluginModule } from "../src/ui/plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";

test("installed views resolve from typed projections without changing component layout contracts", () => {
  const state = defineUiProjection<{ readonly label: string }>("test.view-state");
  const host = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([state]));
  host.install({
    manifest: { id: "example.view", name: "示例", version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module", activation: "always", requires: { hostFeatures: [], projections: [state.id] },
      contributes: { views: ["example.panel"], commands: [], interactions: [], componentExtensions: [] } },
    projections: [state], commands: [], interactions: [], componentExtensions: [], views: [{
      definition: { id: "example.panel", version: "1.0", kind: "view", domain: "example.view", slots: ["workspace"],
        presentation: { allowed: ["inline"], default: "inline" }, capabilities: {},
        permissions: { projections: [state.id], commands: [] } },
      label: "示例视图", render: (reader) => reader.get(state).label,
    }],
  });
  const views = host.resolveViews(host.projections.snapshot([bindUiProjection(state, { label: "当前投影" })]));
  assert.equal(views.get("example.panel")?.label, "示例视图");
  assert.equal(views.get("example.panel")?.render(), "当前投影");
  assert.equal(host.components.get("example.panel")?.kind, "view");
});

const first = defineUiProjection<string>("test.component.first");
const second = defineUiProjection<string>("test.component.second");
const outside = defineUiProjection<string>("test.component.outside");

function scopedModule(allowed: string[]): InternalUiPluginModule {
  return {
    manifest: { id: "example.scoped", name: "Scoped", version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module", activation: "always", requires: { hostFeatures: [], projections: [first.id, second.id] },
      contributes: { views: ["example.scoped.view"], commands: [], interactions: [], componentExtensions: [] } },
    projections: [first, second], commands: [], interactions: [], componentExtensions: [],
    views: [{
      definition: { id: "example.scoped.view", version: "1.0", kind: "view", domain: "example.scoped",
        slots: ["workspace"], presentation: { allowed: ["inline"], default: "inline" }, capabilities: {},
        permissions: { projections: allowed, commands: [] } },
      label: "Scoped",
      render: (reader) => {
        const values = [first, second].map((projection) => {
          if (allowed.includes(projection.id)) return reader.get(projection);
          assert.throws(() => reader.get(projection), /not declared/);
          return "denied";
        });
        assert.throws(() => reader.get(outside), /not declared/);
        return values.join(",");
      },
    }],
  };
}

for (const [label, allowed, expected] of [
  ["first only", [first.id], "A,denied"],
  ["second only", [second.id], "denied,B"],
  ["empty", [], "denied,denied"],
] as const) {
  test(`resolved component projections honor ${label} permissions within the plugin`, () => {
    const host = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([first, second, outside]));
    host.install(scopedModule([...allowed]));
    const snapshot = host.projections.snapshot([
      bindUiProjection(first, "A"), bindUiProjection(second, "B"), bindUiProjection(outside, "C"),
    ]);
    assert.equal(host.resolveViews(snapshot).get("example.scoped.view")?.render(), expected);
  });
}

test("sibling views of one plugin receive separate projection readers", () => {
  const host = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([first, second, outside]));
  const module = scopedModule([first.id]);
  const sibling = scopedModule([second.id]).views[0]!;
  host.install({ ...module,
    manifest: { ...module.manifest,
      contributes: { ...module.manifest.contributes, views: ["example.scoped.view", "example.sibling.view"] } },
    views: [...module.views, { ...sibling, definition: { ...sibling.definition, id: "example.sibling.view" } }],
  });
  const views = host.resolveViews(host.projections.snapshot([
    bindUiProjection(first, "A"), bindUiProjection(second, "B"), bindUiProjection(outside, "C"),
  ]));
  assert.equal(views.get("example.scoped.view")?.render(), "A,denied");
  assert.equal(views.get("example.sibling.view")?.render(), "denied,B");
});

test("component readers use captured permissions and stay bound to their resolved snapshot", () => {
  const host = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([first, second]));
  const allowed = [first.id];
  const module = scopedModule(allowed);
  module.views[0]!.render = (reader) => {
    assert.throws(() => reader.get(second), /not declared/);
    return reader.get(first);
  };
  host.install(module);
  allowed.splice(0, 1, second.id);
  const before = host.resolveViews(host.projections.snapshot([
    bindUiProjection(first, "before"), bindUiProjection(second, "hidden-before"),
  ]));
  const after = host.resolveViews(host.projections.snapshot([
    bindUiProjection(first, "after"), bindUiProjection(second, "hidden-after"),
  ]));
  assert.equal(before.get("example.scoped.view")?.render(), "before");
  assert.equal(after.get("example.scoped.view")?.render(), "after");
  assert.equal(before.get("example.scoped.view")?.render(), "before");
});

test("SDK views keep component scope while commands and active extensions retain their plugin scope", () => {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]), projections: [first, second, outside],
  });
  const extensionPoint = "example.container.controls";
  const visiblePermissions = [first.id];
  platform.register(definePlugin({
    id: "example.container", name: "Container", version: "1.0.0", activation: "always",
    projections: [first, second],
    commands: [{
      id: "example.container.run",
      create: (reader) => {
        assert.throws(() => reader.get(outside), /not declared/);
        return { id: "example.container.run", label: reader.get(second), scope: "global", enabled: true, run() {} };
      },
    }],
    views: [{
      definition: { id: "example.container.view", version: "1.0", kind: "view", domain: "example.container",
        slots: ["workspace"], presentation: { allowed: ["inline"], default: "inline" }, capabilities: {},
        permissions: { projections: visiblePermissions, commands: [] }, extensionPoints: [extensionPoint] },
      label: "Container",
      render: (reader, host) => {
        assert.throws(() => reader.get(second), /not declared/);
        assert.throws(() => reader.get(outside), /not declared/);
        return `${reader.get(first)}:${host.extensions(extensionPoint).map((extension) => extension.render()).join(",")}`;
      },
    }],
  }));
  platform.register(definePlugin({
    id: "example.extension", name: "Extension", version: "1.0.0", activation: "user",
    projections: [second],
    componentExtensions: [{
      id: "example.extension.control", extensionPoint, order: 10,
      render: (reader) => {
        assert.throws(() => reader.get(first), /not declared/);
        return reader.get(second);
      },
    }],
  }));
  platform.register(definePlugin({
    id: "example.inactive", name: "Inactive", version: "1.0.0", activation: "user",
    componentExtensions: [{
      id: "example.inactive.control", extensionPoint,
      render: () => assert.fail("Inactive extension must not render"),
    }],
  }));
  visiblePermissions.push(second.id);
  platform.activate("example.extension");
  platform.start();
  const snapshot = platform.projections().snapshot([
    bindUiProjection(first, "A"), bindUiProjection(second, "B"), bindUiProjection(outside, "C"),
  ]);
  assert.equal(platform.resolveViews(snapshot).get("example.container.view")?.render(), "A:B");
  assert.equal(platform.resolveCommands(snapshot)[0]?.label, "B");
  platform.deactivate("example.extension");
  assert.equal(platform.resolveViews(snapshot).get("example.container.view")?.render(), "A:B");
});
