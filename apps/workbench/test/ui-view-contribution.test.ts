import assert from "node:assert/strict";
import test from "node:test";
import { UiPluginHost } from "../src/ui/plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchCapabilityRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";

test("installed views resolve from typed projections without changing component layout contracts", () => {
  const state = defineUiProjection<{ readonly label: string }>("test.view-state");
  const host = new UiPluginHost(new WorkbenchCapabilityRegistry([]), new UiProjectionRegistry([state]));
  host.install({
    manifest: { id: "example.view", name: "示例", version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module", activation: "always", requires: { capabilities: [], projections: [state.id] },
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
