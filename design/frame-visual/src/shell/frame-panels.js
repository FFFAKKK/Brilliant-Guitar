// Contents of the three fixed-frame popovers. They only read registries and execute commands.
import { h } from "./dom.js";
import { closePopover } from "./popover.js";
import { DOCKS } from "../layout/layout-model.js";

const SLOT_LABEL = { top: "上", left: "左", right: "右", bottom: "下" };
const ROLE_LABEL = { view: "视图", tool: "工具", inspector: "检查器", status: "状态" };

// Component library: every non-view component, where it is, and where it may go.
export function renderLibrary({ components, layout, router }) {
  const list = h("div", { class: "library" }, h("p", { class: "panel-title", text: "组件库" }));
  for (const component of components.list().filter((item) => item.role !== "view")) {
    const where = layout.get().placements[component.id] ?? null;
    const choices = h("div", { class: "slot-choices", role: "radiogroup", "aria-label": `${component.title}的位置` },
      ...component.slots.map((slot) => h("button", {
        class: "slot-choice", type: "button", role: "radio", "aria-checked": String(where === slot), text: SLOT_LABEL[slot],
        onclick: () => { router.execute("frame.place", { componentId: component.id, slot }); closePopover(); },
      })),
      h("button", { class: "slot-choice off", type: "button", role: "radio", "aria-checked": String(where === null), text: "隐藏",
        onclick: () => { router.execute("frame.place", { componentId: component.id, slot: null }); closePopover(); } }));
    list.append(h("div", { class: "library-row" },
      h("div", { class: "library-name" }, h("span", { text: component.title }), h("small", { text: ROLE_LABEL[component.role] })),
      choices));
  }
  return list;
}

// Layout: dock visibility is a reversible switch per region, plus reset (M08, L12).
export function renderLayoutPanel({ layout, components, router }) {
  const current = layout.get();
  const rows = DOCKS.map((side) => {
    const count = components.list().filter((item) => current.placements[item.id] === side).length;
    const shortcut = router.shortcuts.keysFor(`frame.dock.${side}`)[0];
    return h("button", {
      class: "switch-row", type: "button", role: "switch", "aria-checked": String(current.docks[side].open), disabled: !count,
      onclick: (event) => { router.execute(`frame.dock.${side}`); event.currentTarget.setAttribute("aria-checked", String(layout.get().docks[side].open)); },
    }, h("span", { text: `${SLOT_LABEL[side]}区域` }), h("small", { text: count ? `${count} 个组件` : "空" }), h("kbd", { text: shortcut?.replace("Mod", "Ctrl") ?? "" }), h("i", { class: "switch", "aria-hidden": "true" }));
  });
  return h("div", { class: "layout-panel" }, h("p", { class: "panel-title", text: "布局" }), ...rows,
    h("div", { class: "menu-rule" }),
    h("button", { class: "menu-item", type: "button", onclick: () => { router.execute("frame.layout.reset"); closePopover(); } }, h("span", { class: "menu-check" }), h("span", { text: "恢复默认布局" }), h("kbd")));
}

export function renderNotices({ notices }) {
  const { entries } = notices.state();
  const body = entries.length
    ? h("ol", { class: "notice-list" }, ...entries.map((entry) => h("li", { class: "notice", dataset: { level: entry.level } },
      h("i", { "aria-hidden": "true" }), h("span", { text: entry.text }), h("time", { text: new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }))))
    : h("p", { class: "notice-empty", text: "没有通知" });
  return h("div", { class: "notices-panel" }, h("p", { class: "panel-title", text: "通知" }), body);
}
