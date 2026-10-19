/* Visual fixtures only. Nothing here is persisted or registered with the runtime. */
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_COMPACT_SIZES, WORKSPACE_MINIMUMS } from "../workspace-geometry.js";
export const MODULES = [
  { id: "A", name: "模块 A", icon: "note", width: "full", supports: ["full"], height: 228, available: true, removable: true },
  { id: "B", name: "模块 B", icon: "note", width: "half", supports: ["half", "full"], height: 64, available: true, removable: true },
  { id: "C", name: "模块 C", icon: "grid", width: "half", supports: ["half", "full"], height: 88, available: true, removable: true },
  { id: "D", name: "模块 D", icon: "page", width: "full", supports: ["full"], height: 96, available: true, removable: false },
  { id: "E", name: "模块 E", icon: "tone", width: "half", supports: ["half"], height: 48, available: true, removable: true },
];
export const PAGES = [
  { id: "properties", name: "谱面属性", icon: "page", bottom: 0 },
  { id: "assistant", name: "AI 助手", icon: "chat", bottom: 64 },
  { id: "tone", name: "音色", icon: "tone", bottom: 0 },
  { id: "layout", name: "工作区布局", icon: "layout", bottom: 0 },
];
export const DEFAULTS = {
  leftOpen: false, rightOpen: true, leftWidth: WORKSPACE_DEFAULT_SIZES.left, rightWidth: WORKSPACE_DEFAULT_SIZES.right,
  topContributed: false, topOpen: true, topHeight: WORKSPACE_DEFAULT_SIZES.top, voiceOpen: false, voiceHeight: WORKSPACE_DEFAULT_SIZES.voice,
  showModuleCatalog: false, assemblyBefore: null,
  arrangement: "balanced",
  editing: false, enabled: [], widths: {}, selectedModule: "A",
  rightPage: 3, pageCount: 4, bottomOverride: null, rightLong: false,
  preset: "写谱", modified: false, custom: false, title: "谱面尺寸验证",
  status: "只读练习谱 · 16 小节", save: "saved", platform: "windows",
  assembly: false, dragging: false,
  blankPaper: false, paperOverlay: false, zoom: "fit", paperWidth: null, paperOrigin: null,
  extraModules: 0, extraPages: 0, unavailable: [], badge: false,
  slotOverflow: null, topOverflow: false, emptySlots: false,
  focusTarget: null, layer: null, notice: null, modal: null,
  libraryQuery: "", libraryLong: false, unknown: false, pageInput: "",
};
export const PRESETS = {
  "写谱": { enabled: ["A", "B", "C"], leftOpen: true, rightOpen: true, voiceOpen: false },
  "排版": { enabled: ["A", "D", "B", "C"], leftOpen: true, rightOpen: true, voiceOpen: false },
  "练习": { enabled: ["D", "E"], leftOpen: true, rightOpen: false, voiceOpen: true },
};
const moduleScenes = new Set(["S04", "S05", "S06", "S07", "S08", "S21", "S30"]);
const scene = (id, label, variants) => ({ id, label, variants: Object.fromEntries(
  Object.entries(variants).map(([variant, patch]) => [variant, {
    ...(moduleScenes.has(id) ? { leftOpen: true, rightPage: 0, showModuleCatalog: true, enabled: ["A", "B", "C"] } : {}),
    ...patch,
  }])) });
