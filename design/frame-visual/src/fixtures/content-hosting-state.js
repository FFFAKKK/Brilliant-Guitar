/* Explicit, neutral visual fixture. Does not register plugins, persist or manage live instances. */
import { WORKSPACE_MINIMUMS } from "../workspace-geometry.js";
export const HOSTING_MODES = { tabs: "页签", list: "列表", grid: "网格", mixed: "分区混用" };
export const HOSTING_CONTENT = Object.freeze([
  { id: "A", width: "full", supports: ["full"], height: 128, minimum: 120 },
  { id: "B", width: "half", supports: ["full", "half"], height: 96, minimum: 92 },
  { id: "C", width: "half", supports: ["full", "half"], height: 160, minimum: 96 },
  { id: "D", width: "full", supports: ["full"], height: 96, minimum: 120, allowed: ["left"], fixed: true },
  { id: "E", width: "half", supports: ["half"], height: 96, minimum: 92 },
  { id: "F", width: "full", supports: ["full"], height: 128, minimum: 120, section: "tabs" },
  { id: "G", width: "half", supports: ["full", "half"], height: 112, minimum: 96, section: "grid" },
  { id: "H", width: "full", supports: ["full"], height: 96, minimum: 120, section: "list" },
  { id: "I", name: "内容 I · 用于检查完整长名称与阅读位置的中性承载示例", width: "full", supports: ["full"], height: 96, minimum: 120, long: true },
  { id: "J", width: "full", supports: ["full"], height: 96, minimum: 120, status: "missing" },
  { id: "K", width: "full", supports: ["full"], height: 96, minimum: 120, status: "unavailable" },
].map(item => ({ name: "内容 " + item.id, source: "承载样稿", icon: "grid", allowed: ["left", "right"], status: "ready", section: "grid", ...item })));
export const HOSTING_MUTATIONS = new Set(["hosting-mode", "hosting-select", "hosting-move", "hosting-toggle", "hosting-icon", "hosting-icon-order", "hosting-order", "hosting-width", "hosting-drop"]);
export function hostingItem(id) { return HOSTING_CONTENT.find(item => item.id === id); }
export function hostingPages(state, side) { return state.contentHosting.pages.filter(page => !side || page.side === side); }
export function hostingPage(state, id = state.hostingMemory.target) { return hostingPages(state).find(page => page.id === id); }
export function hostingLocation(state, id) { return hostingPages(state).find(page => page.items.includes(id)); }
export function hostingCurrent(state, side) { return hostingPage(state, state.hostingMemory.current[side]) ?? hostingPages(state, side)[0]; }
export function hostingSections(page) {
  if (page.mode !== "mixed") return [{ id: "content", mode: page.mode, items: page.items }];
  return ["tabs", "grid", "list"].map(mode => ({ id: mode, mode, items: page.items.filter(id => hostingItem(id).section === mode) }));
}
export function hostingOrder(page, id) { return hostingSections(page).find(section => section.items.includes(id))?.items ?? []; }
export function hostingHalfSpace(state, page, item) {
  const available = Math.max(0, (state[page.side + "Width"] - 24 - 8) / 2);
  return { available, allowed: available >= item.minimum, minimum: item.minimum };
}
export function hostingReason(state, id, targetId) {
  const item = hostingItem(id), target = hostingPage(state, targetId), current = hostingLocation(state, id);
  if (!item || !target) return "页面或内容不存在";
  if (item.status === "missing") return "插件缺失，保留位置；恢复注册由工程处理";
  if (item.status === "unavailable") return "来源暂未就绪，稍后重试";
  if (current?.id === target.id) return "已经在此页面";
  if (item.fixed && current) return "固定内容不能移出所属页面";
  if (!item.allowed.includes(target.side)) return "仅允许左侧栏";
  if ((target.mode === "grid" || target.mode === "mixed" && item.section === "grid") && item.supports.length === 1 && item.width === "half" && !hostingHalfSpace(state, target, item).allowed) return "半行小于内容声明的最小宽度";
  return "";
}
export function applyContentHosting(state, params) {
  if (!params.has("contentReview")) return false;
  state.contentHosting = { pages: [
    { id: "left-1", side: "left", name: "页面一", mode: "grid", items: ["A", "B", "C"], fixed: 56 },
    { id: "left-2", side: "left", name: "页面二", mode: "tabs", items: ["D", "E"], fixed: 56 },
    { id: "right-1", side: "right", name: "页面三", mode: "mixed", items: ["F", "G", "H"], fixed: 56 },
    { id: "right-2", side: "right", name: "页面四 · 长标题与缺失来源", mode: "list", items: ["I", "J"], fixed: 56 },
  ], widths: {}, hidden: [], iconOrder: HOSTING_CONTENT.map(item => item.id) };
  state.hostingMemory = { current: { left: "left-1", right: "right-1" }, target: "left-1", active: {}, inputs: {}, choices: {}, expanded: {}, scroll: {}, footer: {}, selected: null, destination: "right-1", result: "", dragging: null, libraryQuery: "" };
  state.leftOpen = state.rightOpen = true; state.rightPage = 3; state.reviewLayout = false;
  const sample = params.get("hostingSample"); state.hostingSample = sample ?? "normal";
  if (sample === "empty") state.contentHosting.pages[0].items = [];
  if (sample === "hidden") state.contentHosting.hidden = HOSTING_CONTENT.map(item => item.id);
  if (sample === "single") state.contentHosting.pages = [state.contentHosting.pages[1], state.contentHosting.pages[2]];
  if (sample === "single") { state.contentHosting.pages[0].items = ["D"]; state.hostingMemory.current.left = state.hostingMemory.target = "left-2"; }
  if (["long", "missing", "unavailable", "no-results"].includes(sample)) { state.hostingMemory.current.right = state.hostingMemory.target = "right-2"; }
  if (sample === "missing") state.hostingMemory.expanded.I = false;
  if (sample === "unavailable") state.contentHosting.pages[3].items = ["K"];
  if (sample === "fixed-high") state.contentHosting.pages[0].fixed = 360;
  if (sample === "half-limit") { state.leftWidth = WORKSPACE_MINIMUMS.left; state.contentHosting.pages[1].items = ["D"]; state.contentHosting.pages[0].items = ["E", "A"]; }
  if (sample === "no-results") { state.layer = { type: "library" }; state.libraryQuery = "没有匹配的内容"; }
  return true;
}
export function hostingChanges(state, before) {
  if (!before?.contentHosting) return [];
  const previous = before.contentHosting, current = state.contentHosting;
  const changes = [];
  for (const page of current.pages) {
    const old = previous.pages.find(entry => entry.id === page.id);
    if (page.mode !== old.mode) changes.push({ text: page.name + "：" + HOSTING_MODES[old.mode] + " → " + HOSTING_MODES[page.mode] });
    if (JSON.stringify(page.items) !== JSON.stringify(old.items)) changes.push({ text: (page.side === "left" ? "左栏" : "右栏") + " · " + page.name + "内容或顺序已调整" });
  }
  for (const [key, name] of [["widths", "内容占宽"], ["hidden", "图标显隐"], ["iconOrder", "图标顺序"]]) if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) changes.push({ text: name + "已调整" });
  return changes;
}
export function runHostingAction(state, action, value) {
  if (!state.contentHosting || !action?.startsWith("hosting-")) return false;
  if (HOSTING_MUTATIONS.has(action) && state.assembly !== true) return true;
  const memory = state.hostingMemory, config = state.contentHosting;
  const page = hostingPage(state), id = typeof value === "string" ? value : value?.id;
  const item = hostingItem(id), location = hostingLocation(state, id);
  const message = text => { memory.result = text; };
  switch (action) {
    case "hosting-page": {
      const next = hostingPage(state, value); if (!next) break;
      memory.current[next.side] = next.id; memory.target = next.id; state[next.side + "Open"] = true;
      if (next.side === "right") state.reviewLayout = false;
      break;
    }
    case "hosting-focus":
      if (!location) break;
      memory.current[location.side] = memory.target = location.id; memory.active[location.id] = id;
      state[location.side + "Open"] = true; if (location.side === "right") state.reviewLayout = false;
      break;
    case "hosting-target": if (hostingPage(state, value)) memory.target = value; break;
    case "hosting-select":
      if (!id) { memory.selected = null; memory.result = ""; break; }
      if (location) { memory.selected = id; memory.target = location.id; memory.destination = hostingPages(state).find(target => !hostingReason(state, id, target.id))?.id ?? location.id; memory.result = ""; } break;
    case "hosting-destination": if (hostingPage(state, value)) memory.destination = value; break;
    case "hosting-mode": if (page && Object.hasOwn(HOSTING_MODES, value)) { page.mode = value; message(page.name + "改为" + HOSTING_MODES[value] + "；其他页面保持各自设置。"); } break;
    case "hosting-move": {
      const selected = hostingItem(memory.selected), current = hostingLocation(state, memory.selected), target = hostingPage(state, memory.destination);
      const reason = hostingReason(state, memory.selected, memory.destination);
      if (reason || !current) { message(reason || "请先选择已加入的内容"); break; }
      current.items = current.items.filter(entry => entry !== selected.id); target.items.push(selected.id);
      memory.target = target.id; memory.current[target.side] = target.id; memory.active[target.id] = selected.id;
      message(selected.name + "已移动到" + (target.side === "left" ? "左栏" : "右栏") + " · " + target.name + "；确认保留，取消撤回。");
      break;
    }
    case "hosting-toggle":
      if (!item || !page) break;
      if (location) {
        if (item.fixed || item.status !== "ready") { message(item.fixed ? "固定内容不可移出" : "来源不可用，保留位置"); break; }
        location.items = location.items.filter(entry => entry !== id); message(item.name + "已移出；输入仍保留。");
      } else {
        const reason = hostingReason(state, id, page.id);
        if (reason) { message(reason); break; } page.items.push(id); message(item.name + "已加入" + page.name + "。");
      }
      break;
    case "hosting-icon": if (item) config.hidden = config.hidden.includes(id) ? config.hidden.filter(entry => entry !== id) : [...config.hidden, id]; break;
    case "hosting-icon-order": {
      if (!item || !location) break;
      const visibleOrder = config.iconOrder.filter(entry => hostingLocation(state, entry)?.side === location.side);
      const position = visibleOrder.indexOf(id), to = position + value.delta;
      if (to < 0 || to >= visibleOrder.length) break;
      const a = config.iconOrder.indexOf(id), b = config.iconOrder.indexOf(visibleOrder[to]);
      [config.iconOrder[a], config.iconOrder[b]] = [config.iconOrder[b], config.iconOrder[a]]; break;
    }
    case "hosting-order": {
      if (!location) break;
      const order = hostingOrder(location, id), from = order.indexOf(id), to = from + value.delta;
      if (to < 0 || to >= order.length) break;
      const a = location.items.indexOf(id), b = location.items.indexOf(order[to]);
      [location.items[a], location.items[b]] = [location.items[b], location.items[a]]; break;
    }
    case "hosting-width": {
      if (!item || !location || !hostingSections(location).some(section => section.mode === "grid" && section.items.includes(id))) break;
      const width = config.widths[id] ?? item.width, next = width === "full" ? "half" : "full";
      if (!item.supports.includes(next)) break;
      if (next === "half" && !hostingHalfSpace(state, location, item).allowed) { message("半行小于内容声明的最小宽度"); break; }
      config.widths[id] = next; break;
    }
    case "hosting-drag": if (state.assembly === true && location) memory.dragging = id; break;
    case "hosting-drag-end": memory.dragging = null; break;
    case "hosting-drop": {
      const from = memory.dragging, source = hostingLocation(state, from), destination = hostingLocation(state, id);
      const section = source && hostingSections(source).find(entry => entry.mode === "grid" && entry.items.includes(from));
      if (!section || source.id !== destination?.id || !section.items.includes(id) || from === id) {
        message("此落点无效；请在所属网格区内排序，跨区域使用布局组件。");
        state.notice = memory.result;
      }
      else { const a = source.items.indexOf(from), b = source.items.indexOf(id); source.items.splice(a, 1); source.items.splice(b, 0, from); message("网格顺序已调整；其他分区保持原位。"); }
      memory.dragging = null; break;
    }
    default: return false;
  }
  return true;
}
