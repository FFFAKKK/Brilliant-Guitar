// Fixed frame: only what must survive with every tool closed (component design language §4).
// Menus | document identity | component library, layout, notices | window controls.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { createMenubar } from "./menubar.js";

const SAVE_LABEL = { saved: "已保存", dirty: "未保存", saving: "正在保存", failed: "保存失败" };

export function createFrameBar({ menus, router, identity, notices, onLibrary, onLayout, onNotices }) {
  const title = h("span", { class: "doc-title" });
  const save = h("span", { class: "save-state", role: "status" }, h("i", { "aria-hidden": "true" }), h("span"));
  const badge = h("span", { class: "badge", "aria-hidden": "true" });
  const tool = (name, label, onclick, extra) => h("button", { class: "frame-tool", type: "button", "aria-label": label, title: label, "aria-expanded": "false", onclick }, extra);
  const noticeButton = tool("bell", "通知", (event) => onNotices(event.currentTarget), badge);
  const tools = [tool("library", "组件库", (event) => onLibrary(event.currentTarget)), tool("layout", "布局", (event) => onLayout(event.currentTarget)), noticeButton];
  tools[0].insertAdjacentHTML("afterbegin", icon("library"));
  tools[1].insertAdjacentHTML("afterbegin", icon("layout"));
  noticeButton.insertAdjacentHTML("afterbegin", icon("bell"));

  const windowControls = h("div", { class: "window-controls", "aria-label": "窗口" },
    ...[["minimize", "最小化"], ["maximize", "最大化"], ["close", "关闭"]].map(([name, label]) => {
      const button = h("button", { class: `window-button ${name}`, type: "button", "aria-label": label, title: label, disabled: true });
      button.innerHTML = icon(name, 16);
      return button;
    }));

  const root = h("header", { class: "frame-bar" },
    h("div", { class: "frame-start" }, createMenubar({ menus, router })),
    h("div", { class: "frame-identity" }, title, save),
    h("div", { class: "frame-end" }, h("div", { class: "frame-tools" }, tools), windowControls));

  identity.subscribe(renderIdentity);
  notices.subscribe(renderNotices);
  renderIdentity(identity.get());
  renderNotices(notices.state());

  function renderIdentity(state) {
    title.textContent = state.title;
    document.title = state.title;
    save.dataset.state = state.save;
    save.lastElementChild.textContent = SAVE_LABEL[state.save];
  }
  function renderNotices({ unread }) {
    badge.textContent = unread > 9 ? "9+" : unread ? String(unread) : "";
    noticeButton.classList.toggle("has-unread", unread > 0);
    noticeButton.setAttribute("aria-label", unread ? `通知，${unread} 条未读` : "通知");
  }
  return root;
}
