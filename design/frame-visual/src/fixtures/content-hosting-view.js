import { h } from "../shell/dom.js";
import { WORKSPACE_CHROME, workspaceFooterHeight } from "../workspace-geometry.js";
import { HOSTING_CONTENT, HOSTING_MODES, hostingItem, hostingPages, hostingPage, hostingCurrent, hostingLocation, hostingSections, hostingOrder, hostingReason, hostingHalfSpace } from "./content-hosting-state.js";

const sideName = side => side === "left" ? "左侧栏" : "右侧栏";
const pageName = page => sideName(page.side) + " · " + page.name;
export function createContentHostingView({ state, dispatch, button, wordButton, graphic, grip }) {
  const memory = state.hostingMemory, config = state.contentHosting, editing = state.assembly === true;
  const action = (label, type, value, options = {}) => wordButton(label, "hosting-" + type, value, options);
  const select = (label, id, entries, value, type, disabled = false) => h("label", { class: "ch-field" }, label,
    h("select", { id, "aria-label": label, disabled, onchange: event => dispatch("hosting-" + type, event.currentTarget.value) },
      ...entries.map(([key, name]) => h("option", { value: key, selected: key === value }, name))));
  const body = item => {
    const node = h("div", { class: "ch-neutral-body", dataset: { instance: item.id }, style: { minHeight: item.height + "px" } });
    if (item.status !== "ready") return node.append(h("p", { class: "ch-reason" }, item.status === "missing" ? "插件缺失" : "内容暂不可用"),
      h("p", { class: "ch-note" }, item.status === "missing" ? "保留此位置与已保存输入。恢复注册后，由工程恢复原实例。" : "来源暂未就绪。此位置保留，稍后可重试。")), node;
    node.append(h("label", { class: "ch-field" }, "示例输入", h("input", { id: "hosting-input-" + item.id, "aria-label": item.name + "示例输入", value: memory.inputs[item.id] ?? "", placeholder: "输入…",
      oninput: event => { memory.inputs[item.id] = event.currentTarget.value; } })),
      h("div", { class: "ch-options", "aria-label": item.name + "示例选择" }, ...["甲", "乙"].map((label, index) => h("button", { type: "button", "aria-pressed": String((memory.choices[item.id] ?? 0) === index),
        onclick: event => { memory.choices[item.id] = index; for (const [i, child] of Array.from(event.currentTarget.parentElement.children).entries()) child.setAttribute("aria-pressed", String(i === index)); } }, label))));
    if (item.long) node.append(h("div", { class: "ch-long" }, ...Array.from({ length: 24 }, (_, index) => h("p", {}, "阅读示例 " + (index + 1))), h("p", { dataset: { end: item.id } }, "内容末尾")));
    return node;
  };
  function card(id, mode, width = "full") {
    const item = hostingItem(id), location = hostingLocation(state, id), half = hostingHalfSpace(state, location, item);
    const selectButton = editing ? button("选择" + item.name, "drag", "hosting-select", id, { id: "hosting-select-" + id }) : null;
    if (selectButton && mode === "grid") {
      selectButton.draggable = true;
      selectButton.addEventListener("dragstart", event => { event.dataTransfer.setData("text/plain", id); memory.dragging = id; });
      selectButton.addEventListener("dragend", () => { memory.dragging = null; });
    }
    return h("section", { class: "ch-card " + width, "aria-label": item.name,
      dataset: { content: id, mode, selected: String(editing && memory.selected === id), constrained: String(width === "half" && !half.allowed) },
      ondragover: event => {
        if (!editing || !memory.dragging) return;
        event.preventDefault();
        const source = hostingLocation(state, memory.dragging);
        const section = source && hostingSections(source).find(entry => entry.mode === "grid" && entry.items.includes(memory.dragging));
        event.currentTarget.dataset.drop = section?.items.includes(id) && source.id === location.id && id !== memory.dragging ? "true" : "invalid";
      },
      ondragleave: event => { event.currentTarget.dataset.drop = "false"; },
      ondrop: event => { if (editing) { event.preventDefault(); dispatch("hosting-drop", id); } } },
      h("div", { class: "ch-card-head" }, selectButton, h("span", { class: "ch-name", title: item.name }, item.name), item.status === "ready" ? null : h("span", { class: "ch-value" }, item.status === "missing" ? "缺失" : "未就绪")),
      width === "half" ? h("p", { class: "ch-note", dataset: { halfCapacity: id }, hidden: half.allowed }, "半行仅 " + half.available + "px，声明最小 " + item.minimum + "px；保持占宽，可扩大侧栏。") : null,
      body(item));
  }
  function panel(side) {
    const page = hostingCurrent(state, side), pages = hostingPages(state, side), index = pages.indexOf(page);
    const active = page.items.includes(memory.active[page.id]) ? memory.active[page.id] : page.items[0];
    const key = page.id + ":" + page.mode + (page.mode === "tabs" ? ":" + active : "");
    let tabNavigation = null;
    const content = h("div", { class: "ch-content", tabindex: "0", id: "hosting-scroll-" + side, "aria-label": pageName(page) + "内容", dataset: { page: page.id, mode: page.mode, scrollKey: key },
      onscroll: event => { if (event.currentTarget.isConnected) memory.scroll[key] = event.currentTarget.scrollTop; } });
    if (!page.items.length) content.append(h("div", { class: "ch-empty" }, h("strong", {}, "此页面暂无内容"), h("p", { class: "ch-note" }, "页面设置仍保留。内容库中的加入操作归内容编辑管理。"), wordButton("查看内容库", "library")));
    for (const section of hostingSections(page)) {
      if (!section.items.length) continue;
      const area = h("div", { class: "ch-section", dataset: { section: section.id, mode: section.mode } });
      if (page.mode === "mixed") area.append(h("div", { class: "ch-section-label" }, HOSTING_MODES[section.mode] + "区"));
      if (section.mode === "tabs") {
        const current = section.items.includes(memory.active[page.id]) ? memory.active[page.id] : section.items[0];
        const at = section.items.indexOf(current);
        const heading = h("div", { class: "ch-tabs-heading" }, h("span", { class: "ch-value" }, "内容 " + (at + 1) + " / " + section.items.length),
          button("上一个内容 · " + page.name, "collapseLeft", "hosting-focus", section.items[at - 1], { disabled: at === 0, id: "hosting-content-prev-" + side }),
          button("下一个内容 · " + page.name, "collapseRight", "hosting-focus", section.items[at + 1], { disabled: at === section.items.length - 1, id: "hosting-content-next-" + side }));
        if (page.mode === "tabs") { tabNavigation = heading; heading.classList.add("ch-tabs-fixed"); }
        else area.append(heading);
        area.append(h("div", { class: "ch-tabs-sheets", dataset: { remaining: String(section.items.length - at - 1) } }, card(current, "tabs")));
      } else if (section.mode === "list") {
        for (const id of section.items) {
          const item = hostingItem(id);
          const row = h("details", { class: "ch-list-row", dataset: { content: id, selected: String(editing && memory.selected === id) }, open: memory.expanded[id] !== false,
            ontoggle: event => { if (event.currentTarget.isConnected) memory.expanded[id] = event.currentTarget.open; } },
            h("summary", {}, graphic("down"), h("span", { class: "ch-name", title: item.name }, item.name), h("span", { class: "ch-value" }, item.status === "ready" ? (memory.inputs[id] ? "已输入" : "空") : item.status === "missing" ? "缺失" : "未就绪")),
            editing ? action("选择此内容", "select", id, { id: "hosting-select-" + id }) : null, body(item));
          area.append(row);
        }
      } else {
        const grid = h("div", { class: "ch-grid" });
        let pending = false;
        for (const id of section.items) {
          const item = hostingItem(id), width = config.widths[id] ?? item.width;
          if (width === "full" && pending) { grid.append(h("div", { class: "ch-gap", "aria-label": "独立空位" }, editing ? "保留空位" : "")); pending = false; }
          grid.append(card(id, "grid", width)); if (width === "half") pending = !pending;
        }
        if (pending) grid.append(h("div", { class: "ch-gap", "aria-label": "独立空位" }, editing ? "保留空位" : ""));
        area.append(grid);
      }
      content.append(area);
    }
    const height = innerHeight - WORKSPACE_CHROME.title - WORKSPACE_CHROME.merge - (state.topOpen ? state.topHeight : 0) - workspaceFooterHeight(state);
    const fixed = Math.min(page.fixed, Math.max(40, height - 64 - (tabNavigation ? 28 : 0) - 96));
    const footer = h("div", { class: "ch-fixed", dataset: { requested: String(page.fixed), actual: String(fixed) } },
      h("div", { class: "ch-fixed-head" }, h("span", {}, "页面固定区"), wordButton("内容库", "library", null, { id: "hosting-library-" + side })),
      page.fixed > 56 ? h("p", { class: "ch-note", dataset: { fixedReason: "true" } }, fixed < page.fixed ? "请求 " + page.fixed + "px，当前 " + fixed + "px；保留阅读区，可在此浏览固定内容。" : "固定区内容独立浏览。") : null,
      page.fixed > 56 ? h("label", { class: "ch-field" }, "固定区输入", h("input", { id: "hosting-footer-" + side, "aria-label": sideName(side) + "固定区输入", value: memory.footer[page.id] ?? "", oninput: event => { memory.footer[page.id] = event.currentTarget.value; } })) : null,
      page.fixed > 56 ? Array.from({ length: 12 }, (_, i) => h("p", { class: "ch-note" }, "固定信息 " + (i + 1))) : null);
    const header = h("div", { class: "v-region-header" }, h("span", { class: "v-region-name" }, sideName(side)),
      button("收起" + sideName(side), side === "left" ? "collapseLeft" : "collapseRight", "region", side));
    const navigation = h("div", { class: "ch-page-nav" }, h("span", { class: "ch-name", title: page.name }, page.name),
      button("上一承载页面 · " + sideName(side), "collapseLeft", "hosting-page", pages[index - 1]?.id, { disabled: index === 0, id: "hosting-prev-" + side }),
      h("span", { class: "ch-value" }, (index + 1) + "/" + pages.length),
      button("下一承载页面 · " + sideName(side), "collapseRight", "hosting-page", pages[index + 1]?.id, { disabled: index === pages.length - 1, id: "hosting-next-" + side }));
    const surface = h("div", { class: "v-panel-surface ch-surface " + (side === "right" ? "v-page" : "v-left-surface"), style: { gridTemplateRows: "32px 32px " + (tabNavigation ? "28px " : "") + "minmax(0,1fr) " + fixed + "px" } }, header, navigation, tabNavigation, content, footer);
    return h("section", { class: side === "left" ? "v-left" : "v-right", "aria-label": sideName(side), hidden: !state[side + "Open"] }, surface, grip(side));
  }
  function rail(side) {
    const page = hostingCurrent(state, side);
    const ids = config.iconOrder.filter(id => hostingLocation(state, id)?.side === side && !config.hidden.includes(id));
    const visible = ids.map(id => { const item = hostingItem(id), location = hostingLocation(state, id); return button(item.name, item.icon, "hosting-focus", id,
      { id: "hosting-rail-" + id, class: "v-rail-button", pressed: memory.current[side] === location.id && (memory.active[location.id] ?? location.items[0]) === id && !(side === "right" && state.reviewLayout) }); });
    return h("nav", { class: "v-rail " + (side === "left" ? "v-icon-rail" : "v-page-rail"), "aria-label": sideName(side) + "内容入口" },
      h("div", { class: "v-rail-actions" }, button(sideName(side), side, "region", side, { class: "v-rail-button", pressed: state[side + "Open"] })),
      h("div", { class: "v-rail-list" }, ...visible), h("div", { class: "v-rail-footer" },
        side === "right" ? button("工作区布局", "layout", "review-layout", null, { id: "hosting-layout", class: "v-rail-button", selected: state.reviewLayout }) : null,
        button("内容库", "plus", "library", null, { id: "hosting-rail-library-" + side, class: "v-rail-button" })));
  }
  function layoutSections() {
    const page = hostingPage(state), selected = hostingItem(memory.selected), location = hostingLocation(state, memory.selected);
    const group = (name, ...nodes) => h("section", { class: "v-layout-group", "aria-label": name }, h("span", { class: "v-layout-group-label" }, name), ...nodes);
    const order = location ? hostingOrder(location, selected.id) : [];
    const grid = location && hostingSections(location).some(section => section.mode === "grid" && section.items.includes(selected.id));
    const reason = selected ? hostingReason(state, selected.id, memory.destination) : "请先选择内容";
    return [group("承载页面", select("当前配置页面", "hosting-target", hostingPages(state).map(entry => [entry.id, pageName(entry)]), page.id, "target"),
      h("div", { class: "ch-mode-controls" }, ...Object.entries(HOSTING_MODES).map(([mode, name]) => action(name, "mode", mode, { id: "hosting-mode-" + mode, disabled: !editing, pressed: page.mode === mode }))),
      h("p", { class: "ch-note" }, "仅修改当前页面。页签、列表、网格可独立或按区混用。"), action("查看此页面", "page", page.id, { id: "hosting-show-target" })),
      group("选中内容", select("选择已加入内容", "hosting-selection", [["", "请选择内容"], ...hostingPages(state).flatMap(entry => entry.items.map(id => [id, hostingItem(id).name + " · " + entry.name]))], selected?.id ?? "", "select", !editing),
        selected && location ? h("div", { class: "ch-selected-detail" }, h("p", {}, selected.name), h("p", { class: "ch-note" }, pageName(location) + " · " + (location.mode === "mixed" ? HOSTING_MODES[selected.section] + "区" : HOSTING_MODES[location.mode])),
          grid ? h("div", { class: "ch-mode-controls" }, action((config.widths[selected.id] ?? selected.width) === "full" ? "改为半行" : "改为整行", "width", selected.id,
            { id: "hosting-width", disabled: !editing || selected.supports.length < 2 || (config.widths[selected.id] ?? selected.width) === "full" && !hostingHalfSpace(state, location, selected).allowed })) : null,
          grid ? h("p", { class: "ch-note", id: "hosting-selected-capacity" }, "半行 " + hostingHalfSpace(state, location, selected).available + "px · 最小 " + selected.minimum + "px" + (selected.supports.length === 1 ? " · 仅支持" + (selected.width === "full" ? "整行" : "半行") : "")) : null,
          h("div", { class: "ch-mode-controls" }, action("前移", "order", { id: selected.id, delta: -1 }, { id: "hosting-order-up", disabled: !editing || order.indexOf(selected.id) <= 0 }),
            action("后移", "order", { id: selected.id, delta: 1 }, { id: "hosting-order-down", disabled: !editing || order.indexOf(selected.id) === order.length - 1 }),
            action("移出", "toggle", selected.id, { id: "hosting-remove", disabled: !editing || selected.fixed || selected.status !== "ready" })),
          selected.fixed ? h("p", { class: "ch-note" }, "固定内容不能移出所属页面。") : null) : h("p", { class: "ch-note" }, editing ? "选择任何呈现中的内容，配置在此统一管理。" : "进入内容编辑后选择并配置内容。")),
      group("移动到其他页面", select("目标区域与页面", "hosting-destination", hostingPages(state).map(entry => [entry.id, pageName(entry)]), memory.destination, "destination", !editing || !selected),
        selected ? h("div", { class: "ch-destinations" }, ...hostingPages(state).map(entry => h("p", { class: "ch-note", dataset: { destination: entry.id } }, pageName(entry) + "：" + (hostingReason(state, selected.id, entry.id) || "允许移动")))) : null,
        action("移动到目标页面", "move", null, { id: "hosting-move", disabled: !editing || !!reason }), h("p", { class: "ch-note", id: "hosting-move-note" }, reason || "移动后保持同一内容身份与输入；确认或取消整次内容配置。"),
        h("p", { class: "ch-result", id: "hosting-result", role: "status" }, memory.result)),
      group("内容管理", wordButton("内容库", "library", null, { id: "layout-library" }), h("p", { class: "ch-note" }, "加入、移出、图标显隐和顺序在同一编辑事务内。隐藏图标仍可通过页面或内容库查看。")),
    ];
  }
  function library(list, query) {
    const target = hostingPage(state);
    const items = HOSTING_CONTENT.filter(item => (item.name + " " + item.source + " " + item.id).toLowerCase().includes(query.trim().toLowerCase()));
    list.replaceChildren(h("p", { class: "ch-library-target" }, "当前加入位置：" + pageName(target)), ...items.map(item => {
      const location = hostingLocation(state, item.id), hidden = config.hidden.includes(item.id), current = location && memory.current[location.side] === location.id && (memory.active[location.id] ?? location.items[0]) === item.id && !(location.side === "right" && state.reviewLayout);
      const order = config.iconOrder.filter(id => hostingLocation(state, id)?.side === location?.side);
      const reason = location ? item.fixed ? "固定内容不可移出" : item.status === "missing" ? "插件缺失，保留位置与输入" : item.status === "unavailable" ? "来源暂未就绪，保留位置" : "" : hostingReason(state, item.id, target.id);
      return h("div", { class: "v-library-entry", dataset: { content: item.id } },
        h("div", { class: "v-library-row" }, graphic(item.icon), h("div", { class: "v-library-name" }, h("span", { title: item.name }, item.name),
          h("small", {}, item.source + " · " + (location ? pageName(location) : "未加入")), h("small", {}, (current ? "正在查看 · " : "") + (location ? "已加入 · " : "") + (hidden ? "图标已隐藏" : "图标可见")), reason ? h("small", {}, reason) : null),
          action(location ? "移出" : "加入", "toggle", item.id, { id: "hosting-enable-" + item.id, disabled: !editing || !!reason })),
        h("div", { class: "v-library-actions" }, action("查看", "focus", item.id, { id: "hosting-view-" + item.id, disabled: !location }),
          action(hidden ? "显示图标" : "隐藏图标", "icon", item.id, { id: "hosting-icon-" + item.id, disabled: !editing }),
          h("span", { class: "v-library-order" }, button("上移" + item.name + "入口", "up", "hosting-icon-order", { id: item.id, delta: -1 }, { id: "hosting-icon-up-" + item.id, disabled: !editing || !location || order.indexOf(item.id) === 0 }),
            button("下移" + item.name + "入口", "down", "hosting-icon-order", { id: item.id, delta: 1 }, { id: "hosting-icon-down-" + item.id, disabled: !editing || !location || order.indexOf(item.id) === order.length - 1 }))));
    }));
    if (!items.length) list.append(h("div", { class: "v-empty-result" }, "没有匹配的内容", wordButton("清空搜索", "library-clear", null, { id: "hosting-search-clear" })));
    if (config.hidden.length === HOSTING_CONTENT.length) list.prepend(h("p", { class: "ch-library-target" }, "全部内容入口已隐藏；进入内容编辑后可逐项显示，内容仍在各自页面。"));
  }
  function restore(root) { for (const node of root.querySelectorAll(".ch-content")) node.scrollTop = memory.scroll[node.dataset.scrollKey] ?? 0; }
  function sync(root) {
    for (const node of root.querySelectorAll("[data-half-capacity]")) {
      const item = hostingItem(node.dataset.halfCapacity), page = hostingLocation(state, item.id), half = hostingHalfSpace(state, page, item);
      node.hidden = half.allowed; node.textContent = "半行仅 " + half.available + "px，声明最小 " + item.minimum + "px；保持占宽，可扩大侧栏。";
      node.closest(".ch-card").dataset.constrained = String(!half.allowed);
    }
    for (const node of root.querySelectorAll(".ch-fixed")) {
      const surface = node.parentElement, side = surface.closest(".v-left") ? "left" : "right", page = hostingCurrent(state, side);
      const height = innerHeight - WORKSPACE_CHROME.title - WORKSPACE_CHROME.merge - (state.topOpen ? state.topHeight : 0) - workspaceFooterHeight(state);
      const tabs = !!surface.querySelector(".ch-tabs-fixed");
      const fixed = Math.min(page.fixed, Math.max(40, height - 64 - (tabs ? 28 : 0) - 96));
      surface.style.gridTemplateRows = "32px 32px " + (tabs ? "28px " : "") + "minmax(0,1fr) " + fixed + "px"; node.dataset.actual = String(fixed);
      const note = node.querySelector("[data-fixed-reason]");
      if (note) note.textContent = fixed < page.fixed ? "请求 " + page.fixed + "px，当前 " + fixed + "px；保留阅读区，可在此浏览固定内容。" : "固定区内容独立浏览。";
    }
    const selected = hostingItem(memory.selected), page = hostingLocation(state, memory.selected), width = root.querySelector("#hosting-width");
    if (width && selected && page) width.disabled = !editing || selected.supports.length < 2 || (config.widths[selected.id] ?? selected.width) === "full" && !hostingHalfSpace(state, page, selected).allowed;
    const capacity = root.querySelector("#hosting-selected-capacity");
    if (capacity && selected && page) capacity.textContent = "半行 " + hostingHalfSpace(state, page, selected).available + "px · 最小 " + selected.minimum + "px" + (selected.supports.length === 1 ? " · 仅支持" + (selected.width === "full" ? "整行" : "半行") : "");
    for (const node of root.querySelectorAll("[data-destination]")) if (selected) { const target = hostingPage(state, node.dataset.destination); node.textContent = pageName(target) + "：" + (hostingReason(state, selected.id, target.id) || "允许移动"); }
    const move = root.querySelector("#hosting-move"), note = root.querySelector("#hosting-move-note");
    const reason = selected ? hostingReason(state, selected.id, memory.destination) : "请先选择内容";
    if (move) move.disabled = !editing || !!reason;
    if (note) note.textContent = reason || "移动后保持同一内容身份与输入；确认或取消整次内容配置。";
  }
  return { panel, rail, layoutSections, library, restore, sync };
}
