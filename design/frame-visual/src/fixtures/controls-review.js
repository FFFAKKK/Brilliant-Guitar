// Neutral visual review only. No plugin registration, persistence or business UI.
import { h } from "../shell/dom.js";
import { graphic, visualButton } from "../shell/visual-controls.js";
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_MAXIMUMS, WORKSPACE_MINIMUMS } from "../workspace-geometry.js";

const status = h("div", { class: "fc-foot", role: "status", "aria-live": "polite", id: "controls-status" }, "可直接操作控件；Tab查看键盘焦点，按住按钮查看按下状态。");
const report = message => { status.textContent = message; };
const help = (text, props = {}) => h("p", { class: "fc-help", ...props }, text);
const group = (...children) => h("div", { class: "fc-group" }, ...children);
const specimen = (caption, ...children) => h("div", { class: "fc-specimen" }, h("span", { class: "fc-caption" }, caption), ...children);
const section = (title, ...children) => h("section", { class: "fc-section" }, h("h2", {}, title), ...children);
const button = (label, props = {}, glyph = null) => visualButton(label, glyph, () => report(label + " · 已操作（内存审阅）"), { className: "fc-button", ...props });
const textField = (label, props = {}) => h("input", { class: "fc-field", "aria-label": label, oninput: event => report(label + " · " + event.currentTarget.value), ...props });
const labelled = (label, field, note) => h("label", { class: "fc-label" }, h("span", {}, label), field, note);

let searchIndex = 0;
function search(label, disabled = false) {
  const input = textField(label, { type: "search", placeholder: "搜索内容…", disabled, id: "search-" + (++searchIndex) });
  const clear = visualButton("清除" + label, "close", () => { input.value = ""; input.focus(); report(label + " · 已清除"); }, { disabled, className: "fc-button" });
  return h("label", { class: "v-search" }, graphic("search"), input, clear);
}

function choices(labels, name, initial = 0) {
  const elements = labels.map((label, index) => visualButton(label, null, () => {
    elements.forEach((node, i) => node.setAttribute("aria-pressed", String(i === index))); report(name + " · " + label);
  }, { className: "fc-button", "aria-pressed": String(index === initial) }));
  return h("div", { class: "fc-group", role: "group", "aria-label": name }, ...elements);
}

function toggle(label, enabled, disabled = false) {
  const element = h("button", { type: "button", class: "v-layout-control", "aria-label": label, "aria-pressed": String(enabled), disabled,
    onclick() { enabled = !enabled; element.setAttribute("aria-pressed", String(enabled)); report(label + (enabled ? " · 已展开" : " · 已收起")); } },
  graphic("left", 14), h("span", { class: "v-layout-control-label" }, label), h("span", { class: "v-switch", "aria-hidden": "true" }, h("i")));
  return element;
}

function numeric(label, props = {}) {
  const minimum = WORKSPACE_MINIMUMS.left, maximum = WORKSPACE_MAXIMUMS.left, fallback = WORKSPACE_DEFAULT_SIZES.left;
  const rangeText = minimum + "–" + maximum + " px";
  const id = "number-" + (props.id || "live"), note = help(rangeText + " · 输入后离开时按范围限制。", { id: id + "-help" });
  const input = h("input", { type: "number", min: minimum, max: maximum, step: 4, value: fallback, "aria-label": label, "aria-describedby": note.id, ...props, id,
    oninput() {
      const invalid = input.value === "" || !Number.isFinite(Number(input.value)) || Number(input.value) < minimum || Number(input.value) > maximum;
      input.setAttribute("aria-invalid", String(invalid)); note.dataset.tone = invalid ? "error" : "normal";
      note.textContent = invalid ? "请输入" + rangeText + "；离开后恢复合法尺寸。" : rangeText + " · 输入后离开时按范围限制。";
    },
    onblur() {
      if (input.readOnly || input.disabled) return;
      input.value = input.value === "" ? String(fallback) : String(Math.max(minimum, Math.min(maximum, Number(input.value) || fallback)));
      input.setAttribute("aria-invalid", "false"); note.dataset.tone = "normal"; note.textContent = rangeText + " · 已保留合法尺寸。";
      report(label + " · " + input.value + " px");
    },
  });
  if (props["aria-invalid"] === "true") { note.dataset.tone = "error"; note.textContent = "请输入" + rangeText + "；离开后恢复合法尺寸。"; }
  return group(h("label", { class: "v-size-input" }, input, h("span", {}, "px")), note);
}

