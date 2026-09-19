import assert from "node:assert/strict";
import test from "node:test";

import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { adaptUiPluginPackage } from "../src/plugins/plugin-sdk-adapter.ts";
import {
  NOTE_CONTROL_EXTENSION_POINT,
  defineNoteControlExtension,
  definePlugin,
  definePluginProjection,
  isUiPluginPackage,
} from "../src/plugins/plugin-sdk.ts";
import type { PluginInputContext, PluginNotationInteractionContribution,
  PluginSettingsHost } from "../src/plugins/plugin-sdk.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection } from "../src/ui/projection-registry.ts";
import {
  createPluginKernelAssemblyPlanV1,
  PLUGIN_PACKAGE_V1_LIMITS,
} from "../src/plugins/plugin-package-contract.ts";

const state = definePluginProjection<{ readonly label: string }>("test.sdk.state");

function packageDefinition() {
  return definePlugin({
    id: "test.sdk.plugin",
    name: "SDK 插件",
    version: "1.2.3",
    tier: "product",
    activation: "user",
    settings: {
      schemaVersion: 1,
      defaults: { compact: true },
      parse: (value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
        const candidate = value as Record<string, unknown>;
        return Object.keys(candidate).length === 1 && typeof candidate.compact === "boolean"
          ? { compact: candidate.compact } : null;
      },
    },
    hostFeatures: ["workbench.layout"],
    projections: [state],
    instruments: [{
      id: "test.instrument.guitar",
      label: "吉他",
      family: "plucked-string",
      notationKinds: ["staff", "tablature"],
      playbackProfileId: "test.playback.guitar",
    }],
    playbackOutputs: [{
      id: "test-sdk-output",
      kind: "midi-out",
      label: "SDK 输出",
      createEngine: () => ({ activate: async () => {}, now: () => 0, start() {}, stop() {} }),
    }],
    commands: [{
      id: "test.sdk.run",
      create: (projections) => ({
        id: "test.sdk.run",
        label: projections.get(state).label,
        scope: "global",
        enabled: true,
        run() {},
      }),
    }],
    views: [{
      definition: {
        id: "test.sdk.view",
        version: "1.0",
        kind: "tool",
        domain: "test.sdk",
        slots: ["bottom"],
        presentation: { allowed: ["panel"], default: "panel" },
        capabilities: {},
        permissions: { projections: [state.id], commands: ["test.sdk.run"] },
      },
      label: "SDK 视图",
      render: (projections) => projections.get(state).label,
    }],
  });
}

test("definePlugin derives the internal manifest without exposing host registries", () => {
  const plugin = packageDefinition();
  const module = adaptUiPluginPackage(plugin);

  assert.equal(isUiPluginPackage(plugin), true);
  assert.deepEqual(module.manifest, {
    id: "test.sdk.plugin",
    name: "SDK 插件",
    version: "1.2.3",
    tier: "product",
    apiVersion: "3.0",
    runtime: "internal-module",
    activation: "user",
    requires: { hostFeatures: ["workbench.layout"], projections: [state.id] },
    contributes: {
      views: ["test.sdk.view"],
      commands: ["test.sdk.run"],
      interactions: [],
      componentExtensions: [],
      instruments: ["test.instrument.guitar"],
      playbackOutputs: ["test-sdk-output"],
      applicationCapabilities: [],
      workflows: [],
      kernelModules: [],
    },
  });
  assert.equal(Object.isFrozen(plugin), true);
  assert.equal(Object.isFrozen(plugin.views), true);
  assert.equal(Object.isFrozen(plugin.instruments), true);
});

test("the plugin platform accepts SDK packages and applies its activation lifecycle", () => {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry(["workbench.layout"]),
    projections: [state],
  });
  platform.register(packageDefinition());
  platform.activate("test.sdk.plugin");
  platform.start();
  const snapshot = platform.projections().snapshot([bindUiProjection(state, { label: "已接入" })]);

  assert.equal(platform.list()[0]?.status, "active");
  assert.deepEqual(platform.instruments().map((instrument) => instrument.id), ["test.instrument.guitar"]);
  assert.deepEqual(platform.playbackOutputs().map((output) => output.id), ["test-sdk-output"]);
  assert.equal(platform.resolveViews(snapshot).get("test.sdk.view")?.render(), "已接入");
  assert.equal(platform.resolveCommands(snapshot)[0]?.label, "已接入");
});

