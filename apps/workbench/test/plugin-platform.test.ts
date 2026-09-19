import assert from "node:assert/strict";
import test from "node:test";

import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { PluginManifestDiscovery } from "../src/plugins/plugin-discovery.ts";
import type { InternalUiPluginModule, UiCommandContribution } from "../src/ui/plugin-manager.ts";
import type { UiComponentDefinition } from "../src/ui/plugin-contract.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchCapabilityRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection, defineUiProjection } from "../src/ui/projection-registry.ts";
import type { PluginInstrumentContribution, PluginPlaybackOutputContribution } from "../src/plugins/plugin-sdk.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";

const state = defineUiProjection<{ readonly enabled: boolean }>("test.platform.state");

function definition(id: string, commands: readonly string[] = []): UiComponentDefinition {
  return {
    id,
    version: "1.0",
    kind: "tool",
    domain: "test.platform",
    slots: ["bottom"],
    presentation: { allowed: ["panel"], default: "panel" },
    capabilities: {},
    permissions: { projections: [state.id], commands },
  };
}

function plugin(input: Readonly<{
  id: string;
  componentId: string;
  activation?: "always" | "user";
  commands?: readonly UiCommandContribution[];
  instruments?: readonly PluginInstrumentContribution[];
  playbackOutputs?: readonly PluginPlaybackOutputContribution[];
}>): InternalUiPluginModule {
  const commands = input.commands ?? [];
  const instruments = input.instruments ?? [];
  const playbackOutputs = input.playbackOutputs ?? [];
  const component = definition(input.componentId, commands.map((command) => command.id));
  return {
    manifest: {
      id: input.id,
      name: input.id,
      version: "1.0.0",
      apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module",
      activation: input.activation ?? "always",
      requires: { capabilities: [], projections: [state.id] },
      contributes: {
        views: [component.id],
        commands: commands.map((command) => command.id),
        interactions: [],
        componentExtensions: [],
        instruments: instruments.map((instrument) => instrument.id),
        playbackOutputs: playbackOutputs.map((output) => output.id),
      },
    },
    projections: [state],
    commands,
    interactions: [],
    componentExtensions: [],
    instruments,
    playbackOutputs,
    views: [{
      definition: component,
      label: input.id,
      render: (projections) => projections.get(state).enabled ? input.id : "",
    }],
  };
}

function instrument(id: string): PluginInstrumentContribution {
  return {
    id,
    label: id,
    family: "plucked-string",
    notationKinds: ["staff", "tablature"],
    playbackProfileId: `${id}.playback`,
  };
}

function playbackOutput(id: string): PluginPlaybackOutputContribution {
  return {
    id,
    kind: "midi-out",
    label: id,
    createEngine: () => ({ activate: async () => {}, now: () => 0, start() {}, stop() {} }),
  };
}

function platform() {
  return new PluginPlatform({
    capabilities: new WorkbenchCapabilityRegistry([]),
    projections: [state],
  });
}

function snapshot(platformInstance: PluginPlatform, enabled = true) {
  return platformInstance.projections().snapshot([bindUiProjection(state, { enabled })]);
}

test("platform installs always-on plugins and keeps user plugins inactive until activation", () => {
  const platformInstance = platform();
  const command: UiCommandContribution = {
    id: "test.user.run",
    create: (projections) => ({
      id: "test.user.run",
      label: "运行",
      scope: "global",
      enabled: projections.get(state).enabled,
      run() {},
    }),
  };
  platformInstance.registerAll([
    plugin({ id: "test.always", componentId: "test.always.view" }),
    plugin({ id: "test.user", componentId: "test.user.view", activation: "user", commands: [command] }),
  ]);

  platformInstance.start();

  assert.deepEqual(platformInstance.list().map((record) => [record.manifest.id, record.status, record.active]), [
    ["test.always", "active", true],
    ["test.user", "installed", false],
  ]);
  assert.deepEqual([...platformInstance.resolveViews(snapshot(platformInstance)).keys()], ["test.always.view"]);
  assert.deepEqual(platformInstance.resolveCommands(snapshot(platformInstance)).map((item) => item.id), []);

  platformInstance.activate("test.user");
  assert.deepEqual([...platformInstance.resolveViews(snapshot(platformInstance)).keys()],
    ["test.always.view", "test.user.view"]);
  assert.deepEqual(platformInstance.resolveCommands(snapshot(platformInstance)).map((item) => item.id), ["test.user.run"]);

  platformInstance.deactivate("test.user");
  assert.deepEqual([...platformInstance.resolveViews(snapshot(platformInstance)).keys()], ["test.always.view"]);
});