const actionPanel = h("div", { class: "fc-grid" },
  section("框架操作",
    specimen("常态 · 鼠标悬停 / 按住 / Tab", group(button("编辑内容", { id: "action-edit" }), button("确认", { className: "fc-button primary", id: "action-confirm" }), button("取消"))),
    specimen("真实禁用 · 不响应点击，不进入Tab", group(button("编辑中", { disabled: true, id: "action-disabled" }), button("确认", { disabled: true, className: "fc-button primary" })), help("进入内容编辑后，编辑入口由确认与取消接替。")),
    specimen("长名称 · 限定槽位宽度", button("另存为适用于排练工作区的布局方案", { title: "另存为适用于排练工作区的布局方案" }))),
  section("图标入口",
    specimen("28px操作热区 · 图形16px", group(button("恢复默认", { id: "icon-reset" }, "reset"), button("移到上方", {}, "up"), button("移到下方", {}, "down"))),
    specimen("导航选项 · 当前状态", choices(["布局", "内容"], "当前入口")),
    specimen("禁用操作 · 原位保留", group(button("不能继续上移", { disabled: true }, "up"), button("不可移出", { disabled: true }, "close")), help("禁用原因使用邻近说明；图标入口另有可访问名称。"))),
  section("反馈",
    specimen("信息 · 固定语义与位置", help("侧栏开关和尺寸随时可用。")),
    specimen("限制 · 直接说明处理办法", help("半行空间不足，请增加侧栏宽度或选择整行。", { dataset: { tone: "error" } })),
    specimen("提示静态样例 · 此处没有弹出行为", h("div", { class: "fc-hint" }, "恢复左侧栏宽度 · 默认260 px")),
    specimen("实时状态", help("底部状态行记录本页的实际操作。"))));

const inputPanel = h("div", { class: "fc-grid" },
  section("搜索与文字",
    specimen("搜索 · 清除按钮", search("搜索框架内容")),
    specimen("文字输入 · 28px", labelled("方案名称", textField("方案名称", { value: "我的工作区", id: "name-live", maxlength: 96 }))),
    specimen("长内容保留原值", labelled("完整名称", textField("完整名称", { value: "适用于多页内容和左右对称侧栏的工作区方案完整名称", id: "name-long" }), help("字段内可移动光标浏览，宿主宽度不随文字变化。")))),
  section("数值与范围",
    specimen("可编辑 · 原位焦点", numeric("侧栏宽度")),
    specimen("错误草稿 · 文字提醒", numeric("超限侧栏宽度", { id: "invalid", value: 999, "aria-invalid": "true" })),
    specimen("范围说明", help("现有工作区使用实际窗口容量。本页仅演示输入状态；不修改谱面或框架排布。"))),
  section("只读与禁用",
    specimen("只读 · 可聚焦、复制，不能修改", labelled("当前区域", textField("只读当前区域", { readonly: true, value: "右侧栏 · 工作区布局", id: "input-readonly" }))),
    specimen("禁用 · 不进入Tab", labelled("不可用方案", textField("禁用方案名称", { disabled: true, value: "尚未进入内容编辑", id: "input-disabled" }))),
    specimen("搜索禁用", search("禁用搜索", true))));