test("instrument descriptions and their note-control extensions share one activation lifecycle", () => {
  const noteControl = definePlugin({
    id: "test.note-control",
    name: "音符控制",
    version: "1.0.0",
    views: [{
      definition: {
        id: "test.note-control.view",
        version: "1.0",
        kind: "tool",
        domain: "test.note-control",
        slots: ["right"],
        presentation: { allowed: ["panel"], default: "panel" },
        capabilities: {},
        permissions: { projections: [], commands: [] },
        extensionPoints: [NOTE_CONTROL_EXTENSION_POINT],
      },
      label: "音符控制",
      render: (_projections, host) => host.extensions(NOTE_CONTROL_EXTENSION_POINT)
        .map((extension) => extension.render()).join(","),
    }],
  });
  const guitar = definePlugin({
    id: "test.instrument-plugin.guitar",
    name: "吉他能力",
    version: "1.0.0",
    activation: "user",
    instruments: [{
      id: "test.instrument.guitar",
      label: "吉他",
      family: "plucked-string",
      notationKinds: ["staff", "tablature"],
      noteControlExtensionIds: ["test.instrument.guitar.techniques"],
      playbackProfileId: "test.playback.guitar",
    }],
    componentExtensions: [defineNoteControlExtension({
      id: "test.instrument.guitar.techniques",
      render: () => "guitar-techniques",
    })],
  });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.registerAll([guitar, noteControl]);
  platform.activate(guitar.id);
  platform.start();
  const projections = platform.projections().snapshot([]);
  const renderNoteControl = () => platform.resolveViews(projections).get("test.note-control.view")?.render();

  assert.deepEqual(platform.instruments().map((instrument) => instrument.id), ["test.instrument.guitar"]);
  assert.equal(renderNoteControl(), "guitar-techniques");
  platform.deactivate(guitar.id);
  assert.deepEqual(platform.instruments().map((instrument) => instrument.id), ["test.instrument.guitar"]);
  assert.equal(renderNoteControl(), "guitar-techniques");
  assert.equal(platform.restartRequired(), true);
});

test("instrument descriptions cannot claim note-control extensions owned elsewhere or missing", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(definePlugin({
    id: "test.invalid-instrument",
    name: "无效乐器",
    version: "1.0.0",
    instruments: [{
      id: "test.instrument.invalid",
      label: "无效乐器",
      family: "other",
      notationKinds: ["staff"],
      noteControlExtensionIds: ["test.missing.controls"],
    }],
  }));

  platform.start();

  assert.equal(platform.list()[0]?.status, "failed");
  assert.equal(platform.diagnostics.list()[0]?.code, "UI-PLG-009");
  assert.equal(platform.diagnostics.list()[0]?.subject?.id, "test.missing.controls");
});

test("plugin settings stay in their plugin namespace and validate restored values", () => {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry(["workbench.layout"]),
    projections: [state],
  });
  platform.register(packageDefinition());

  assert.deepEqual(platform.settings().read("test.sdk.plugin"), { compact: true });
  assert.deepEqual(platform.settings().write("test.sdk.plugin", { compact: false }), { compact: false });
  assert.throws(() => platform.settings().write("test.sdk.plugin", { compact: "no" }), /settings are invalid/);
  assert.throws(() => platform.settings().read("test.other"), /not registered/);
  assert.deepEqual(platform.settings().serialize(), {
    "test.sdk.plugin": { schemaVersion: 1, value: { compact: false } },
  });

  assert.deepEqual(platform.settings().restore({
    "test.sdk.plugin": { schemaVersion: 1, value: { compact: true } },
    "test.unknown": { schemaVersion: 1, value: { surprise: true } },
  }), { restored: ["test.sdk.plugin"], defaulted: [] });
  assert.deepEqual(platform.settings().read("test.sdk.plugin"), { compact: true });

  assert.deepEqual(platform.settings().restore({
    "test.sdk.plugin": { schemaVersion: 2, value: { compact: false } },
  }), { restored: [], defaulted: ["test.sdk.plugin"] });
  assert.deepEqual(platform.settings().read("test.sdk.plugin"), { compact: true });
});

