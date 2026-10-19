import { defineUiPlugin } from "../../../src/runtime/ui-plugin-contract.js";

export const COMMAND_ONLY_IDS = Object.freeze({ namespace: "trial.command", command: "trial.command.ping" });

// Test-only author plugin. Creating a declaration acquires no DOM or resident resources.
export function createCommandOnlyPlugin({ enabled = () => true } = {}) {
  let attempts = 0, accepted = 0;
  const manifest = defineUiPlugin({
    namespace: COMMAND_ONLY_IDS.namespace,
    ui: [],
    commands: [{ id: COMMAND_ONLY_IDS.command, enabled, run(payload) {
      attempts++;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)
        || Object.keys(payload).some(key => key !== "mode")) return { ok: false, code: "trial.invalid-payload" };
      if (payload.mode === "reject") return { ok: false, code: "trial.rejected" };
      if (payload.mode === "throw") throw new Error("trial command failure");
      if (payload.mode !== undefined && payload.mode !== "accept") return { ok: false, code: "trial.invalid-mode" };
      return { ok: true, count: ++accepted };
    } }],
  });
  // A read-only test observer, not a component context or an added host capability.
  return Object.freeze({ manifest, snapshot: () => Object.freeze({ attempts, accepted }) });
}
