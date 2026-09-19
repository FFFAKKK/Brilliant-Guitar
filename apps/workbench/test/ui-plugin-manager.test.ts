import assert from "node:assert/strict";
import test from "node:test";
import { UiPluginHost } from "../src/ui/plugin-manager.ts";
import type { InternalUiPluginModule } from "../src/ui/plugin-manager.ts";
import type { UiComponentDefinition } from "../src/ui/plugin-contract.ts";
import { WORKBENCH_PLUGIN_API_VERSION, WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";
import { UiPluginDiagnosticStore, UiPluginHostError, serializeUiPluginDiagnostic } from "../src/ui/plugin-diagnostic.ts";
import type { NotationInteractionContribution } from "../src/input/notation-interaction-registry.ts";
import type { UiComponentExtensionContribution } from "../src/ui/view-contribution.ts";

const projection = defineUiProjection<{ readonly enabled: boolean }>("test.state");
const definition = (id: string, commands: readonly string[] = []): UiComponentDefinition => ({
  id, version: "1.0", kind: "tool", domain: "test.utility", slots: ["bottom"],
  presentation: { allowed: ["panel"], default: "panel" }, capabilities: {},
  permissions: { projections: [projection.id], commands },
});

function plugin(id: string, component: UiComponentDefinition, hostFeatures: readonly string[] = [],
  commands: InternalUiPluginModule["commands"] = [], interactions: InternalUiPluginModule["interactions"] = [],
  componentExtensions: readonly UiComponentExtensionContribution[] = [],
  activation: "always" | "user" = "always"): InternalUiPluginModule {
  const views: InternalUiPluginModule["views"] = [{ definition: component, label: id,
    render: (reader, host) => component.extensionPoints?.[0]
      ? host.extensions(component.extensionPoints[0]).map((extension) => extension.render()).join(",")
      : reader.get(projection).enabled ? "enabled" : "disabled" }];
  return { manifest: { id, name: id, version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
    runtime: "internal-module", activation, requires: { hostFeatures, projections: [projection.id] },
    contributes: { views: [component.id], commands: commands.map((command) => command.id),
      interactions: interactions.map((interaction) => interaction.id),
      componentExtensions: componentExtensions.map((extension) => extension.id) } },
  projections: [projection], commands, interactions, componentExtensions, views };
}

function interaction(id: string, notationKind: "staff" | "tablature" = "staff"): NotationInteractionContribution {
  return { id, notationKind, input: { id: `${id}.input`, canHandle: () => false, translate: () => null },
    readDraft: () => null, startComposition: (draft) => ({ methodId: `${id}.composition`, draft }),
    navigate: () => null, edit: () => null };
}

function host(features: readonly string[] = []) {
  return new UiPluginHost(new WorkbenchFeatureRegistry(features), new UiProjectionRegistry([projection]));
}

function pluginError(run: () => void): UiPluginHostError {
  try {
    run();
    assert.fail("expected UI plugin host error");
  } catch (error) {
    assert.ok(error instanceof UiPluginHostError);
    return error;
  }
}

test("the startup extension host installs compiled V2 modules through declarative contracts", () => {
  const manager = host();
  const command = { id: "example.run", create: () => ({ id: "example.run", label: "运行", scope: "global" as const,
    enabled: true, run() {} }) };
  manager.install(plugin("example.tool", definition("example.panel", [command.id]), [], [command]));
  assert.deepEqual(manager.list().map((item) => item.id), ["example.tool"]);
  assert.deepEqual(manager.components.list().map((item) => item.id), ["example.panel"]);
  assert.equal(manager.ownerOf("example.panel")?.id, "example.tool");
  assert.equal(manager.ownerOfCommand("example.run")?.id, "example.tool");
});

test("user-activated plugins stay installed but contribute only while activated", () => {
  const manager = host();
  const command = { id: "example.user.run", create: () => ({ id: "example.user.run", label: "运行",
    scope: "global" as const, enabled: true, run() {} }) };
  manager.install(plugin("example.always", definition("example.always-panel")));
  manager.install(plugin("example.user", definition("example.user-panel", [command.id]),
    [], [command], [], [], "user"));
  const snapshot = manager.projections.snapshot([bindUiProjection(projection, { enabled: true })]);

  assert.deepEqual([...manager.resolveViews(snapshot).keys()], ["example.always-panel"]);
  assert.deepEqual(manager.resolveCommands(snapshot).map((item) => item.id), []);
  const activated = new Set(["example.user"]);
  assert.deepEqual([...manager.resolveViews(snapshot, activated).keys()],
    ["example.always-panel", "example.user-panel"]);
  assert.deepEqual(manager.resolveCommands(snapshot, activated).map((item) => item.id), ["example.user.run"]);
});

test("notation interaction contributions register with plugin ownership", () => {
  const manager = host();
  const staff = interaction("example.staff");
  manager.install(plugin("example.notation", definition("example.notation-panel"), [], [], [staff]));
  assert.deepEqual(manager.interactions.list(), [staff.id]);
  assert.equal(manager.interactions.hasKind("staff"), true);
  assert.equal(manager.ownerOfInteraction(staff.id)?.id, "example.notation");
});

test("notation interaction IDs and notation kinds are exclusive across plugins", () => {
  const manager = host();
  manager.install(plugin("example.first", definition("example.first-panel"), [], [], [interaction("example.staff")]));
  assert.throws(() => manager.install(plugin("example.same-id", definition("example.same-id-panel"), [], [],
    [interaction("example.staff", "tablature")])), /already owned/);
  assert.throws(() => manager.install(plugin("example.same-kind", definition("example.same-kind-panel"), [], [],
    [interaction("example.other-staff")])), /already owned/);
});

test("installation rejects missing capabilities and mismatched compiled contributions atomically", () => {
  const manager = host(["workbench.layout"]);
  const missing = pluginError(() => manager.install(plugin("example.missing", definition("example.missing-view"), ["score.document"])));
  assert.equal(missing.diagnostic.code, "UI-PLG-003");
  assert.equal(missing.diagnostic.stage, "requirements");
  assert.equal(missing.diagnostic.subject?.id, "score.document");
  assert.match(serializeUiPluginDiagnostic(missing.diagnostic), /reportId=BG-UI-/);
  assert.equal(manager.components.list().length, 0);
  const mismatched = plugin("example.mismatch", definition("example.actual"));
  assert.throws(() => manager.install({ ...mismatched, manifest: { ...mismatched.manifest,
    contributes: { views: ["example.declared"], commands: [], interactions: [], componentExtensions: [] } } }), /does not match/);
  assert.equal(manager.components.list().length, 0);
});

test("component ownership and projection permissions cannot escape their plugin", () => {
  const manager = host();
  manager.install(plugin("example.first", definition("example.panel")));
  const conflict = pluginError(() => manager.install(plugin("example.second", definition("example.panel"))));
  assert.equal(conflict.diagnostic.code, "UI-PLG-008");
  assert.equal(conflict.diagnostic.subject?.ownerPluginId, "example.first");
  const hidden = defineUiProjection<boolean>("test.hidden");
  assert.throws(() => manager.install({ ...plugin("example.hidden", { ...definition("example.hidden-panel"),
    permissions: { projections: [hidden.id], commands: [] } }) }), /undeclared projection/);
});

test("component-owned extension points accept ordered plugin controls with scoped projections", () => {
  const manager = host();
  const extensionPoint = "example.note-control.controls";
  manager.install(plugin("example.note-control", { ...definition("example.note-control-panel"), extensionPoints: [extensionPoint] }));
  const technique: UiComponentExtensionContribution = {
    id: "example.technique.control", extensionPoint, order: 20,
    render: (reader) => reader.get(projection).enabled ? "technique" : "disabled",
  };
  manager.install(plugin("example.technique", definition("example.technique-panel"), [], [], [], [technique]));
  const snapshot = manager.projections.snapshot([bindUiProjection(projection, { enabled: true })]);
  assert.equal(manager.resolveViews(snapshot).get("example.note-control-panel")?.render(), "technique");
  assert.equal(manager.ownerOfComponentExtension(technique.id)?.id, "example.technique");
});

test("component extensions reject missing points and duplicate identities", () => {
  const manager = host();
  const missing: UiComponentExtensionContribution = {
    id: "example.missing.control", extensionPoint: "example.missing.controls", render: () => null,
  };
  assert.throws(() => manager.install(plugin("example.missing-extension", definition("example.missing-panel"),
    [], [], [], [missing])), /not installed/);
  const extensionPoint = "example.note-control.controls";
  manager.install(plugin("example.note-control", { ...definition("example.note-control-panel"), extensionPoints: [extensionPoint] }));
  const extension: UiComponentExtensionContribution = {
    id: "example.shared.control", extensionPoint, render: () => null,
  };
  manager.install(plugin("example.first-extension", definition("example.first-extension-panel"), [], [], [], [extension]));
  assert.throws(() => manager.install(plugin("example.second-extension", definition("example.second-extension-panel"),
    [], [], [], [{ ...extension }])), /already owned/);
});

test("command factories keep declared ownership and receive only plugin projections", () => {
  const manager = host();
  const command = { id: "example.run", create: (reader: Parameters<InternalUiPluginModule["commands"][number]["create"]>[0]) => ({
    id: "example.run", label: "运行", scope: "global" as const, enabled: reader.get(projection).enabled, run() {},
  }) };
  manager.install(plugin("example.first", definition("example.first-panel", [command.id]), [], [command]));
  const snapshot = manager.projections.snapshot([bindUiProjection(projection, { enabled: true })]);
  assert.equal(manager.resolveCommands(snapshot)[0]?.enabled, true);
  const bad = plugin("example.bad-command", definition("example.bad-panel", ["example.bad"]), [],
    [{ id: "example.bad", create: () => ({ id: "example.changed", label: "坏命令", scope: "global", enabled: true, run() {} }) }]);
  manager.install(bad);
  assert.throws(() => manager.resolveCommands(snapshot), /changed its declared ID/);
});

test("a production host isolates command assembly failures and deduplicates their reports", () => {
  const diagnostics = new UiPluginDiagnosticStore();
  const manager = new UiPluginHost(new WorkbenchFeatureRegistry([]), new UiProjectionRegistry([projection]),
    (diagnostic) => diagnostics.report(diagnostic));
  const good = { id: "example.good", create: () => ({ id: "example.good", label: "正常命令", scope: "global" as const,
    enabled: true, run() {} }) };
  const bad = { id: "example.bad", create: () => ({ id: "example.changed", label: "冲突命令", scope: "global" as const,
    enabled: true, run() {} }) };
  manager.install(plugin("example.commands", definition("example.commands-panel", [good.id, bad.id]), [], [good, bad]));
  const snapshot = manager.projections.snapshot([bindUiProjection(projection, { enabled: true })]);
  assert.deepEqual(manager.resolveCommands(snapshot).map((command) => command.id), ["example.good"]);
  assert.deepEqual(manager.resolveCommands(snapshot).map((command) => command.id), ["example.good"]);
  assert.equal(diagnostics.list().length, 1);
  assert.equal(diagnostics.list()[0]?.code, "UI-PLG-011");
  assert.equal(diagnostics.list()[0]?.subject?.id, "example.bad");
});
