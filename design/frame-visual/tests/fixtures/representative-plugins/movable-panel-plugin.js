import { defineUiPlugin } from "../../../src/runtime/ui-plugin-contract.js";

export const MOVABLE_PANEL_IDS = Object.freeze({ namespace: "trial.movable", panel: "trial.movable.panel" });

export function createMovablePanelPlugin({ defaultSlot = "right", probeCommand, failMount = false,
  title = "移动试点" } = {}) {
  let mounts = 0, cleanups = 0, edits = 0, text = "", probeCode = null;
  const visibility = [];
  const manifest = defineUiPlugin({
    namespace: MOVABLE_PANEL_IDS.namespace,
    ui: [{ id: MOVABLE_PANEL_IDS.panel, kind: "panel", title, slots: ["left", "right"],
      defaultSlot, defaultEnabled: true, order: 10,
      mount(element, ctx) {
        mounts++;
        let active = true;
        const content = document.createElement("div"), input = document.createElement("textarea"), output = document.createElement("p");
        content.className = "trial-movable-panel";
        input.setAttribute("aria-label", "移动试点私有输入");
        output.setAttribute("aria-live", "polite"); output.textContent = "编辑次数：0";
        const onInput = () => {
          if (!active) return;
          text = input.value; edits++; output.textContent = `编辑次数：${edits}`;
        };
        input.addEventListener("input", onInput);
        ctx.onDispose(() => { active = false; cleanups++; input.removeEventListener("input", onInput); });
        content.append(input, output); element.append(content);
        if (failMount) throw new Error("trial panel mount failure");
        // Negative permission probe is opt-in test input, not an extra host capability.
        if (probeCommand) {
          const probe = document.createElement("button"); probe.type = "button"; probe.textContent = "检查权限限制";
          const onProbe = () => {
            const result = ctx.execute(probeCommand);
            probeCode = result.code; output.textContent = `权限结果：${probeCode}`;
          };
          probe.addEventListener("click", onProbe);
          ctx.onDispose(() => probe.removeEventListener("click", onProbe));
          content.append(probe);
        }
        return { setVisible: visible => visibility.push(visible) };
      },
    }],
  });
  return Object.freeze({ manifest, snapshot: () => Object.freeze({ mounts, cleanups, edits, text, probeCode,
    visibility: Object.freeze([...visibility]) }) });
}
