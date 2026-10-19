import { definePlugin } from "../../src/vendor/plugin-platform.js";

export function createCommandPlugin({ enabled = () => true, run = payload => ({ ok: true, payload }) } = {}) {
  return definePlugin({ id: "audit.command", name: "Audit command", version: "0.1.0", apiVersion: "4.0",
    ui: { contractVersion: 1,
      commands: [{ id: "audit.command.run", label: "Inspect", enabled, run }],
      menuItems: [{ id: "audit.command.menu", menu: "view", command: "audit.command.run" }],
      shortcuts: [{ id: "audit.command.key", command: "audit.command.run", keys: ["Mod+Alt+I"], scope: "global" }],
    },
  });
}
