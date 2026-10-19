import assert from "node:assert/strict";
import test from "node:test";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import type { DefinePluginInput } from "../src/plugins/plugin-sdk.ts";
import { adaptUiPluginPackage } from "../src/plugins/plugin-sdk-adapter.ts";
import { captureUiPluginManifest, WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import { captureInternalUiPluginModule } from "../src/ui/plugin-module-capture.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { createMountContributionHost } from "../src/plugins/plugin-mount-host.ts";

const identity = { id: "trial.mount", name: "Mount trial", version: "0.1.0", apiVersion: "4.0" } as const;
const emptyUi = () => ({ contractVersion: 1 as const, components: [], commands: [], menuItems: [], shortcuts: [] });

test("the public mount declaration captures strict shape permission and frozen author variants", () => {
  const variants = { authored: { type: "tween" as const, duration: .28, ease: [.77, 0, .175, 1] } };
  const unit = { id: "trial.mount.shape", title: "Shape", role: "tool" as const, slots: ["left" as const], mount() {},
    permissions: { animations: ["shape-transition" as const] },
    animations: { contractVersion: 1 as const, definitions: { "shape-transition": { defaultVariant: "authored", variants } } } };
  const accepted = definePlugin({ ...identity, ui: { ...emptyUi(), components: [unit] } });
  variants.authored.duration = .3;
  assert.equal(accepted.ui?.components[0]?.animations?.definitions["shape-transition"]?.variants.authored?.type, "tween");
  assert.equal((accepted.ui?.components[0]?.animations?.definitions["shape-transition"]?.variants.authored as { duration: number }).duration, .28);
  assert.ok(Object.isFrozen(accepted.ui?.components[0]?.animations?.definitions["shape-transition"]?.variants));
  assert.throws(() => definePlugin({ ...identity, ui: { ...emptyUi(), components: [{ ...unit, permissions: {} }] } }));
  for (const variant of [{ type: "spring", stiffness: 260, damping: 32 }, { ...variants.authored, fadeDuration: .2 }]) {
    assert.throws(() => definePlugin({ ...identity, ui: { ...emptyUi(), components: [{ ...unit,
      animations: { contractVersion: 1, definitions: { "shape-transition": { defaultVariant: "authored", variants: { authored: variant } } } },
    }] } } as unknown as DefinePluginInput));
  }
});

test("a UI-free 4.0 package uses the same platform identity, kernel plan and fixed lifecycle", () => {
  let releases = 0;
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, () => () => { releases++; }) });
  platform.register(definePlugin({ ...identity, activation: "user" }));
  platform.activate(identity.id);
  const plan = platform.start();
  assert.deepEqual(plan.pluginIds, [identity.id]);
  assert.deepEqual(platform.facets(), []);
  assert.equal(platform.list()[0]?.manifest.apiVersion, "4.0");
  platform.deactivate(identity.id);
  assert.deepEqual(platform.sessionPlan().pluginIds, [identity.id]);
  assert.equal(platform.restartRequired(), true);
  platform.dispose(); platform.dispose();
  assert.equal(releases, 1);
  assert.equal(platform.phase(), "disposed");
  assert.deepEqual(platform.list(), []);
  assert.throws(() => platform.start(), /disposed/);
  assert.throws(() => platform.register(definePlugin(identity)), /disposed/);
  assert.throws(() => platform.activate(identity.id), /disposed/);
});

test("API compatibility is explicit: 3.0 rejects mount data and 4.0 rejects React contributions", () => {
  assert.throws(() => definePlugin({ ...identity, apiVersion: "3.0", ui: emptyUi() }), /requires plugin API 4\.0/);
  for (const apiVersion of ["4.1", 1, null]) {
    assert.throws(() => definePlugin({ ...identity, apiVersion } as unknown as DefinePluginInput), /Unsupported/);
  }
  const old = adaptUiPluginPackage(definePlugin({ ...identity, apiVersion: "3.0" }));
  assert.equal(captureUiPluginManifest({ ...old.manifest, contributes: { ...old.manifest.contributes, ui: undefined } }), null);
  assert.throws(() => definePlugin({ ...identity, commands: [{ id: "trial.mount.bad", create() { throw new Error(); } }] }), /requires mount/);
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(definePlugin(identity)); platform.start();
  assert.equal(platform.list()[0]?.status, "failed", "the legacy React host cannot silently accept a mount package");
  platform.dispose();
});