test("plugin settings persistence preserves temporarily unavailable plugin namespaces", async () => {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry(["workbench.layout"]),
    projections: [state],
  });
  platform.register(packageDefinition());
  assert.throws(() => platform.connectSettings({ read: async () => ({}), write: async () => {} }), /has not started/);
  platform.start();
  let stored: unknown = {
    "test.sdk.plugin": { schemaVersion: 1, value: { compact: false } },
    "test.unavailable": { schemaVersion: 3, value: { retained: true } },
  };
  const persistence = platform.connectSettings({
    read: async () => stored,
    write: async (document) => { stored = document; },
  });

  assert.deepEqual(await persistence.restore(), { restored: ["test.sdk.plugin"], defaulted: [] });
  assert.deepEqual(platform.settings().read("test.sdk.plugin"), { compact: false });
  assert.deepEqual(stored, {
    "test.sdk.plugin": { schemaVersion: 1, value: { compact: false } },
    "test.unavailable": { schemaVersion: 3, value: { retained: true } },
  });

  await persistence.write("test.sdk.plugin", { compact: true });
  assert.deepEqual(stored, {
    "test.sdk.plugin": { schemaVersion: 1, value: { compact: true } },
    "test.unavailable": { schemaVersion: 3, value: { retained: true } },
  });
  await persistence.reset("test.sdk.plugin");
  assert.deepEqual(platform.settings().read("test.sdk.plugin"), { compact: true });
});

test("SDK views and commands receive only their owning plugin settings handle", async () => {
  let viewSettings: PluginSettingsHost | null | undefined;
  let commandSettings: PluginSettingsHost | null | undefined;
  const plugin = definePlugin({
    id: "test.scoped-settings",
    name: "作用域设置",
    version: "1.0.0",
    settings: {
      schemaVersion: 1,
      defaults: { level: 1 },
      parse: (value) => typeof value === "object" && value !== null
        && Object.keys(value).length === 1 && typeof (value as { level?: unknown }).level === "number"
        ? { level: (value as { level: number }).level } : null,
    },
    projections: [state],
    commands: [{
      id: "test.scoped-settings.run",
      create: (_projections, host) => {
        commandSettings = host.settings;
        return { id: "test.scoped-settings.run", label: "设置", scope: "global", enabled: true, run() {} };
      },
    }],
    views: [{
      definition: {
        id: "test.scoped-settings.view",
        version: "1.0",
        kind: "tool",
        domain: "test.scoped-settings",
        slots: ["bottom"],
        presentation: { allowed: ["panel"], default: "panel" },
        capabilities: {},
        permissions: { projections: [state.id], commands: ["test.scoped-settings.run"] },
      },
      label: "设置",
      render: (_projections, host) => {
        viewSettings = host.settings;
        return "设置";
      },
    }],
  });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [state] });
  platform.register(plugin);
  platform.start();
  let stored: unknown = {};
  const persistence = platform.connectSettings({
    read: async () => stored,
    write: async (document) => { stored = document; },
  });
  await persistence.restore();
  let platformPublications = 0;
  platform.subscribe(() => { platformPublications += 1; });
  const projections = platform.projections().snapshot([bindUiProjection(state, { label: "设置" })]);

  platform.resolveViews(projections).get("test.scoped-settings.view")?.render();
  platform.resolveCommands(projections);

  assert.ok(viewSettings);
  assert.equal(viewSettings, commandSettings);
  assert.deepEqual(viewSettings.read(), { level: 1 });
  await viewSettings.write({ level: 2 });
  assert.deepEqual(stored, {
    "test.scoped-settings": { schemaVersion: 1, value: { level: 2 } },
  });
  assert.equal(platformPublications, 1);
  assert.equal("pluginId" in viewSettings, false);
});

