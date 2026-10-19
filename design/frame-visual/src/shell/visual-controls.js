import { h } from "./dom.js";
import { icon } from "../fixtures/preview-icons.js";

export function graphic(name, size = 16) {
  const node = h("span", { class: "v-icon-wrap", "aria-hidden": "true" });
  node.innerHTML = icon(name, size);
  return node;
}

export function visualButton(label, glyph, action, { className = "", size = 16, ...props } = {}) {
  return h("button", { type: "button", class: (glyph ? "v-icon-button " : "v-text-button ") + className,
    "aria-label": label, "data-tooltip": label, title: glyph ? props["aria-label"] ?? label : null, ...props, onclick: action },
  glyph ? graphic(glyph, size) : h("span", {}, label));
}
