import { definePlugin } from "../../src/vendor/plugin-platform.js";

// `source` belongs to the plugin; it is not a layout or document authority.
export function createPanelPlugin({ source, onRun = () => {} }) {
  return definePlugin({ id: "audit.panel", name: "Audit panel", version: "0.1.0", apiVersion: "4.0",
    settings: { schemaVersion: 1, defaults: { prefix: "A" }, parse(value) {
      return value && typeof value.prefix === "string" && value.prefix.length <= 16
        ? Object.freeze({ prefix: value.prefix }) : null;
    } },
    ui: { contractVersion: 1,
      commands: [{ id: "audit.panel.inspect", run(payload, host) {
        onRun(payload); return { ok: true, payload, prefix: host.settings.read().prefix };
      } }],
      components: [{ id: "audit.panel.content", title: "Audit panel", role: "tool", uiKind: "panel",
        slots: ["left", "right"], permissions: { commands: ["audit.panel.inspect"] },
        mount(element, ctx) {
          const value = element.ownerDocument.createElement("output");
          value.setAttribute("data-audit-panel-value", "");
          const button = element.ownerDocument.createElement("button");
          button.setAttribute("aria-label", "Inspect"); button.textContent = "↗";
          const render = () => { value.textContent = `${ctx.settings.read().prefix}:${source.read()}`; };
          const click = () => ctx.execute("audit.panel.inspect", { source: "button" });
          ctx.onDispose(source.subscribe(render));
          button.addEventListener("click", click);
          ctx.onDispose(() => button.removeEventListener("click", click));
          element.append(value, button); render();
          return { dispose() { value.remove(); button.remove(); } };
        } }],
    },
  });
}
