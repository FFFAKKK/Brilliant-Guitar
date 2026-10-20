import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ApplicationCapabilityContribution } from "../src/contracts/application-capability.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { adaptPluginPackage, adaptUiPluginPackage, pluginPackageManifest } from "../src/plugins/plugin-sdk-adapter.ts";
import { capturePluginModule } from "../src/plugins/plugin-module.ts";
import type { PluginModule } from "../src/plugins/plugin-module.ts";
import { capturePluginManifest, WorkbenchFeatureRegistry } from "../src/plugins/plugin-manifest.ts";
import { captureUiPluginManifest } from "../src/ui/plugin-manifest.ts";
import { PluginCatalogBase } from "../src/plugins/plugin-catalog.ts";
import { UiPluginCatalog } from "../src/ui/plugin-catalog.ts";
import { UiPluginHost } from "../src/ui/plugin-manager.ts";
import { UiProjectionRegistry } from "../src/ui/projection-registry.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";

const identity = (id: string) => ({ id, name: id, version: "1.0.0" });
const capability = (id: string): ApplicationCapabilityContribution => ({
  id, contractVersion: 1, callers: ["ui", "agent"], validateInput: () => true, validateOutput: () => true,
});
const viewPlugin = () => definePlugin({
  ...identity("test.ui-required"),
  applicationCapabilities: [capability("test.ui-required.read")],
  views: [{
    definition: {
      id: "test.ui-required.view", version: "1.0", kind: "tool", domain: "test.headless", slots: ["bottom"],
      presentation: { allowed: ["panel"], default: "panel" }, capabilities: {},
      permissions: { projections: [], commands: [] },
    },
    label: "UI Required", render: () => null,
  }],
});

for (const apiVersion of ["3.0", "4.0"] as const) {
  test(`API ${apiVersion} pure packages start headless with one fixed business/session authority`, () => {
    const plugin = definePlugin({
      ...identity("test.headless"), apiVersion,
      instruments: [{ id: "test.headless.instrument", label: "Test", family: "plucked-string", notationKinds: ["staff"] }],
      playbackOutputs: [{ id: "test-headless-output", kind: "midi-out", label: "Test",
        createEngine: () => ({ activate: async () => {}, now: () => 0, start() {}, stop() {} }) }],
      applicationCapabilities: [capability("test.headless.read")],
      workflows: [{ id: "test.headless.workflow", contractVersion: 1, name: "Read", description: "Read test",
        runtime: "agent-orchestration-v1", operationIds: ["test.headless.read"], entryOperationIds: ["test.headless.read"] }],
    });
    const captured = adaptPluginPackage(plugin);
    assert.equal(captured.ui, null);
    const platform = new PluginPlatform({});
    platform.register(plugin);
    assert.deepEqual(platform.start().pluginIds, [plugin.id]);
    assert.equal(platform.list()[0]?.manifest.apiVersion, apiVersion);
    assert.equal(platform.applicationCapabilities().get("test.headless.read")?.ownerPluginId, plugin.id);
    assert.equal(platform.workflows().get("test.headless.workflow")?.ownerPluginId, plugin.id);
    assert.equal(platform.instruments().length, 1);
    assert.equal(platform.playbackOutputs()[0]?.createEngine, plugin.playbackOutputs[0]?.createEngine);
    assert.equal(platform.hostServiceGrants().list().length, 1);
    assert.deepEqual(platform.facets(), []);
    assert.equal(platform.uiContributions(plugin.id), undefined);
    assert.throws(() => platform.components().list(), /UI host is not configured/);
    assert.throws(() => platform.interactions().list(), /UI host is not configured/);
    assert.throws(() => platform.projections().list(), /UI host is not configured/);
    platform.dispose(); platform.dispose();
    assert.equal(platform.phase(), "disposed");
    assert.deepEqual(platform.applicationCapabilities().list(), []);
    assert.deepEqual(platform.workflows().list(), []);
    assert.throws(() => platform.start(), /disposed/);
  });
}