const select = h("select", { class: "v-layout-target", id: "select-content", "aria-label": "选择内容", onchange: event => report("选择内容 · " + event.currentTarget.value) },
  ...["当前页面", "长名称内容 · 排布和承载限制的完整说明", "其它页面"].map(value => h("option", { value }, value)));
let page = 1;
const pageCount = h("span", { class: "fc-count", id: "page-count", "aria-live": "polite" }, "1 / 3");
const previous = visualButton("上一页", "collapseLeft", () => turn(-1), { className: "fc-button", disabled: true, id: "page-previous" });
const next = visualButton("下一页", "collapseRight", () => turn(1), { className: "fc-button", id: "page-next" });
function turn(delta) { page = Math.max(1, Math.min(3, page + delta)); pageCount.textContent = page + " / 3"; previous.disabled = page === 1; next.disabled = page === 3; report("当前第" + page + "页"); }
const listRows = ["工作区布局", "名称很长的内容页面与组件说明", "暂无可用内容"].map((name, index) => h("button", {
  class: "fc-row", type: "button", disabled: index === 2, "aria-pressed": String(index === 0), title: name,
  onclick() { listRows.forEach(node => node.setAttribute("aria-pressed", String(node === this))); report("当前内容 · " + name); },
}, graphic("page"), h("span", { class: "fc-row-name" }, name), h("span", { class: "fc-count" }, index === 0 ? "3" : "")));
const selectionPanel = h("div", { class: "fc-grid" },
  section("区域开关", specimen("当前展开", toggle("左侧栏", true)), specimen("当前收起", toggle("右侧栏", false)), specimen("内容配置禁用例 · 工作区开关不受此限制", toggle("未进入内容编辑", false, true))),
  section("选项与内容", specimen("选项组 · 单项当前", choices(["页签", "列表", "网格"], "呈现方式")), specimen("下拉 · 原生键盘选择", select), specimen("内容行 · 长名称省略", ...listRows)),
  section("页面导航", specimen("翻页 · 端点禁用", group(previous, pageCount, next)), specimen("角标 · 文字数量", help("3个内容 · 数字仅表达数量，不定义业务状态。")), specimen("页签 · 页面顶部用于切换审阅组", help("选中底色与键盘蓝色焦点分开表达，方向键与Home/End切换本页页签。"))));

const host = h("div", { class: "fc-host", id: "sample-host" });
function hostSize(labels, key, initial) {
  const nodes = labels.map(value => visualButton(value + "px", null, () => {
    host.style.setProperty(key, value + "px"); nodes.forEach(node => node.setAttribute("aria-pressed", String(node === nodes[labels.indexOf(value)]))); report("承载样稿尺寸 · " + value + " px");
  }, { className: "fc-button", "aria-pressed": String(value === initial) }));
  return group(...nodes);
}
const privateRoot = document.createElement("div"); privateRoot.className = "probe-private"; privateRoot.id = "probe-private";
privateRoot.innerHTML = '<button type="button" class="probe-action" id="probe-action">私有操作</button><input class="probe-input" id="probe-input" aria-label="私有内容输入" value="独立的字形与配色"><p class="probe-status" id="probe-status">中性边界探针</p>';
privateRoot.querySelector("button").addEventListener("click", () => { privateRoot.querySelector("p").textContent = "私有操作已响应"; });
const entries = ["◇", "✦", "▥"].map((glyph, index) => {
  const node = visualButton("自有入口图形" + (index + 1), null, () => {
    entries.forEach(entry => entry.setAttribute("aria-pressed", String(entry === node))); report("当前自有入口图形" + (index + 1));
  }, { className: "fc-button fc-entry", "aria-pressed": String(index === 0), id: "custom-entry-" + index });
  node.firstChild.textContent = glyph; return node;
});
const band = label => h("div", { class: "fc-band", "aria-label": label }, h("span", { class: "fc-caption" }, label), button("内容", {}, "page"), button("布局设置"), button("更多", {}, "more"));
host.append(band("上侧栏承载"), h("div", { class: "fc-host-middle" },
  h("section", { class: "fc-sidebar", "aria-label": "窄侧栏承载" }, h("div", { class: "fc-sidebar-head" }, "内容页", h("span", { class: "fc-count" }, "3")),
    h("div", { class: "fc-entrances" }, ...entries), search("窄侧栏搜索"), select.cloneNode(true),
    specimen("同一框架控件", toggle("侧栏区域", true)), numeric("窄侧栏宽度", { id: "host" }),
    button("较长的框架操作名称完整提示", { title: "较长的框架操作名称完整提示" })),
  h("section", { class: "fc-private-wrap" }, h("h2", {}, "插件私有内容边界"), privateRoot,
    help("本区只是样式探针。框架只标记外层承载节点，私有控件不采用框架皮肤；图形槽位保留各入口的图形。"))), band("下侧栏承载"));
