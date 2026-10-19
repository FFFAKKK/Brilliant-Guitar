import { h } from "../shell/dom.js";
import { SLOT_NAMES, slotCapacity } from "./horizontal-slots-state.js";

const names = { left: "左槽", center: "中槽", right: "右槽" };
const relations = { left: "播放器承载槽", center: "节拍器与速度承载槽", right: "谱面信息承载槽" };
export function createHorizontalSlotsView({ state, button, wordButton, grip }) {
  const sample = state.horizontalSlots;
  const span = (value, className) => h("span", { class: className }, value);
  function contribution(item, inMore = false) {
    const node = wordButton(item.label + (item.available ? "" : " · 不可用"), "slot-activate", item.id, {
      id: (inMore ? "slot-menu-" : "slot-item-") + item.id,
      class: inMore ? "hs-menu-item" : "hs-contribution", disabled: !item.available, pressed: sample.current === item.id,
    });
    node.dataset.contribution = item.id; node.dataset.area = item.area; node.dataset.slot = item.slot;
    node.dataset.minWidth = item.minWidth; node.dataset.priority = item.priority;
    node.title = `${item.label} · ${names[item.slot]} · 最小${item.minWidth}px · 优先级${item.priority}` + (item.reason ? ` · ${item.reason}` : "");
    if (inMore) {
      node.setAttribute("role", "menuitem");
      node.append(h("small", {}, `${names[item.slot]} · ${item.minWidth}px` + (item.reason ? ` · ${item.reason}` : "")));
    } else node.style.width = item.minWidth + "px";
    return node;
  }
  function more(value, count) {
    const node = button(value === "top" ? `上侧栏更多 · ${count}项` : `${relations[value]}更多 · ${count}项`, "more", "more", value, {
      id: "more-" + value, class: "hs-more", expanded: state.layer?.type === "more" && state.layer.slot === value,
    });
    node.setAttribute("aria-haspopup", "menu"); node.dataset.count = count;
    return node;
  }
  function fillTop(track) {
    const capacity = slotCapacity(state, innerWidth).top;
    const protectedUi = {
      left: span("内容编辑", "v-mode-name hs-mode-name"),
      center: span("", "v-mode-detail hs-mode-detail"),
      right: h("div", { class: "v-mode-actions hs-mode-actions" },
        wordButton("取消", "assembly-cancel", null, { id: "assembly-cancel", ariaLabel: "取消内容编辑" }),
        wordButton("确认", "assembly-done", null, { id: "assembly-done", ariaLabel: "确认内容编辑", class: "primary" })),
    };
    track.style.gridTemplateColumns = capacity.slots.map(entry => entry.width + "px").join(" ") + (capacity.overflow.length ? " 32px" : "");
    track.dataset.overflow = String(capacity.overflow.length);
    track.replaceChildren(...capacity.slots.map(entry => h("div", { class: "v-slot hs-slot", dataset: { slot: entry.slot }, "aria-label": "上侧栏" + names[entry.slot] },
      state.assembly && entry.slot !== "right" ? protectedUi[entry.slot] : null, ...entry.items.map(item => contribution(item)),
      state.assembly && entry.slot === "right" ? protectedUi.right : null)),
      ...(capacity.overflow.length ? [more("top", capacity.overflow.length)] : []));
  }
  function top() {
    const track = h("div", { class: "hs-top-track" }); fillTop(track);
    return h("section", { class: "v-top", "aria-label": "上侧栏", hidden: !state.topOpen }, track, grip("top"));
  }
  function fillMerge(merge) {
    merge.replaceChildren(...slotCapacity(state, innerWidth).merge.map(entry => h("div", { class: "v-slot hs-slot", "aria-label": relations[entry.slot], dataset: { slot: entry.slot, overflow: entry.overflow.length } },
      ...entry.visible.map(item => contribution(item)), entry.overflow.length ? more(entry.slot, entry.overflow.length) : null)));
  }
  function voice() {
    const long = sample.voice === "long" || sample.voice === "fixed-high";
    const scroller = h("div", { class: "hs-voice-scroll", id: "slot-voice-scroll", tabindex: "0", "aria-label": "下侧栏内容浏览", onscroll: event => { sample.scroll = event.currentTarget.scrollTop; } });
    if (sample.voice === "empty") scroller.append(h("p", { class: "hs-empty" }, "下侧栏暂无贡献"));
    else if (sample.voice === "unavailable") scroller.append(h("p", { class: "hs-empty" }, "内容暂不可用"), h("p", { class: "hs-note" }, "来源暂未就绪 · 容器与高度保留"));
    else scroller.append(...Array.from({ length: long ? 24 : 2 }, (_, index) => h("div", { class: "hs-voice-row" }, span("承载行 " + String(index + 1).padStart(2, "0")), span(index === (long ? 23 : 1) ? "内容末尾" : "中性尺寸示例", "hs-note"))));
    const fixed = h("div", { class: "hs-voice-fixed", id: "slot-voice-fixed", tabindex: "0", "aria-label": "下侧栏固定区", onscroll: event => { sample.fixedScroll = event.currentTarget.scrollTop; } },
      h("p", {}, "容器固定区"), ...(sample.voice === "fixed-high" ? Array.from({ length: 8 }, (_, index) => h("p", { class: "hs-note" }, "固定承载 " + (index + 1) + (index === 7 ? " · 固定区末尾" : ""))) : []));
    return h("section", { class: "v-voice-content hs-voice", "aria-label": "下侧栏", dataset: { state: sample.voice }, hidden: !state.voiceOpen }, scroller, fixed);
  }
  function merge() { const node = h("div", { class: "v-merge", "aria-label": "合并栏" }); fillMerge(node); return node; }
  function menu(which) {
    const capacity = slotCapacity(state, innerWidth);
    const items = which === "top" ? capacity.top.overflow : capacity.merge.find(entry => entry.slot === which)?.overflow ?? [];
    return [h("div", { class: "v-menu-caption" }, (which === "top" ? "上侧栏更多" : relations[which]) + " · " + items.length + "项"),
      ...items.map(item => contribution(item, true)),
      h("p", { class: "hs-more-note" }, "窗口空间恢复后回到原槽位；此处操作不更改布局。")];
  }
  function sync(root) {
    const track = root.querySelector(".hs-top-track"), merge = root.querySelector(".v-merge");
    const focusId = document.activeElement?.id;
    if (track) fillTop(track);
    if (merge) fillMerge(merge);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function restore(root) {
    const scroller = root.querySelector("#slot-voice-scroll"), fixed = root.querySelector("#slot-voice-fixed");
    if (scroller) scroller.scrollTop = sample.scroll;
    if (fixed) fixed.scrollTop = sample.fixedScroll;
  }
  return { top, voice, merge, menu, sync, restore };
}
