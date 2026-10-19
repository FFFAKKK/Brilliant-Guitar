// Explicit, in-memory visual specimen. Does not register or schedule runtime plugins.
export const SLOT_NAMES = ["left", "center", "right"];
export const SLOT_METRICS = Object.freeze({ gap: 8, padding: 12, more: 32, mode: { left: 80, center: 112, right: 112 } });
export const SLOT_SAMPLES = ["normal", "empty", "dense", "unavailable", "long", "top-high", "top-limit", "voice-empty", "voice-long", "voice-fixed-high", "voice-unavailable", "editing"];

function contributions(area, dense, unavailable, long) {
  return SLOT_NAMES.flatMap((slot, index) => Array.from({ length: dense ? 5 : 1 }, (_, offset) => ({
    id: `${area}-${slot}-${offset + 1}`, area, slot,
    label: `${["A", "B", "C"][index]}${offset + 1}` + (long && offset === 0 ? " · 完整长名称中性贡献示例" : ""),
    minWidth: unavailable && offset === 0 ? 128 : offset === 0 ? 96 : offset === 1 ? 120 : 80,
    priority: offset === 0 ? 100 : offset === 1 ? 60 : 20,
    available: !(unavailable && (offset === 0 || offset === 4)), reason: unavailable && (offset === 0 || offset === 4) ? "来源暂未就绪" : "",
  })));
}
export function applyHorizontalSlots(state, params) {
  if (params.get("slotReview") !== "1") return false;
  const sample = SLOT_SAMPLES.includes(params.get("slotSample")) ? params.get("slotSample") : "normal";
  const dense = ["dense", "unavailable", "long", "editing"].includes(sample);
  state.horizontalSlots = {
    sample,
    top: sample === "empty" ? [] : contributions("top", dense, sample === "unavailable", sample === "long"),
    merge: sample === "empty" ? [] : contributions("merge", dense, sample === "unavailable", sample === "long"),
    voice: sample === "voice-empty" ? "empty" : sample === "voice-long" ? "long" : sample === "voice-fixed-high" ? "fixed-high" : sample === "voice-unavailable" ? "unavailable" : "normal",
    current: null, result: "", scroll: 0, fixedScroll: 0,
  };
  state.topOpen = true; state.leftOpen = true; state.rightOpen = true;
  state.voiceOpen = sample.startsWith("voice-");
  state.topHeight = sample === "top-high" ? 120 : sample === "top-limit" ? 320 : 80;
  state.voiceHeight = sample === "voice-fixed-high" ? 240 : 120;
  state.rightPage = 3; state.reviewLayout = true;
  state.emptySlots = true; state.topOverflow = false; state.slotOverflow = null;
  return true;
}

// Remove low priority first, then later equal-priority declarations. Never shrink a contribution.
// The cost callback includes protected mode UI and the more trigger once it is required.
function pack(items, budget, cost) {
  const visible = [...items], overflow = [];
  const removal = [...items].map((item, order) => ({ item, order })).sort((a, b) => a.item.priority - b.item.priority || b.order - a.order);
  while (visible.length && cost(visible, overflow.length > 0) > budget) {
    const item = removal.shift().item;
    visible.splice(visible.indexOf(item), 1); overflow.push(item);
  }
  const hidden = new Set(overflow.map(item => item.id));
  return { visible, overflow: items.filter(item => hidden.has(item.id)), used: cost(visible, overflow.length > 0), budget };
}
function widthOf(items, protectedWidth = 0) {
  const count = items.length + (protectedWidth ? 1 : 0);
  return protectedWidth + items.reduce((sum, item) => sum + item.minWidth, 0) + Math.max(0, count - 1) * SLOT_METRICS.gap;
}
export function topSlotCapacity(items, width, editing = false) {
  const budget = Math.max(0, width - SLOT_METRICS.padding * 2);
  const reserved = editing ? SLOT_METRICS.mode : { left: 0, center: 0, right: 0 };
  const slotCost = visible => SLOT_NAMES.map(slot => widthOf(visible.filter(item => item.slot === slot), reserved[slot]));
  const result = pack(items, budget, (visible, more) => slotCost(visible).reduce((sum, size) => sum + size, 0) + SLOT_METRICS.gap * 2 + (more ? SLOT_METRICS.more + SLOT_METRICS.gap : 0));
  const minimums = slotCost(result.visible), free = Math.max(0, budget - result.used) / 3;
  return { ...result, slots: SLOT_NAMES.map((slot, index) => ({ slot, width: minimums[index] + free, items: result.visible.filter(item => item.slot === slot) })), protected: reserved };
}
export function mergeSlotCapacity(items, width) {
  return SLOT_NAMES.map(slot => {
    const entries = items.filter(item => item.slot === slot), budget = Math.max(0, width / 3 - SLOT_METRICS.padding * 2);
    return { slot, ...pack(entries, budget, (visible, more) => widthOf(visible) + (more ? SLOT_METRICS.more + (visible.length ? SLOT_METRICS.gap : 0) : 0)) };
  });
}
export function slotCapacity(state, width) {
  const sample = state.horizontalSlots;
  return { top: topSlotCapacity(sample.top, width, !!state.assembly), merge: mergeSlotCapacity(sample.merge, width) };
}
export function activateSlotContribution(state, id) {
  const sample = state.horizontalSlots;
  if (!sample) return false;
  const item = [...sample.top, ...sample.merge].find(entry => entry.id === id);
  if (!item?.available) return false;
  sample.current = item.id;
  sample.result = `${item.label} · 已触发中性示例，承载位置与配置保持`;
  return true;
}
