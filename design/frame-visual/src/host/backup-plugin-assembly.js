import { BACKUP_PLUGIN_DIRECTORY } from "./backup-plugin-directory.js";
import { definePluginDirectory, validateStartupPlan } from "../startup/plugin-startup-plan.js";
import { isPluginPackage } from "../vendor/plugin-platform.js";
import { createCoreScorePlugin } from "../fixtures/core-score-plugin.js";
import { createScoreInfoPlugin } from "../features/score-info-plugin.js";

/** Trusted fixed application entries. Metadata is data; executable packages stay with the composition root. */
export function prepareBackupStartupEntries(entries = []) {
  if (!Array.isArray(entries)) throw new TypeError("固定装配 startupEntries 必须为数组");
  const packages = entries.map(entry => {
    if (!entry || typeof entry !== "object" || Object.keys(entry).length !== 2
      || !Object.hasOwn(entry, "metadata") || !Object.hasOwn(entry, "plugin")) {
      throw new TypeError("固定装配项只能包含 metadata 和 plugin");
    }
    const { metadata, plugin } = entry;
    if (!isPluginPackage(plugin) || plugin.apiVersion !== "4.0" || metadata?.id !== plugin.id) {
      throw new TypeError("固定装配 metadata.id 必须匹配明确的 4.0 公共包");
    }
    if (plugin.activation !== (metadata.required ? "always" : "user")) {
      throw new TypeError(`${plugin.id} 固定装配 required 与 activation 不一致`);
    }
    if (metadata.fields?.length && !plugin.settings) throw new TypeError(`${plugin.id} 目录参数需要包 settings 声明`);
    if (plugin.settings && plugin.settings.schemaVersion !== 1) throw new TypeError(`${plugin.id} 启动参数只支持 schemaVersion 1`);
    return plugin;
  });
  const directory = definePluginDirectory([...BACKUP_PLUGIN_DIRECTORY, ...entries.map(entry => entry.metadata)]);
  const captured = Object.freeze(packages.map((plugin, index) => Object.freeze({ plugin, metadata: directory[BACKUP_PLUGIN_DIRECTORY.length + index] })));
  return Object.freeze({ directory, entries: captured, plugins: Object.freeze(packages) });
}

/** Only the trusted application entry gets factories and score context. */
export function assembleBackupUiPlugins({ plan, score, documentActions = null, directory = BACKUP_PLUGIN_DIRECTORY }) {
  const accepted = validateStartupPlan(directory, plan);
  const plugins = [createCoreScorePlugin({ score, documentActions })];
  if (accepted.plugins["frame.score-info"].enabled) {
    plugins.push(createScoreInfoPlugin({ score }));
  }
  // frame.builtin/layout and the state page are composed inside the same workspace root.
  return Object.freeze({ plan: accepted, plugins: Object.freeze(plugins), enablePluginDiagnostics: accepted.plugins["frame.plugins"].enabled });
}