test("plugin settings restore isolates parser failures and recovers defaults", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(definePlugin({
    id: "test.throwing-settings",
    name: "异常设置",
    version: "1.0.0",
    settings: {
      schemaVersion: 1,
      defaults: { safe: true },
      parse: (value) => {
        if (value === "throw") throw new Error("broken parser");
        return typeof value === "object" && value !== null && (value as { safe?: unknown }).safe === true
          ? { safe: true } : null;
      },
    },
  }));

  assert.deepEqual(platform.settings().restore({
    "test.throwing-settings": { schemaVersion: 1, value: "throw" },
  }), { restored: [], defaulted: ["test.throwing-settings"] });
  assert.deepEqual(platform.settings().read("test.throwing-settings"), { safe: true });
});

test("the SDK exposes a stable note-control extension point", () => {
  const extension = defineNoteControlExtension({
    id: "test.guitar.techniques",
    order: 20,
    render: (projections) => projections.get(state).label,
  });

  assert.equal(extension.extensionPoint, NOTE_CONTROL_EXTENSION_POINT);
  assert.equal(extension.id, "test.guitar.techniques");
  assert.equal(Object.isFrozen(extension), true);
});

test("the SDK rejects malformed public identities before host installation", () => {
  assert.throws(() => definePluginProjection("bad"), /Invalid plugin projection ID/);
  assert.throws(() => definePlugin({ id: "bad", name: "坏插件", version: "1.0.0" }), /Invalid plugin ID/);
  assert.throws(() => definePlugin({ id: "test.bad", name: "坏插件", version: "1" }), /Invalid plugin version/);
  assert.throws(() => definePlugin({ id: "test.bad", name: "坏插件", version: "1.0.0",
    settings: { schemaVersion: 0, defaults: {}, parse: () => ({}) } }), /settings schema version/);
  assert.throws(() => definePlugin({ id: "test.bad", name: "坏插件", version: "1.0.0",
    settings: { schemaVersion: 1, defaults: {}, parse: () => null } }), /settings defaults/);
});

test("one plugin package publishes a canonical fixed-session kernel assembly plan", () => {
  const mutableModule = {
    moduleId: "test.notation.foundation",
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
  };
  const plugin = definePlugin({
    id: "test.notation.foundation",
    name: "记谱基础",
    version: "1.2.0",
    tier: "system",
    kernelModules: [mutableModule],
  });
  mutableModule.moduleId = "test.notation.changed";
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(plugin);

  const manifest = adaptUiPluginPackage(plugin).manifest;
  assert.equal(manifest.tier, "system");
  assert.deepEqual(manifest.contributes.kernelModules, plugin.kernelModules);
  assert.deepEqual(platform.kernelAssemblyPlan(), {
    planVersion: 1,
    modules: [{
      pluginId: "test.notation.foundation",
      pluginVersion: "1.2.0",
      tier: "system",
      moduleId: "test.notation.foundation",
      apiVersion: 1,
      runtime: "internal-module",
      activation: "session-fixed",
    }],
  });
  assert.equal(Object.isFrozen(platform.kernelAssemblyPlan()), true);
  assert.equal(Object.isFrozen(platform.kernelAssemblyPlan().modules), true);
  assert.equal(Object.isFrozen(plugin.kernelModules[0]), true);
});

