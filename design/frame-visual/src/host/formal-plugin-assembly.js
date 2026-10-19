import { PluginPlatform, definePlugin, isPluginPackage, WorkbenchFeatureRegistry, createMountContributionHost } from "../vendor/plugin-platform.js";
import { createUiPluginHost } from "../runtime/ui-plugin-host.js";
import { validateManifest, installContributions } from "../runtime/ui-contribution-installation.js";
import { capturePluginFacets } from "../runtime/plugin-facets.js";
import { captureConfig } from "../runtime/runtime-support.js";
import { BACKUP_PLUGIN_DIRECTORY } from "./backup-plugin-directory.js";
import { validatePluginSettings } from "../startup/plugin-startup-plan.js";
import { scopeNotationInteractions } from "../vendor/score-interaction.js";

// Explicit application-owned development identities. Never infer third-party names/versions.
export const BACKUP_PLUGIN_IDENTITIES = Object.freeze(Object.fromEntries(BACKUP_PLUGIN_DIRECTORY.map(item => [item.id,
  Object.freeze({ id: item.id, name: item.name, version: "0.1.0", tier: "product", activation: item.required ? "always" : "user" })])));

export function assertBackupPluginInput(plugin, metadata = {}) {
  if (isPluginPackage(plugin) && plugin.apiVersion === "4.0") return;
  if (plugin != null && (Object.hasOwn(plugin, "apiVersion") || plugin.manifest != null && Object.hasOwn(plugin.manifest, "apiVersion"))) {
    throw new TypeError("备份 UI 需要明确的 apiVersion 4.0 公共挂载包；旧 3.0 render 需要显式适配");
  }
  if (!plugin?.namespace || !metadata[plugin.namespace]) throw new TypeError("旧备份声明需要可信应用提供 id/name/version/activation 元数据");
}

export function prepareBackupPlugin(plugin, metadata = BACKUP_PLUGIN_IDENTITIES) {
  assertBackupPluginInput(plugin, metadata);
  if (isPluginPackage(plugin)) return plugin;
  const declaration = captureConfig(plugin, "legacyUi");
  const problems = validateManifest(declaration);
  if (problems.length) throw new Error(problems.join("；"));
  const facets = capturePluginFacets(declaration);
  const identity = metadata[declaration.namespace];
  if (identity.id !== declaration.namespace || !identity.name || !identity.version
    || !["always", "user"].includes(identity.activation)) throw new TypeError("旧备份身份元数据必须明确且与 namespace 一致");
  return definePlugin({ ...identity, apiVersion: "4.0", ui: {
    contractVersion: 1, components: (declaration.components ?? []).map(component => ({ ...component,
      uiKind: component.uiKind ?? (component.role === "view" ? "view" : component.role === "status" ? "slotItem"
        : facets.ui.pages.some(page => page.componentId === component.id) ? "page" : "module") })),
    commands: (declaration.commands ?? []).map(command => ({ ...command, run: payload => command.run(payload) })),
    menuItems: (declaration.menuItems ?? []).map((item, index) => ({ id: `${identity.id}.menu-${index}`, ...item })),
    shortcuts: declaration.shortcuts ?? [],
  } });
}

export function createBackupFormalPlatform({ router, components, menus }) {
  const uiHost = createUiPluginHost({ components });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: context => createMountContributionHost(context, plugin => {
      const ui = plugin.ui;
      const settings = context.settings(plugin.manifest.id);
      const settingsRead = settings ? Object.freeze({ read: settings.read }) : undefined;
      const runtimeHost = Object.freeze(settingsRead ? { settings: settingsRead } : {});
      const notationInteractions = plugin.interactions.length
        ? scopeNotationInteractions(platform.interactions(), plugin.interactions) : undefined;
      const manifest = { namespace: plugin.manifest.id, components: (ui?.components ?? []).map(component => {
        return { ...component, mount(element, ctx, presentation) {
          return component.mount(element, Object.freeze({ ...ctx, ...(settingsRead ? { settings: settingsRead } : {}),
            ...(notationInteractions ? { notationInteractions } : {}) }), presentation);
        } };
      }), commands: (ui?.commands ?? []).map(command => ({ ...command, run: payload => command.run(payload, runtimeHost) })),
      menuItems: ui?.menuItems ?? [], shortcuts: ui?.shortcuts ?? [] };
      return installContributions({ router, menus, facetHosts: { ui: uiHost } }, manifest, capturePluginFacets(manifest));
    }) });
  return platform;
}

/** Current plan envelope stays unchanged; registry restoration happens before start and first mount. */
export function configureBackupFormalPlatform(platform, { plugins, plan = null }) {
  if (plan) {
    const unlisted = plugins.filter(plugin => !Object.hasOwn(plan.plugins, plugin.id));
    if (unlisted.length) throw new Error(`启动计划未声明插件：${unlisted.map(plugin => plugin.id).join(", ")}`);
  }
  const selected = plugins.filter(plugin => plugin.activation === "user"
    && (plan === null || plan.plugins[plugin.id].enabled === true)).map(plugin => plugin.id);
  platform.restoreActivation(selected);
  if (plan) {
    const document = Object.fromEntries(Object.entries(plan.plugins).filter(([id]) => platform.settings().has(id))
      .map(([id, item]) => [id, { schemaVersion: 1, value: item.settings }]));
    const result = platform.settings().restore(document);
    if (result.defaulted.length) throw new Error(`启动设置恢复失败：${result.defaulted.join(", ")}`);
  }
}

export function backupSettingsDefinition(pluginId) {
  const entry = BACKUP_PLUGIN_DIRECTORY.find(item => item.id === pluginId);
  if (!entry?.fields.length) return undefined;
  const defaults = Object.fromEntries(entry.fields.map(field => [field.key, field.initial]));
  return Object.freeze({ schemaVersion: 1, defaults, parse(value) {
    try { return validatePluginSettings(entry, value); } catch { return null; }
  } });
}