test("missing UI hosts fail only UI packages without publishing business directories or grants", () => {
  const good = definePlugin({ ...identity("test.headless-good"), applicationCapabilities: [capability("test.headless.good")] });
  const mount = definePlugin({ ...identity("test.mount-required"), apiVersion: "4.0", ui: {
    contractVersion: 1, components: [], menuItems: [], shortcuts: [],
    commands: [{ id: "test.mount-required.command", run: () => true }],
  } });
  const platform = new PluginPlatform({});
  platform.registerAll([good, viewPlugin(), mount]);
  assert.deepEqual(platform.start().pluginIds, [good.id]);
  assert.deepEqual(platform.list().map(p => p.status), ["active", "failed", "failed"]);
  assert.equal(platform.applicationCapabilities().get("test.ui-required.read"), undefined);
  assert.equal(platform.hostServiceGrants().get("test.ui-required"), undefined);
  assert.equal(platform.hostServiceGrants().get(mount.id), undefined);
  assert.equal(platform.diagnostics.list().at(-1)?.subject?.id, "workbench.ui-host");
  platform.dispose();
});

test("explicit null host honors feature requirements and never invokes a legacy factory", () => {
  const features = new WorkbenchFeatureRegistry(["test.available"]);
  const platform = new PluginPlatform({ uiHost: null, hostFeatures: features, projections: [] });
  platform.registerAll([
    definePlugin({ ...identity("test.feature-good"), hostFeatures: ["test.available"] }),
    definePlugin({ ...identity("test.feature-bad"), hostFeatures: ["test.missing"],
      applicationCapabilities: [capability("test.feature-bad.read")] }),
    definePlugin({ ...identity("test.permission-bad"), hostServices: ["score.edit"],
      applicationCapabilities: [capability("test.permission-bad.read")] }),
  ]);
  assert.deepEqual(platform.start().pluginIds, ["test.feature-good"]);
  assert.deepEqual(platform.list().map(p => p.status), ["active", "failed", "failed"]);
  assert.deepEqual(platform.applicationCapabilities().list(), []);
  assert.deepEqual(platform.hostServiceGrants().list().map(p => p.pluginId), ["test.feature-good"]);
  platform.dispose();
  assert.throws(() => new PluginPlatform({ uiHost: null, createContributionHost() { throw new Error("unexpected factory"); } }),
    /Choose uiHost/);
});

test("headless settings and next-launch selection preserve the process-fixed session", async () => {
  const platform = new PluginPlatform({});
  const id = "test.headless-settings";
  platform.register(definePlugin({ ...identity(id), apiVersion: "4.0", activation: "user",
    settings: { schemaVersion: 1, defaults: { count: 1 },
      parse: value => typeof value === "object" && value !== null && typeof (value as { count?: unknown }).count === "number"
        ? { count: (value as { count: number }).count } : null },
    applicationCapabilities: [capability("test.headless-settings.read")] }));
  platform.settings().restore({ [id]: { schemaVersion: 1, value: { count: 7 } } });
  platform.restoreActivation([id]);
  assert.deepEqual(platform.start().pluginIds, [id]);
  const writes: unknown[] = [];
  const settings = platform.connectSettings({ read: async () => null, write: async value => { writes.push(value); } });
  await settings.write(id, { count: 9 });
  assert.deepEqual(platform.settings().read(id), { count: 9 });
  assert.equal(writes.length, 1);
  platform.deactivate(id);
  assert.equal(platform.restartRequired(), true);
  assert.deepEqual(platform.sessionPlan().pluginIds, [id]);
  assert.equal(platform.applicationCapabilities().get("test.headless-settings.read")?.ownerPluginId, id);
  platform.dispose();
  await assert.rejects(settings.write(id, { count: 2 }), /disposed/);
});

test("headless kernel plans honor activation and preserve duplicate ownership rejection", () => {
  const platform = new PluginPlatform({});
  const kernelModules = [{ moduleId: "test.headless-kernel", apiVersion: 1 as const,
    runtime: "internal-module" as const, activation: "session-fixed" as const }];
  const plugin = definePlugin({ ...identity("test.kernel"), apiVersion: "4.0", tier: "system", kernelModules });
  platform.register(plugin);
  assert.throws(() => platform.register(definePlugin({
    ...identity("test.kernel-duplicate"), apiVersion: "4.0", tier: "system", kernelModules,
  })), /already owned|duplicate/i);
  const plan = platform.start();
  assert.deepEqual(plan.pluginIds, [plugin.id]);
  assert.deepEqual(plan.kernelAssembly, platform.kernelAssemblyPlan());
  assert.equal(plan.kernelAssembly.modules[0]?.moduleId, kernelModules[0]?.moduleId);
  platform.dispose();
});

