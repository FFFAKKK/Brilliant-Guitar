import { isRecord } from "../runtime/runtime-support.js";
import { defaultStartupPlan, validateStartupPlan } from "./plugin-startup-plan.js";
import { createDesktopSettingsDocumentStore } from "./desktop-settings-document-store.js";

export const BACKUP_STARTUP_SETTINGS_NAMESPACE = "brilliant.ui.backup-startup";

/** Reuses the desktop plugin-settings document. This namespace is data, not another plugin. */
export function createDesktopPluginPlanStore({ settingsStorage, directory } = {}) {
  const documents = createDesktopSettingsDocumentStore({ settingsStorage });
  function planFrom(data) {
    if (!Object.hasOwn(data, BACKUP_STARTUP_SETTINGS_NAMESPACE)) return null;
    const envelope = data[BACKUP_STARTUP_SETTINGS_NAMESPACE];
    if (!isRecord(envelope) || envelope.schemaVersion !== 1 || Object.keys(envelope).length !== 2
      || !Object.hasOwn(envelope, "value")) throw new Error("不支持或损坏的备份启动配置 envelope");
    return validateStartupPlan(directory, envelope.value);
  }
  return Object.freeze({
    async read() { return planFrom(await documents.read()); },
    write(plan, { expectedRevision, isCurrent } = {}) {
      const accepted = validateStartupPlan(directory, plan);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || accepted.revision !== expectedRevision + 1) {
        return Promise.reject(new Error("桌面启动配置需要有效的保存修订前提"));
      }
      return documents.update(data => {
        const actual = planFrom(data) ?? defaultStartupPlan(directory);
        if (actual.revision !== expectedRevision) throw new Error("桌面启动配置已改变，请重新读取");
        // One write contains activation and parameters; preserve all unrelated/future namespaces.
        return { ...data, [BACKUP_STARTUP_SETTINGS_NAMESPACE]: { schemaVersion: 1, value: accepted } };
      }, { isCurrent });
    },
  });
}
