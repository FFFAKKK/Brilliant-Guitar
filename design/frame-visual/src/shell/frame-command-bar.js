import { h } from "./dom.js";
import { graphic } from "./visual-controls.js";

// OS window decorations belong to the native host. This row owns app commands.
export function createFrameCommandBar(menus) {
  return h("header", { class: "v-title", "aria-label": "命令栏" },
    h("div", { class: "v-title-start" }, h("span", { class: "v-app-mark" }, graphic("app")), menus));
}