test("headless business conflicts leave no partial ownership and do not block later valid packages", () => {
  const platform = new PluginPlatform({});
  const shared = capability("test.shared.read");
  platform.registerAll([
    definePlugin({ ...identity("test.first"), applicationCapabilities: [shared] }),
    definePlugin({ ...identity("test.conflict"),
      instruments: [{ id: "test.conflict.instrument", label: "Conflict", family: "test", notationKinds: ["staff"] }],
      applicationCapabilities: [shared] }),
    definePlugin({ ...identity("test.after"), applicationCapabilities: [capability("test.after.read")] }),
  ]);
  assert.deepEqual(platform.start().pluginIds, ["test.after", "test.first"]);
  assert.deepEqual(platform.list().map(p => p.status), ["active", "failed", "active"]);
  assert.equal(platform.applicationCapabilities().get(shared.id)?.ownerPluginId, "test.first");
  assert.equal(platform.applicationCapabilities().get("test.after.read")?.ownerPluginId, "test.after");
  assert.deepEqual(platform.instruments(), []);
  assert.equal(platform.hostServiceGrants().get("test.conflict"), undefined);
  platform.dispose();
});

test("public registration captures business arrays before start without freezing author objects", () => {
  const notationKinds: ("staff" | "tablature")[] = ["staff"];
  const instrument = { id: "test.snapshot.instrument", label: "Before", family: "test", notationKinds };
  const module: PluginModule = {
    manifest: pluginPackageManifest(definePlugin({ ...identity("test.snapshot"), instruments: [instrument] })),
    ui: null, instruments: [instrument], playbackOutputs: [], applicationCapabilities: [], workflows: [],
  };
  const platform = new PluginPlatform({});
  platform.register(module);
  instrument.label = "After"; notationKinds.push("tablature");
  platform.start();
  assert.deepEqual(platform.instruments(), [{ id: instrument.id, label: "Before", family: "test", notationKinds: ["staff"] }]);
  assert.equal(Object.isFrozen(platform.instruments()[0]?.notationKinds), true);
  assert.equal(Object.isFrozen(instrument), false);
  platform.dispose();
});

test("common and UI manifests have one implementation; UI slices share identity and reject conflicting manifests", () => {
  const module = adaptPluginPackage(viewPlugin());
  assert.equal(capturePluginManifest, captureUiPluginManifest);
  assert.equal(module.ui?.manifest, module.manifest);
  assert.equal("applicationCapabilities" in module.ui!, false);
  assert.equal(module.applicationCapabilities.length, 1);
  const legacy = adaptUiPluginPackage(viewPlugin());
  assert.equal(legacy.applicationCapabilities?.length, 1, "the old adapter keeps its complete return contract");
  assert.throws(() => capturePluginModule({ ...module, ui: null }), /missing UI slice/);
  assert.throws(() => capturePluginModule({ ...module, ui: { ...module.ui!, manifest: {
    ...module.manifest, version: "2.0.0",
  } } }), /does not match/);
});

test("legacy internal registration, default UI host and catalog remain usable under their old conditions", () => {
  const module = adaptUiPluginPackage(viewPlugin());
  const catalog = new UiPluginCatalog([module]);
  assert.equal(catalog.list()[0], module);
  assert.equal(catalog.installationPlan()[0], module);
  assert.equal(catalog instanceof PluginCatalogBase, true);
  catalog.clear(); assert.deepEqual(catalog.list(), []);
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(module);
  platform.start();
  assert.equal(platform.components().get("test.ui-required.view")?.id, "test.ui-required.view");
  assert.equal(platform.applicationCapabilities().get("test.ui-required.read")?.ownerPluginId, module.manifest.id);
  platform.dispose();
});

test("direct trusted UI host injection executes the original UI entry point", () => {
  const host = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([]));
  const platform = new PluginPlatform({ uiHost: host });
  platform.register(viewPlugin());
  assert.deepEqual(platform.start().pluginIds, ["test.ui-required"]);
  assert.equal(host.ownerOf("test.ui-required.view")?.id, "test.ui-required");
  platform.dispose(); assert.deepEqual(host.list(), []);
});

test("common platform has no concrete UI construction and keeps the legacy composition route explicit", () => {
  const source = readFileSync(new URL("../src/plugins/plugin-platform.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new\s+(?:ConcreteUiPluginHost|UiPluginHost|UiProjectionRegistry)\s*\(/);
  assert.match(source, /readonly uiHost\?: PluginContributionHost \| null/);
  assert.match(source, /createLegacyContributionHost/);
});