host.querySelector("select").id = "host-content-choice"; host.querySelector("select").setAttribute("aria-label", "窄侧栏选择内容");
host.querySelector("select").addEventListener("change", event => report("窄侧栏选择内容 · " + event.currentTarget.value));
const hostingPanel = h("div", {}, h("div", { class: "fc-host-toolbar" },
  group(h("span", { class: "fc-caption" }, "侧栏宽度"), hostSize([WORKSPACE_MINIMUMS.left, WORKSPACE_DEFAULT_SIZES.left, WORKSPACE_MAXIMUMS.left], "--sample-width", WORKSPACE_DEFAULT_SIZES.left)),
  group(h("span", { class: "fc-caption" }, "上下栏高度"), hostSize([WORKSPACE_MINIMUMS.top, WORKSPACE_DEFAULT_SIZES.top, WORKSPACE_MAXIMUMS.top], "--sample-band", WORKSPACE_DEFAULT_SIZES.top))), host);

const definitions = [["actions", "操作与反馈", actionPanel], ["inputs", "输入与限制", inputPanel], ["selection", "选择与导航", selectionPanel], ["hosting", "承载与自主视觉", hostingPanel]];
const panelRoot = h("div", { class: "fc-scroll" });
const tabs = h("div", { class: "fc-tabs", role: "tablist", "aria-label": "框架控件审阅组" });
const tabNodes = [];
function activate(index, focus = false) {
  definitions.forEach((definition, i) => { definition[2].hidden = i !== index; tabNodes[i].setAttribute("aria-selected", String(i === index)); tabNodes[i].tabIndex = i === index ? 0 : -1; });
  panelRoot.scrollTop = 0; if (focus) tabNodes[index].focus();
  report("正在审阅 · " + definitions[index][1]);
}
definitions.forEach(([id, label, panel], index) => {
  panel.id = "review-" + id; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", "tab-" + id);
  const node = h("button", { type: "button", class: "fc-tab", id: "tab-" + id, role: "tab", "aria-controls": panel.id,
    onclick: () => activate(index), onkeydown(event) {
      const target = event.key === "Home" ? 0 : event.key === "End" ? definitions.length - 1 : event.key === "ArrowRight" ? (index + 1) % definitions.length : event.key === "ArrowLeft" ? (index + definitions.length - 1) % definitions.length : null;
      if (target !== null) { event.preventDefault(); activate(target, true); }
    },
  }, label); tabNodes.push(node); tabs.append(node); panelRoot.append(panel);
});
const initial = definitions.findIndex(([id]) => id === new URLSearchParams(location.search).get("view"));
document.querySelector("#app").append(h("main", { class: "fc-review" },
  h("header", { class: "fc-heading" }, h("div", {}, h("h1", {}, "框架控件与承载"), h("p", {}, "框架统一操作与空间，插件保留自己的图形和内部视觉。")), h("a", { href: "structure-preview.html?scene=S01&variant=default" }, "返回框架")), tabs, panelRoot, status));
activate(initial < 0 ? 0 : initial);
