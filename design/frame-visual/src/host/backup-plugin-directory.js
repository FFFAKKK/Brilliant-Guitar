import { definePluginDirectory } from "../startup/plugin-startup-plan.js";

// This is trusted backup-application assembly metadata, not a new SDK manifest.
export const BACKUP_PLUGIN_DIRECTORY = definePluginDirectory([
  { id: "frame.builtin", name: "工作区基础", icon: "library", summary: "基础页面与宿主界面", builtin: true, required: true,
    reason: "四栏工作区需要基础页面", enabled: true, source: "备份框架",
    contributions: [{ icon: "page", label: "基础页面" }], dependencies: [], fields: [] },
  { id: "frame.layout", name: "工作区布局", icon: "layout", summary: "四栏与布局设置", builtin: true, required: true,
    reason: "四栏工作区需要布局管理", enabled: true, source: "备份框架",
    contributions: [{ icon: "layout", label: "布局设置" }], dependencies: ["frame.builtin"], fields: [] },
  { id: "notation.core", name: "核心谱面", icon: "note", summary: "中央五线谱视图", builtin: true, required: true,
    reason: "工作区需要唯一中央谱面视图", enabled: true, source: "共享记谱与备份核心谱面",
    contributions: [{ icon: "page", label: "五线谱视图" }], dependencies: [], fields: [] },
  { id: "frame.plugins", name: "插件状态", icon: "library", summary: "本次会话的登记与贡献", builtin: true, required: false,
    enabled: true, source: "备份框架",
    contributions: [{ icon: "library", label: "只读状态页" }], dependencies: ["frame.builtin"], fields: [] },
  { id: "frame.score-info", name: "谱面信息", icon: "page", summary: "文档概览与小节列表", builtin: true, required: false,
    enabled: false, source: "备份框架 · 接入验证插件",
    contributions: [{ icon: "left", label: "信息面板" }, { icon: "page", label: "只读信息命令" }], dependencies: ["notation.core"],
    fields: [{ key: "mode", label: "显示内容", type: "select", initial: "summary", options: [["summary", "概览"], ["measures", "小节"]] },
      { key: "measureLimit", label: "小节条数", type: "number", initial: 8, min: 1, max: 32 }] },
]);
