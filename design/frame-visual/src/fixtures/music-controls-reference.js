import { h } from "../shell/dom.js";
import { icon } from "./preview-icons.js";

const svg = name => { const node = h("span", { class: "mc-icon", "aria-hidden": "true" }); node.innerHTML = icon(name, 18); return node; };
const status = h("div", { class: "mc-status", role: "status", "aria-live": "polite" }, "拖动滑条，或聚焦后用左右方向键调整。");
const setStatus = text => { status.textContent = text; };

function beatStrip(enabled) {
  const group = h("div", { class: "mc-group", "data-enabled": String(enabled) });
  const beats = h("div", { class: "mc-beats", role: "img", "aria-label": enabled ? "节拍器已启用，四拍一小节" : "节拍器未启用，四拍一小节" },
    ...Array.from({ length: 4 }, () => h("i", { class: "mc-beat" })));
  group.append(beats); return group;
}

function countMark(enabled) {
  const mark = h("div", { class: "mc-count-mark", "data-enabled": String(enabled) });
  const number = h("input", { class: "mc-count-number", type: "number", min: 1, max: 4, step: 1, value: 1, "aria-label": "预备小节数", oninput: event => setStatus("预备小节 · " + event.currentTarget.value + " 小节") });
  const measures = h("svg", { class: "mc-measures", viewBox: "0 0 28 10", "aria-hidden": "true" },
    h("path", { d: "M1 1v8M8 1v8M15 1v8M22 1v8M27 1v8M1 2h26M1 8h26" }));
  mark.append(number, measures); return mark;
}

function condition({ label, glyph, initial, detail }) {
  const group = h("div", { class: "mc-group" });
  const button = h("button", { type: "button", class: "mc-tool", "aria-label": label, "aria-pressed": String(initial), onclick() {
    const next = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(next));
    group.dataset.enabled = String(next);
    setStatus(label + " · " + (next ? "已启用" : "已关闭"));
  } }, svg(glyph));
  group.append(button, detail); group.dataset.enabled = String(initial); return group;
}

function rangeSpecimen(initial = 75) {
  const range = h("input", { class: "mc-range", type: "range", min: 0, max: 100, step: 1, value: initial, "aria-label": "总音量" });
  const fill = h("span", { class: "mc-range-fill" });
  const value = h("span", { class: "mc-range-value" });
  const sync = () => { const n = Number(range.value); fill.style.width = n + "%"; value.textContent = n + "%"; setStatus("总音量 · " + n + "%"); };
  range.addEventListener("input", sync); sync();
  return h("div", { class: "mc-range-row" }, h("span", { class: "mc-range-label" }, "总音量"), h("span", { class: "mc-range-wrap" }, h("span", { class: "mc-range-track" }, fill), range), value);
}

function oldControls({ active = false } = {}) {
  return h("div", { class: "mc-row" },
    condition({ label: "节拍器", glyph: "metronome", initial: active, detail: beatStrip(active) }),
    condition({ label: "预备拍", glyph: "timerReset", initial: active, detail: countMark(active) }));
}

const oldCard = h("section", { class: "music-reference-card" },
  h("h2", {}, "之前的控件视觉"),
  oldControls({ active: false }),
  h("p", {}, "关闭态：按钮本体透明，图形使用灰色。"),
  h("div", { style: { height: "12px" } }),
  oldControls({ active: true }),
  h("p", {}, "开启态：独立蓝色底座 + 浅色图形，不使用白色描边。"),
  rangeSpecimen());

const layoutButtons = ["top", "left", "right", "bottom"].map((name, index) => {
  const button = h("button", { type: "button", class: "mc-tool", "aria-label": name, "aria-pressed": String(index === 1), onclick() {
    const active = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(active)); setStatus("布局区域 · " + name + " · " + (active ? "选中" : "未选中"));
  } }, svg(name));
  return button;
});
const layoutCard = h("section", { class: "music-reference-card" },
  h("h2", {}, "当前布局组件应采用的关系"),
  h("div", { class: "mc-layout-sample" },
    h("div", { class: "mc-tool-row", role: "group", "aria-label": "布局区域" }, ...layoutButtons),
    rangeSpecimen(52)),
  h("p", {}, "布局组件只借用选中底座和滑条比例；图标、名称与业务由组件自己提供。"));

document.querySelector("#app").append(
  h("main", { class: "music-reference" },
    h("header", { class: "music-reference-header" },
      h("h1", {}, "旧控件视觉参考"),
      h("p", {}, "节拍器 · 预备拍 · 滑条"),
      h("a", { href: "layout-collaboration-review.html?fixture=layout-pilot" }, "返回布局组件")),
    h("div", { class: "music-reference-grid" }, oldCard, layoutCard), status));
