// Renders menus from the menu registry. Every item executes a command id through the router.
import { h } from "./dom.js";
import { openPopover, closePopover, popoverAnchor } from "./popover.js";

export function createMenubar({ menus, router }) {
  const root = h("nav", { class: "menubar", "aria-label": "菜单" });

  function itemButton(item) {
    const command = router.describe(item.command);
    const enabled = command?.enabled() ?? false;
    const checked = command?.checked?.() ?? null;
    const shortcut = router.shortcuts.keysFor(item.command)[0]?.replace("Mod", navigator.platform.includes("Mac") ? "⌘" : "Ctrl");
    return h("button", {
      class: "menu-item", type: "button", role: checked === null ? "menuitem" : "menuitemcheckbox",
      "aria-checked": checked === null ? null : String(checked), disabled: !enabled,
      onclick: () => { closePopover(); router.execute(item.command, item.payload); },
    }, h("span", { class: "menu-check", "aria-hidden": "true" }), h("span", { class: "menu-label", text: item.label ?? command?.label }), h("kbd", { text: shortcut ?? "" }));
  }

  function open(trigger, menu) {
    const list = h("div", { class: "menu-list", role: "menu", "aria-label": menu.label });
    menu.groups.forEach((group, index) => {
      if (index) list.append(h("div", { class: "menu-rule", role: "separator" }));
      list.append(...group.map(itemButton));
    });
    list.addEventListener("keydown", (event) => navigate(event, list, trigger));
    openPopover(trigger, list, { label: menu.label });
  }

  function navigate(event, list, trigger) {
    const items = [...list.querySelectorAll(".menu-item:not(:disabled)")];
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const triggers = [...root.querySelectorAll(".menu-trigger")];
      const next = triggers[(triggers.indexOf(trigger) + (event.key === "ArrowRight" ? 1 : -1) + triggers.length) % triggers.length];
      next.click();
    }
  }

  function render() {
    root.replaceChildren(...menus.resolve().map((menu) => {
      const trigger = h("button", { class: "menu-trigger", type: "button", "aria-haspopup": "menu", "aria-expanded": "false", text: menu.label });
      trigger.addEventListener("click", () => open(trigger, menu));
      // Once a menu is open, hovering another trigger switches to it, like a native menubar.
      trigger.addEventListener("pointerenter", () => { const anchor = popoverAnchor(); if (anchor && anchor !== trigger && root.contains(anchor)) open(trigger, menu); });
      return trigger;
    }));
  }

  menus.subscribe(render);
  render();
  return root;
}