test("mount capture isolates author mutation and emits data-only manifest IDs", () => {
  const keys = ["Mod+I"];
  const command = { id: "trial.mount.inspect", label: "Inspect", keys, run: (value: unknown) => value };
  const packageValue = definePlugin({ ...identity, ui: { ...emptyUi(), commands: [command] } });
  keys[0] = "Mod+Z"; command.label = "Changed";
  const module = adaptUiPluginPackage(packageValue);
  assert.equal(module.ui?.commands[0]?.label, "Inspect");
  assert.deepEqual(module.ui?.commands[0]?.keys, ["Mod+I"]);
  assert.deepEqual(module.manifest.contributes.ui?.commands, [command.id]);
  assert.deepEqual(JSON.parse(JSON.stringify(module.manifest.contributes.ui)), module.manifest.contributes.ui);
  assert.equal(Object.hasOwn(module.manifest.contributes.ui!, "run"), false);
  assert.throws(() => captureInternalUiPluginModule({ ...module, manifest: { ...module.manifest,
    contributes: { ...module.manifest.contributes, ui: { ...module.manifest.contributes.ui!, commands: [] } } } }), /do not match/);
  let reads = 0;
  const raw = { ...emptyUi(), get components() { reads++; return []; } };
  assert.throws(() => definePlugin({ ...identity, ui: raw }), /Invalid mount UI/);
  assert.equal(reads, 0);
});

test("formal settings restore completes before the injected mount host installs a plugin", () => {
  const observed: unknown[] = [];
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, plugin => {
      observed.push(context.settings(plugin.manifest.id)?.read()); return () => {};
    }) });
  platform.register(definePlugin({ ...identity, settings: { schemaVersion: 1, defaults: 1,
    parse: value => typeof value === "number" && Number.isSafeInteger(value) ? value : null } }));
  platform.settings().restore({ [identity.id]: { schemaVersion: 1, value: 7 } });
  assert.deepEqual(observed, []); platform.start(); assert.deepEqual(observed, [7]);
  platform.dispose(); assert.throws(() => platform.settings().write(identity.id, 9), /disposed/);
});

test("requirements and host-service permissions are checked before any mount resources are installed", () => {
  let mounts = 0;
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, () => { mounts++; return () => {}; }) });
  platform.register(definePlugin({ ...identity, hostFeatures: ["feature.missing"] }));
  platform.register(definePlugin({ ...identity, id: "trial.denied", hostServices: ["score.edit"] }));
  platform.start();
  assert.deepEqual(platform.list().map(record => record.status), ["failed", "failed"]);
  assert.equal(mounts, 0); platform.dispose();
});

test("business contribution failure rolls back mount resources without stopping other plugins", () => {
  let acquired = 0, released = 0;
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, () => {
      acquired++; return () => { released++; };
    }) });
  const interaction = (id: string) => ({ id, notationKind: "staff" as const,
    input: { id: `${id}.input`, canHandle: () => false, translate: () => null }, readDraft: () => null,
    startComposition: (draft: unknown) => ({ methodId: "trial.method", draft }), navigate: () => null, edit: () => null });
  platform.register(definePlugin({ ...identity, interactions: [interaction("trial.mount.input")] }));
  platform.register(definePlugin({ ...identity, id: "trial.conflict", interactions: [interaction("trial.conflict.input")] }));
  platform.start();
  assert.equal(platform.list()[0]?.status, "active");
  assert.equal(platform.list()[1]?.status, "failed");
  assert.equal(acquired, 2); assert.equal(released, 1);
  assert.equal(platform.interactions().hasKind("staff"), true);
  platform.dispose(); assert.equal(released, 2);
  assert.deepEqual(platform.interactions().list(), []);
});

test("whole-session disposal rejects late settings/activation reads without dispatching new persistence writes", async () => {
  const reads: ((value: unknown) => void)[] = [];
  let writes = 0;
  const storage = { read: () => new Promise<unknown>(resolve => { reads.push(resolve); }),
    write: async () => { writes++; } };
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, () => () => {}) });
  platform.register(definePlugin({ ...identity, activation: "user", settings: { schemaVersion: 1, defaults: 1,
    parse: value => typeof value === "number" ? value : null } }));
  platform.activate(identity.id); platform.start();
  const settings = platform.connectSettings(storage), activation = platform.connectActivation(storage);
  const settingsRestore = assert.rejects(settings.restore(), /disposed/);
  const activationRestore = assert.rejects(activation.restore(), /disposed/);
  platform.dispose();
  reads[0]?.({ [identity.id]: { schemaVersion: 1, value: 7 } });
  reads[1]?.({ schemaVersion: 1, enabledPluginIds: [identity.id] });
  await Promise.all([settingsRestore, activationRestore]); assert.equal(writes, 0);
  await assert.rejects(settings.write(identity.id, 9), /disposed/);
  await assert.rejects(activation.setEnabled(identity.id, true), /disposed/);
});
