import { definePlugin } from "../../src/vendor/plugin-platform.js";

/** Fixed-startup example: settings are read through the owning registry, never from management DOM. */
export function createConfiguredPlugin({ onMount = () => {}, onRun = () => {}, onDispose = () => {} } = {}) {
  return definePlugin({ id: "trial.configured", name: "Configured trial", version: "0.1.0", apiVersion: "4.0", activation: "user",
    settings: { schemaVersion: 1, defaults: { count: 2 }, parse: value => value && Number.isSafeInteger(value.count)
      && value.count >= 1 && value.count <= 9 && Object.keys(value).length === 1 ? { count: value.count } : null },
    ui: { contractVersion: 1,
      commands: [{ id: "trial.configured.read", run(payload, host) {
        const result = { ok: true, count: host.settings.read().count, payload };
        onRun(result); return Promise.resolve(result);
      } }],
      components: [{ id: "trial.configured.panel", title: "Configured trial", role: "tool", uiKind: "panel", slots: ["left", "right"],
        defaultSlot: "right", defaultEnabled: true, permissions: { commands: ["trial.configured.read"] },
        mount(element, ctx) {
          const count = ctx.settings.read().count; onMount(count);
          const button = element.ownerDocument.createElement("button"); button.setAttribute("data-configured-trial", "");
          button.setAttribute("aria-label", "Read configured value"); button.textContent = String(count);
          const run = () => { void ctx.execute("trial.configured.read", { source: "button" }); };
          button.addEventListener("click", run); ctx.onDispose(() => button.removeEventListener("click", run));
          ctx.onDispose(onDispose); element.append(button);
          return { dispose() { button.remove(); } };
        } }],
    } });
}
