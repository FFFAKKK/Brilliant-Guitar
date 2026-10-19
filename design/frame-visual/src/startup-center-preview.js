import { BACKUP_PLUGIN_DIRECTORY } from "./host/backup-plugin-directory.js";
import { createPluginStartupController } from "./startup/plugin-startup-controller.js";
import { mountStartupCenterView } from "./startup/startup-center-view.js";
import { notifyObservers } from "./runtime/runtime-support.js";

const examples = Object.freeze([
  { id: "melody", name: "旋律练习", folder: "练习 / 五线谱", time: "今天" },
  { id: "arpeggio", name: "分解和弦", folder: "练习 / 吉他", time: "昨天" },
  { id: "phrase", name: "乐句草稿", folder: "创作 / 草稿", time: "周二" },
  { id: "rhythm", name: "节奏练习", folder: "练习 / 节奏", time: "周一" },
].map(Object.freeze));

/** Independent adapter over the shared view. No persistence, document or platform. */
export function mountStartupCenterVisual({ root }) {
  let acceptedPlan = null, message = "视觉预览";
  const listeners = new Set();
  const controller = createPluginStartupController({ directory: BACKUP_PLUGIN_DIRECTORY, store: {
    read: () => acceptedPlan === null ? null : structuredClone(acceptedPlan),
    write: value => { acceptedPlan = structuredClone(value); },
  } });
  let view;
  try {
    view = mountStartupCenterView({ root, visualOnly: true, application: { controller,
      snapshot: () => ({ message, canChoose: true, busy: false, recent: { entries: examples }, document: { status: "empty" } }),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      enter(intent) {
        message = (intent.kind === "new" ? "新建作品" : intent.kind === "open" ? "打开作品" : "打开" + examples.find(item => item.id === intent.recordId).name) + " · 视觉预览";
        notifyObservers(listeners); return { ok: true };
      },
    } });
  } catch (error) { controller.dispose(); throw error; }
  return Object.freeze({ showPage: view.showPage, snapshot: view.snapshot,
    dispose() { try { view.dispose(); } finally { controller.dispose(); listeners.clear(); } },
  });
}
