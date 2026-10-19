import { isRecord } from "../runtime/runtime-support.js";
import { createDesktopSettingsDocumentStore } from "./desktop-settings-document-store.js";
import { DEFAULT_STARTUP_APPEARANCE, validateStartupAppearance } from "./startup-appearance-settings.js";

export const STARTUP_APPEARANCE_NAMESPACE = "brilliant.ui.startup-appearance";
export function createDesktopStartupAppearanceStore({ settingsStorage }) {
  const documents = createDesktopSettingsDocumentStore({ settingsStorage });
  const readFrom = data => {
    if (!Object.hasOwn(data, STARTUP_APPEARANCE_NAMESPACE)) return null;
    const envelope = data[STARTUP_APPEARANCE_NAMESPACE];
    if (!isRecord(envelope) || Object.keys(envelope).length !== 2 || envelope.schemaVersion !== 1 || !Object.hasOwn(envelope, "value")) {
      throw new Error("不支持或损坏的启动中心外观envelope");
    }
    return validateStartupAppearance(envelope.value);
  };
  return Object.freeze({
    async read() { return readFrom(await documents.read()); },
    write(value, { expectedRevision, isCurrent } = {}) {
      const accepted = validateStartupAppearance(value);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || accepted.revision !== expectedRevision + 1) {
        return Promise.reject(new Error("外观设置需要有效的保存修订前提"));
      }
      return documents.update(data => {
        const actual = readFrom(data) ?? DEFAULT_STARTUP_APPEARANCE;
        if (actual.revision !== expectedRevision) throw Object.assign(new Error("外观设置已改变，重新读取将撤销未保存设置"), { code: "appearance.conflict" });
        return { ...data, [STARTUP_APPEARANCE_NAMESPACE]: { schemaVersion: 1, value: accepted } };
      }, { isCurrent });
    },
  });
}