test("platform preserves failed plugin diagnostics and leaves the successful plugin active", () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.owner", componentId: "test.shared.view" }),
    plugin({ id: "test.conflict", componentId: "test.shared.view" }),
  ]);

  platformInstance.start();

  assert.deepEqual(platformInstance.list().map((record) => [record.manifest.id, record.status]), [
    ["test.owner", "active"],
    ["test.conflict", "failed"],
  ]);
  assert.deepEqual([...platformInstance.resolveViews(snapshot(platformInstance)).keys()], ["test.shared.view"]);
  assert.equal(platformInstance.diagnostics.list().length, 1);
  assert.equal(platformInstance.diagnostics.list()[0]?.code, "UI-PLG-008");
  assert.equal(platformInstance.diagnostics.list()[0]?.plugin.id, "test.conflict");
});

test("platform resolves playback outputs through plugin activation and isolates duplicate output IDs", () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.output.owner", componentId: "test.output.owner.view",
      playbackOutputs: [playbackOutput("test-output")] }),
    plugin({ id: "test.output.user", componentId: "test.output.user.view", activation: "user",
      playbackOutputs: [playbackOutput("user-output")] }),
    plugin({ id: "test.output.conflict", componentId: "test.output.conflict.view",
      playbackOutputs: [playbackOutput("test-output")] }),
  ]);

  platformInstance.start();

  assert.deepEqual(platformInstance.playbackOutputs().map((output) => output.id), ["test-output"]);
  assert.equal(platformInstance.list().find((item) => item.manifest.id === "test.output.conflict")?.status, "failed");
  assert.equal(platformInstance.diagnostics.list().at(-1)?.subject?.kind, "playback-output");
  platformInstance.activate("test.output.user");
  assert.deepEqual(platformInstance.playbackOutputs().map((output) => output.id), ["test-output", "user-output"]);
  platformInstance.deactivate("test.output.user");
  assert.deepEqual(platformInstance.playbackOutputs().map((output) => output.id), ["test-output"]);
});

test("platform resolves instrument descriptions through activation and isolates duplicate IDs", () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.instrument.owner", componentId: "test.instrument.owner.view",
      instruments: [instrument("test.instrument.guitar")] }),
    plugin({ id: "test.instrument.user", componentId: "test.instrument.user.view", activation: "user",
      instruments: [instrument("test.instrument.bass")] }),
    plugin({ id: "test.instrument.conflict", componentId: "test.instrument.conflict.view",
      instruments: [instrument("test.instrument.guitar")] }),
  ]);

  platformInstance.start();

  assert.deepEqual(platformInstance.instruments().map((item) => item.id), ["test.instrument.guitar"]);
  assert.equal(platformInstance.list().find((item) => item.manifest.id === "test.instrument.conflict")?.status, "failed");
  assert.equal(platformInstance.diagnostics.list().at(-1)?.subject?.kind, "instrument");
  platformInstance.activate("test.instrument.user");
  assert.deepEqual(platformInstance.instruments().map((item) => item.id),
    ["test.instrument.guitar", "test.instrument.bass"]);
  platformInstance.deactivate("test.instrument.user");
  assert.deepEqual(platformInstance.instruments().map((item) => item.id), ["test.instrument.guitar"]);
});

