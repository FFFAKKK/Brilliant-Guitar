import assert from "node:assert/strict";
import test from "node:test";

import { UiPluginCatalog } from "../src/ui/plugin-catalog.ts";
import { UiPluginHost } from "../src/ui/plugin-manager.ts";
import type { InternalUiPluginModule } from "../src/ui/plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchCapabilityRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";
import { defineNoteControlExtension, NOTE_CONTROL_EXTENSION_POINT } from "../src/ui/note-control-extension.ts";

const state = defineUiProjection<{ readonly instrument: string }>("test.instrument-state");
const extensionPoint = NOTE_CONTROL_EXTENSION_POINT;

function manifest(input: Readonly<{
  id: string;
  activation?: "always" | "user";
  views?: readonly string[];
  extensions?: readonly string[];
}>) {
  return {
    id: input.id,
    name: input.id,
    version: "1.0.0",
    apiVersion: WORKBENCH_PLUGIN_API_VERSION,
    runtime: "internal-module" as const,
    activation: input.activation ?? "always",
    requires: { capabilities: [] as const, projections: [state.id] },
    contributes: {
      views: input.views ?? [],
      commands: [] as const,
      interactions: [] as const,
      componentExtensions: input.extensions ?? [],
    },
  };
}

const noteControl: InternalUiPluginModule = {
  manifest: manifest({ id: "example.note-control", views: ["example.note-control-panel"] }),
  projections: [state],
  commands: [],
  interactions: [],
  componentExtensions: [],
  views: [{
    definition: {
      id: "example.note-control-panel",
      version: "1.0",
      kind: "tool",
      domain: "notation.input",
      slots: ["bottom"],
      presentation: { allowed: ["panel"], default: "panel" },
      capabilities: {},
      permissions: { projections: [state.id], commands: [] },
      extensionPoints: [extensionPoint],
    },
    label: "音符控制",
    render: (_projections, host) => host.extensions(extensionPoint)
      .map((extension) => extension.render()).join(","),
  }],
};

const guitar: InternalUiPluginModule = {
  manifest: manifest({ id: "example.instrument.guitar", activation: "user",
    extensions: ["example.instrument.guitar.techniques"] }),
  projections: [state],
  commands: [],
  interactions: [],
  views: [],
  componentExtensions: [defineNoteControlExtension({
    id: "example.instrument.guitar.techniques",
    order: 30,
    render: (projections) => projections.get(state).instrument === "guitar" ? "guitar-techniques" : null,
  })],
};

test("startup catalog discovers extension-only instrument plugins and installs component owners first", () => {
  const catalog = new UiPluginCatalog([guitar, noteControl]);

  assert.deepEqual(catalog.list().map((plugin) => plugin.manifest.id),
    ["example.instrument.guitar", "example.note-control"]);
  assert.deepEqual(catalog.findComponentExtensions(extensionPoint).map((item) => item.pluginId),
    ["example.instrument.guitar"]);
  assert.deepEqual(catalog.installationPlan().map((plugin) => plugin.manifest.id),
    ["example.note-control", "example.instrument.guitar"]);

  const host = new UiPluginHost(new WorkbenchCapabilityRegistry([]), new UiProjectionRegistry([state]));
  for (const plugin of catalog.installationPlan()) host.install(plugin);
  const snapshot = host.projections.snapshot([bindUiProjection(state, { instrument: "guitar" })]);

  assert.equal(host.resolveViews(snapshot).get("example.note-control-panel")?.render(), "");
  assert.equal(host.resolveViews(snapshot, new Set(["example.instrument.guitar"]))
    .get("example.note-control-panel")?.render(), "guitar-techniques");
});

test("instrument extensions may stay registered while hiding controls outside their document context", () => {
  const host = new UiPluginHost(new WorkbenchCapabilityRegistry([]), new UiProjectionRegistry([state]));
  for (const plugin of new UiPluginCatalog([noteControl, guitar]).installationPlan()) host.install(plugin);
  const snapshot = host.projections.snapshot([bindUiProjection(state, { instrument: "piano" })]);

  assert.equal(host.resolveViews(snapshot, new Set(["example.instrument.guitar"]))
    .get("example.note-control-panel")?.render(), "");
  assert.equal(host.ownerOfComponentExtension("example.instrument.guitar.techniques")?.id,
    "example.instrument.guitar");
});
