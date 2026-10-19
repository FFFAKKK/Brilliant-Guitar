import { definePlugin } from "../../src/vendor/plugin-platform.js";

// Async reads happen inside a synchronous mount. `read` is the author's own input port.
export function createReadonlyViewPlugin({ read }) {
  return definePlugin({ id: "audit.readonly", name: "Audit readonly view", version: "0.1.0", apiVersion: "4.0",
    ui: { contractVersion: 1,
      components: [{ id: "audit.readonly.view", title: "Audit readonly view", role: "view", uiKind: "view", slots: ["stage"],
        mount(element, ctx) {
          const value = element.ownerDocument.createElement("output");
          value.setAttribute("data-audit-view-value", "");
          const retry = element.ownerDocument.createElement("button");
          retry.setAttribute("aria-label", "Reload"); retry.textContent = "↻";
          let active = true, generation = 0, pending = null;
          const refresh = () => {
            const acceptedGeneration = ++generation;
            pending?.abort(); const request = new AbortController(); pending = request;
            value.textContent = "…";
            Promise.resolve().then(() => active && generation === acceptedGeneration ? read({ signal: request.signal }) : null).then(result => {
              if (active && generation === acceptedGeneration) value.textContent = String(result);
            }).catch(() => {
              if (active && generation === acceptedGeneration) value.textContent = "不可用";
            });
          };
          retry.addEventListener("click", refresh);
          ctx.onDispose(() => { active = false; generation++; pending?.abort(); retry.removeEventListener("click", refresh); });
          element.append(value, retry); refresh();
          return { dispose() { value.remove(); retry.remove(); } };
        } }],
    },
  });
}