test("kernel-bearing packages are configurable before launch and fixed within the running session", () => {
  const module = {
    moduleId: "test.kernel.module",
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
  };
  const configurable = definePlugin({
    id: "test.configurable.kernel",
    name: "可配置内核插件",
    version: "1.0.0",
    activation: "user",
    kernelModules: [module],
  });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(configurable);
  assert.deepEqual(platform.kernelAssemblyPlan().modules, []);
  assert.equal(platform.activate(configurable.id).effect, "configured");
  const session = platform.start();
  assert.deepEqual(session.kernelAssembly.modules.map((entry) => entry.moduleId), ["test.kernel.module"]);
  assert.equal(platform.deactivate(configurable.id).effect, "restart-required");
  assert.deepEqual(platform.sessionPlan().kernelAssembly.modules.map((entry) => entry.moduleId), ["test.kernel.module"]);

  const safePlatform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  safePlatform.register(configurable);
  safePlatform.activate(configurable.id);
  const safeSession = safePlatform.start({ selectedPluginIds: [] });
  assert.deepEqual(safeSession.kernelAssembly.modules, []);
  assert.deepEqual([...safePlatform.nextLaunchPluginIds()], [configurable.id]);
  assert.equal(safePlatform.restartRequired(), true);
});

test("kernel package validation rejects untrusted execution and mutable system activation", () => {
  const module = {
    moduleId: "test.kernel.module",
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
  };
  assert.throws(() => definePlugin({
    id: "test.third-party.kernel",
    name: "第三方内核插件",
    version: "1.0.0",
    tier: "third-party",
    kernelModules: [module],
  }), /must use Wasm/);
  assert.throws(() => definePlugin({
    id: "test.duplicate.kernel",
    name: "重复内核插件",
    version: "1.0.0",
    kernelModules: [module, module],
  }), /already owned/);
  assert.throws(() => definePlugin({
    id: "test.dynamic.system",
    name: "动态系统插件",
    version: "1.0.0",
    tier: "system",
    activation: "user",
  }), /must always be active/);
});

test("kernel assembly planning is canonical, duplicate-free and bounded without loading plugin code", () => {
  const source = (index: number) => ({
    id: `test.package.p${index}`,
    version: "1.0.0",
    activation: "always" as const,
    tier: "system" as const,
    kernelModules: [{
      moduleId: `test.module.m${String(index).padStart(2, "0")}`,
      apiVersion: 1 as const,
      runtime: "internal-module" as const,
      activation: "session-fixed" as const,
    }],
  });
  const plan = createPluginKernelAssemblyPlanV1([source(2), source(1)]);
  assert.deepEqual(plan.modules.map((entry) => entry.moduleId), ["test.module.m01", "test.module.m02"]);
  assert.throws(() => createPluginKernelAssemblyPlanV1([source(1), source(1)]), /already registered/);
  assert.throws(() => createPluginKernelAssemblyPlanV1(
    Array.from({ length: PLUGIN_PACKAGE_V1_LIMITS.kernelModules + 1 }, (_, index) => source(index)),
  ), /limit exceeded/);
});

test("a notation plugin registers its own input grammar without changing the workbench", () => {
  const tablature: PluginNotationInteractionContribution<PluginInputContext, string> = {
    id: "test.tablature.interaction",
    notationKind: "tablature",
    input: {
      id: "test.tablature.input",
      canHandle: (signal, context) => signal.kind === "key-press" && context.notationKind === "tablature",
      translate: (signal) => signal.kind === "key-press"
        ? { kind: "compose", methodId: "test.tablature.fret", draft: signal.key }
        : null,
    },
    readDraft: (composition) => typeof composition === "string" ? composition : null,
    startComposition: (draft) => ({ methodId: "test.tablature.fret", draft }),
    navigate: (_signal, context) => context,
    edit: (_signal, context) => context,
  };
  const plugin = definePlugin({
    id: "test.tablature",
    name: "六线谱",
    version: "1.0.0",
    interactions: [tablature],
  });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(plugin);
  platform.start();

  assert.deepEqual(adaptUiPluginPackage(plugin).manifest.contributes.interactions, [tablature.id]);
  assert.equal(platform.interactions().hasKind("tablature"), true);
  assert.deepEqual(platform.interactions().translate("tablature", {
    kind: "key-press", key: "3", modifiers: [], repeat: false,
  }, {
    focusScope: "score", target: "caret", notationKind: "tablature",
    capabilities: ["compose", "insert"], composing: false,
  }), { kind: "compose", methodId: "test.tablature.fret", draft: "3" });
});
