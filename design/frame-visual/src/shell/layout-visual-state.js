import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_COMPACT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_MAXIMUMS, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";

export const LAYOUT_REGIONS = Object.freeze([
  { side: "top", key: "topOpen", name: "上侧栏", label: "上侧栏", glyph: "top" },
  { side: "left", key: "leftOpen", name: "左侧栏", label: "左侧栏", glyph: "left" },
  { side: "right", key: "rightOpen", name: "右侧栏", label: "右侧栏", glyph: "right" },
  { side: "voice", key: "voiceOpen", name: "下侧栏", label: "下侧栏", glyph: "bottom" },
]);
export const LAYOUT_DIMENSIONS = Object.freeze([
  { side: "left", label: "左侧栏宽度", other: "右侧栏" },
  { side: "right", label: "右侧栏宽度", other: "左侧栏" },
  { side: "top", label: "上侧栏高度", other: "下侧栏" },
  { side: "voice", label: "下侧栏高度", other: "上侧栏" },
]);
const labels = { balanced: "均衡", compact: "紧凑", tabs: "页签", list: "列表", grid: "网格", mixed: "分区混用" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A forecast only: controls continue to show the accepted host snapshot.
// Product limits encode the axis capacity with the peer at its minimum;
// valueLimits use its current size and must not constrain a paired preset.
export function layoutArrangementPreview(state, mode) {
  const sizes = mode === "compact" ? WORKSPACE_COMPACT_SIZES : WORKSPACE_DEFAULT_SIZES;
  const result = { ...state, arrangement: mode };
  for (const pair of [["left", "right"], ["top", "voice"]]) {
    const [a, b] = pair;
    const limits = state.limits ?? WORKSPACE_MAXIMUMS;
    const capacity = Math.min(limits[a] + WORKSPACE_MINIMUMS[b], limits[b] + WORKSPACE_MINIMUMS[a]);
    const value = Math.floor(Math.min(sizes[a], limits[a], limits[b], capacity / 2));
    for (const side of pair) result[WORKSPACE_SIZE_KEYS[side]] = Math.max(WORKSPACE_MINIMUMS[side], value);
  }
  return result;
}

// Display-only projections. They never mutate the host's layout.
export function layoutChanges(state, before) {
  if (!before) return [];
  const changes = [];
  const add = (key, label, format = value => labels[value] ?? value) => {
    if (same(state[key], before[key])) return;
    changes.push({ key, label, text: label + "：" + format(before[key]) + " → " + format(state[key]) });
  };
  add("presentation", "页面呈现");
  if (!same(state.enabled, before.enabled)) {
    const previous = before.enabled?.length ?? 0, next = state.enabled?.length ?? 0;
    changes.push({ key: "enabled", label: "内容清单", text: previous === next ? "内容顺序已调整" : "内容清单：" + previous + " 项 → " + next + " 项" });
  }
  for (const [key, label] of [["widths", "内容占宽"], ["iconOrder", "图标顺序"], ["hiddenIcons", "图标显隐"]]) {
    if (!same(state[key], before[key])) changes.push({ key, label, text: label + "已调整" });
  }
  if (state.preset !== before.preset || state.custom !== before.custom) changes.push({ key: "preset", label: "布局方案", text: "布局方案：" + before.preset + " → " + state.preset });
  return changes;
}

export function layoutDimension(state, side) {
  const definition = LAYOUT_DIMENSIONS.find(item => item.side === side);
  const axis = side === "left" || side === "right" ? ["left", "right"] : ["top", "voice"];
  // The range must end at the value that the host can actually accept. A
  // shared visual scale with a larger peer maximum creates a dead zone where
  // the thumb appears draggable but every value is clamped back.
  const minimum = WORKSPACE_MINIMUMS[side];
  const trackMinimum = Math.min(...axis.map(item => WORKSPACE_MINIMUMS[item]));
  const maximum = Number((state.valueLimits ?? state.limits)[side]);
  const trackMaximum = maximum;
  const value = state[WORKSPACE_SIZE_KEYS[side]], normal = WORKSPACE_DEFAULT_SIZES[side];
  const restore = Math.max(minimum, Math.min(normal, maximum));
  const boundary = maximum === minimum ? "fixed" : value === maximum ? "max" : value === minimum ? "min" : "available";
  const reason = maximum === minimum ? "当前窗口与" + definition.other + "已占满可调空间。"
    : maximum < WORKSPACE_MAXIMUMS[side] ? "上限由当前窗口和" + definition.other + "共同限制。"
      : "已保留工作台空间；设定上限为 " + maximum + " px。";
  return { value, minimum, trackMinimum, maximum, trackMaximum, restore, boundary, reason,
    range: minimum === maximum ? minimum + " px · 暂无调整空间" : minimum + "–" + maximum + " px" + (boundary === "max" ? " · 已达上限" : boundary === "min" ? " · 已达下限" : ""),
    restoreLabel: "恢复" + definition.label + "：默认 " + normal + " px" + (restore !== normal ? "，当前容量为 " + restore + " px" : ""),
  };
}