export const SCENARIOS = [
  scene("S01", "默认完整框架", { default: {} }),
  scene("S02", "薄上侧栏与模式条", {
    visible: { topContributed: true, topOpen: true, assembly: true },
    hidden: { topContributed: true, topOpen: false, assembly: true },
    empty: { topContributed: false, topOpen: true },
  }),
  scene("S03", "长标题与平台", {
    long: { title: "吉他独奏练习曲 · 第一部分 · 分段排版与谱面尺寸验证 · 修订版", status: "只读练习谱 · 16 小节 · 本地备份 · 第一版" },
    failed: { save: "failed", status: "保存失败" },
    mac: { platform: "mac" },
  }),
  scene("S04", "图标栏状态", {
    enabled: { enabled: ["A", "B", "C", "D", "E"], badge: true },
    disabled: { unavailable: ["E"], badge: true },
    overflow: { extraModules: 28, badge: true },
  }),
  scene("S05", "左栏宽度", {
    narrow: { leftWidth: WORKSPACE_MINIMUMS.left, rightWidth: WORKSPACE_MINIMUMS.right },
    default: { leftWidth: WORKSPACE_DEFAULT_SIZES.left, rightWidth: WORKSPACE_DEFAULT_SIZES.right },
    wide: { leftWidth: 360 },
  }),
  scene("S06", "网格与空位", {
    rows: { enabled: ["A", "B", "C", "D", "E"] },
    gap: { enabled: ["B", "D", "C"] },
    empty: { enabled: [] },
  }),
  scene("S07", "模块编辑", {
    editing: { editing: true, enabled: ["A", "B", "C", "D", "E"] },
    completed: { enabled: ["B", "C", "A"], widths: { B: "full" }, modified: true },
    disabled: { editing: true, selectedModule: "D", enabled: ["D", "E"] },
  }),
  scene("S08", "排序目标与键盘", {
    target: { editing: true, dragging: true, enabled: ["B", "D", "C"] },
    result: { editing: true, enabled: ["C", "B", "D"], selectedModule: "C", modified: true },
    keyboard: { editing: true, enabled: ["A", "B", "C"], layer: { type: "module", module: "B" }, focusTarget: "module-B" },
  }),
  scene("S09", "工作区布局模式", {
    entered: { assembly: true, topContributed: true, topOpen: true },
    exited: { assembly: false },
  }),
  scene("S10", "工作区排布控制", {
    balanced: { assembly: true, topContributed: true, topOpen: true, arrangement: "balanced" },
    compact: { assembly: true, topContributed: true, topOpen: true, arrangement: "compact", leftWidth: WORKSPACE_COMPACT_SIZES.left, rightWidth: WORKSPACE_COMPACT_SIZES.right, voiceHeight: 80 },
    regions: { assembly: true, topContributed: true, topOpen: true, leftOpen: true, rightOpen: false, voiceOpen: true },
    reset: { assembly: true, topContributed: true, topOpen: true, arrangement: "compact", leftWidth: WORKSPACE_COMPACT_SIZES.left, rightWidth: WORKSPACE_COMPACT_SIZES.right, voiceHeight: 80, leftOpen: true, rightOpen: false },
  }),
  scene("S11", "白纸与滚动", {
    fit: {}, full: { zoom: "100%" }, blank: { blankPaper: true },
  }),
  scene("S12", "透明覆盖层", { overlays: { paperOverlay: true } }),
  scene("S13", "页边与首尾", {
    first: { rightPage: 0 }, middle: { rightPage: 1 }, last: { rightPage: 3 },
  }),
  scene("S14", "页内滚动与固定底", {
    fixed: { rightPage: 1, bottomOverride: 64, rightLong: true },
    none: { rightPage: 0, bottomOverride: 0, rightLong: true },
    restored: { rightPage: 1, rightLong: true, pageInput: "保留的输入", focusTarget: "page-input" },
  }),
  scene("S15", "侧栏收起与恢复", {
    left: { leftOpen: false }, right: { rightOpen: false, leftOpen: true },
    both: { leftOpen: false, rightOpen: false }, restored: { leftOpen: true, rightPage: 1, leftWidth: 280, rightWidth: 340 },
  }),
  scene("S16", "页签溢出与空态", {
    overflow: { extraPages: 24, pageCount: 28 }, empty: { pageCount: 0, rightOpen: false },
  }),
  scene("S17", "下侧栏", {
    collapsed: {}, expanded: { voiceOpen: true },
    minimum: { voiceOpen: true, voiceHeight: 80 },
    maximum: { voiceOpen: true, voiceHeight: 320 },
  }),
  scene("S18", "最小窗口极限", {
    horizontal: { leftOpen: true, rightPage: 0, leftWidth: 360, rightWidth: 356 },
    vertical: { topContributed: true, topOpen: true, voiceOpen: true, voiceHeight: 290 },
    focus: { leftOpen: true, rightPage: 0, focusTarget: "grip-left" },
  }),
  scene("S19", "上侧更多", { overflow: { topContributed: true, topOpen: true, topOverflow: true } }),
  scene("S20", "合并栏槽位", {
    left: { slotOverflow: "left" }, center: { slotOverflow: "center" },
    right: { slotOverflow: "right" }, empty: { emptySlots: true },
  }),
  scene("S21", "模块库", {
    enabled: { layer: { type: "library" } },
    disabled: { layer: { type: "library" }, unavailable: ["E"] },
    search: { layer: { type: "library" }, libraryQuery: "模块 B" },
    empty: { layer: { type: "library" }, libraryQuery: "没有结果" },
    long: { layer: { type: "library" }, libraryLong: true, extraModules: 24 },
  }),
  scene("S22", "上下文层", {
    menu: { layer: { type: "menu", menu: "文件" } },
    context: { layer: { type: "context" } },
    selection: { paperOverlay: true, layer: { type: "selection" } },
  }),
  scene("S23", "面板层", {
    command: { layer: { type: "commands" } }, search: { layer: { type: "search" } },
  }),
  scene("S24", "提示层", {
    name: { focusTarget: "page-tab-3" }, shortcut: { layer: { type: "tooltip", text: "打开…", shortcut: "Ctrl+O" } },
    disabled: { unavailable: ["E"], layer: { type: "tooltip", text: "模块 E · 暂时不可用" } },
  }),
  scene("S25", "通知层", {
    saved: { notice: "已保存" }, progress: { notice: "进度 · 50%" },
    recovery: { notice: "布局配置无法读取，已恢复默认布局" },
    error: { notice: "保存失败，请稍后重试", save: "failed" },
  }),
  scene("S26", "模态层", {
    cancellable: { modal: { type: "delete", cancellable: true }, custom: true, preset: "我的排版" },
    blocking: { modal: { type: "message", cancellable: false } },
  }),
  scene("S27", "浮层边缘与层级", {
    topLeft: { layer: { type: "context", edge: "topLeft" } },
    topRight: { layer: { type: "context", edge: "topRight" } },
    bottomLeft: { layer: { type: "context", edge: "bottomLeft" } },
    bottomRight: { layer: { type: "context", edge: "bottomRight" } },
    stacked: { editing: true, layer: { type: "library" }, notice: "已恢复默认布局" },
  }),
  scene("S28", "内置预设", {
    write: { preset: "写谱" },
    layout: { preset: "排版", enabled: ["A", "D", "B", "C"] },
    practice: { preset: "练习", ...PRESETS["练习"] },
    modified: { modified: true, layer: { type: "presets" } }, restored: { notice: "已恢复默认布局" },
  }),
  scene("S29", "自定义预设", {
    save: { modal: { type: "save", cancellable: true } },
    rename: { preset: "我的排版", custom: true, modal: { type: "rename", cancellable: true } },
    delete: { preset: "我的排版", custom: true, modal: { type: "delete", cancellable: true } },
  }),
  scene("S30", "贡献隐藏与恢复", {
    unknown: { unknown: true, enabled: ["A", "missing-plugin:module", "B", "C"] },
    disabled: { enabled: ["A", "B", "E"], unavailable: ["E"] },
    hidden: { leftOpen: false, enabled: ["A", "B", "C"] },
    restored: { enabled: ["A", "B", "C"], modified: true },
  }),
  scene("S31", "键盘与控件状态", {
    focus: { focusTarget: "region-left" },
    disabled: { showModuleCatalog: true, unavailable: ["E"], focusTarget: "region-top" },
    pressed: { topContributed: true, topOpen: true, assembly: true, focusTarget: "region-top" },
  }),
  scene("S32", "缩放与像素密度", { default: {} }),
];

export function fixtureFor(id = "S01", variant) {
  const entry = SCENARIOS.find((item) => item.id === id) ?? SCENARIOS[0];
  const name = Object.hasOwn(entry.variants, variant) ? variant : Object.keys(entry.variants)[0];
  return { ...structuredClone(DEFAULTS), ...structuredClone(entry.variants[name]), scene: entry.id, variant: name };
}

export function rowsFor(state, modules = MODULES) {
  const rows = [];
  let half = [];
  for (const id of state.enabled) {
    const module = modules.find((entry) => entry.id === id);
    if (!module || state.unavailable.includes(id)) continue;
    const width = state.widths[id] ?? module.width;
    if (width === "full") {
      if (half.length) { rows.push(half); half = []; }
      rows.push([{ ...module, width }]);
    } else {
      half.push({ ...module, width });
      if (half.length === 2) { rows.push(half); half = []; }
    }
  }
  if (half.length) rows.push(half);
  return rows;
}