test("platform rejects registration after startup to keep the composition root deterministic", () => {
  const platformInstance = platform();
  const late = plugin({ id: "test.late", componentId: "test.late.view" });
  platformInstance.register(late);
  assert.throws(() => platformInstance.register(late), /already registered/);
  platformInstance.start();
  assert.throws(() => platformInstance.register(plugin({ id: "test.after-start", componentId: "test.after-start.view" })),
    /already started/);
});

test("platform rejects duplicate kernel module ownership across otherwise independent packages", () => {
  const platformInstance = platform();
  const kernelModule = {
    moduleId: "test.shared.kernel-module",
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
  };
  platformInstance.register(definePlugin({
    id: "test.kernel.owner",
    name: "内核模块所有者",
    version: "1.0.0",
    tier: "system",
    kernelModules: [kernelModule],
  }));
  assert.throws(() => platformInstance.register(definePlugin({
    id: "test.kernel.conflict",
    name: "冲突内核模块",
    version: "1.0.0",
    tier: "system",
    kernelModules: [kernelModule],
  })), /already owned/);
  assert.deepEqual(platformInstance.kernelAssemblyPlan().modules.map((entry) => entry.pluginId), ["test.kernel.owner"]);
});

test("platform publishes stable lifecycle snapshots when a user plugin changes activation", () => {
  const platformInstance = platform();
  platformInstance.register(plugin({ id: "test.user", componentId: "test.user.view", activation: "user" }));
  platformInstance.start();
  const installedSnapshot = platformInstance.getSnapshot();
  let publications = 0;
  const unsubscribe = platformInstance.subscribe(() => { publications += 1; });

  platformInstance.activate("test.user");
  const activeSnapshot = platformInstance.getSnapshot();
  assert.notEqual(activeSnapshot, installedSnapshot);
  assert.equal(activeSnapshot[0]?.status, "active");

  platformInstance.deactivate("test.user");
  assert.equal(platformInstance.getSnapshot()[0]?.status, "disabled");
  assert.equal(publications, 2);

  unsubscribe();
  platformInstance.activate("test.user");
  assert.equal(publications, 2);
});

test("platform restores the persisted user activation set in one lifecycle publication", () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.always", componentId: "test.always.view" }),
    plugin({ id: "test.user.one", componentId: "test.user.one.view", activation: "user" }),
    plugin({ id: "test.user.two", componentId: "test.user.two.view", activation: "user" }),
  ]);
  assert.throws(() => platformInstance.restoreActivation(["test.user.one"]), /has not started/);
  platformInstance.start();
  let publications = 0;
  platformInstance.subscribe(() => { publications += 1; });

  platformInstance.restoreActivation(["test.user.one", "test.unknown"]);

  assert.deepEqual(platformInstance.list().map((record) => [record.manifest.id, record.status, record.active]), [
    ["test.always", "active", true],
    ["test.user.one", "active", true],
    ["test.user.two", "installed", false],
  ]);
  assert.deepEqual([...platformInstance.activatedPluginIds()], ["test.always", "test.user.one"]);
  assert.equal(publications, 1);

  platformInstance.restoreActivation(["test.user.one"]);
  assert.equal(publications, 1);

  platformInstance.restoreActivation(["test.user.two"]);
  assert.deepEqual(platformInstance.list().map((record) => [record.manifest.id, record.status, record.active]), [
    ["test.always", "active", true],
    ["test.user.one", "disabled", false],
    ["test.user.two", "active", true],
  ]);
  assert.equal(publications, 2);
});

test("platform ignores failed plugins while restoring activation", () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.owner", componentId: "test.shared.view" }),
    plugin({ id: "test.failed-user", componentId: "test.shared.view", activation: "user" }),
  ]);
  platformInstance.start();
  let publications = 0;
  platformInstance.subscribe(() => { publications += 1; });

  platformInstance.restoreActivation(["test.failed-user"]);

  assert.deepEqual(platformInstance.list().map((record) => [record.manifest.id, record.status, record.active]), [
    ["test.owner", "active", true],
    ["test.failed-user", "failed", false],
  ]);
  assert.deepEqual([...platformInstance.activatedPluginIds()], ["test.owner"]);
  assert.equal(publications, 0);
});

test("activation persistence retains unavailable plugin IDs and reconciles installed user plugins", async () => {
  const platformInstance = platform();
  platformInstance.registerAll([
    plugin({ id: "test.always", componentId: "test.always.view" }),
    plugin({ id: "test.user", componentId: "test.user.view", activation: "user" }),
  ]);
  assert.throws(() => platformInstance.connectActivation({ read: async () => ({}), write: async () => {} }),
    /has not started/);
  platformInstance.start();
  let stored: unknown = {
    schemaVersion: 1,
    enabledPluginIds: ["test.user", "test.unavailable", "bad", "test.user"],
  };
  const persistence = platformInstance.connectActivation({
    read: async () => stored,
    write: async (document) => { stored = document; },
  });

  assert.deepEqual(await persistence.restore(), {
    schemaVersion: 1,
    enabledPluginIds: ["test.user", "test.unavailable"],
  });
  assert.equal(platformInstance.list().find((item) => item.manifest.id === "test.user")?.active, true);
  assert.deepEqual(stored, {
    schemaVersion: 1,
    enabledPluginIds: ["test.user", "test.unavailable"],
  });

  await persistence.setEnabled("test.user", false);
  assert.equal(platformInstance.list().find((item) => item.manifest.id === "test.user")?.status, "disabled");
  assert.deepEqual(stored, { schemaVersion: 1, enabledPluginIds: ["test.unavailable"] });

  await persistence.setEnabled("test.unavailable", false);
  assert.deepEqual(stored, { schemaVersion: 1, enabledPluginIds: [] });
  assert.equal(platformInstance.list().find((item) => item.manifest.id === "test.always")?.active, true);
  assert.rejects(() => persistence.setEnabled("bad", true), /Invalid plugin ID/);
  assert.throws(() => platformInstance.connectActivation({ read: async () => ({}), write: async () => {} }),
    /already connected/);
});

test("manifest discovery preflights contracts without loading plugin modules", () => {
  const owner = plugin({ id: "test.discovered", componentId: "test.discovered.view" });
  const discovery = new PluginManifestDiscovery({
    capabilities: new WorkbenchCapabilityRegistry([]),
    projections: [state.id],
  });

  assert.deepEqual(discovery.inspect(owner.manifest), { accepted: true, manifest: owner.manifest });
  assert.equal(discovery.inspect(owner.manifest).accepted, false);
  assert.equal(discovery.failures().at(-1)?.code, "manifest.duplicate");

  const missingCapability = { ...owner.manifest, id: "test.missing-capability",
    requires: { capabilities: ["workbench.missing"], projections: [state.id] } };
  assert.equal(discovery.inspect(missingCapability).accepted, false);
  assert.equal(discovery.failures().at(-1)?.code, "manifest.capability-unavailable");

  const missingProjection = { ...owner.manifest, id: "test.missing-projection",
    requires: { capabilities: [], projections: ["test.missing-projection.state"] } };
  assert.equal(discovery.inspect(missingProjection).accepted, false);
  assert.equal(discovery.failures().at(-1)?.code, "manifest.projection-unavailable");

  assert.equal(discovery.inspect({ id: "bad" }).accepted, false);
  assert.equal(discovery.failures().at(-1)?.code, "manifest.invalid");
  const unsafeKernelManifest = {
    ...owner.manifest,
    id: "test.unsafe-kernel",
    tier: "third-party" as const,
    activation: "always" as const,
    contributes: { ...owner.manifest.contributes, kernelModules: [{
      moduleId: "test.unsafe-kernel.module",
      apiVersion: 1 as const,
      runtime: "internal-module" as const,
      activation: "session-fixed" as const,
    }] },
  };
  assert.equal(discovery.inspect(unsafeKernelManifest).accepted, false);
  assert.equal(discovery.failures().at(-1)?.code, "manifest.invalid");
  assert.deepEqual(discovery.list().map((manifest) => manifest.id), ["test.discovered"]);
});
