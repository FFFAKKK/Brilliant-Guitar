import { defineUiPlugin } from "../../../src/runtime/ui-plugin-contract.js";

export const SHARED_ENTRY_IDS = Object.freeze({
  namespace: "trial.entries", command: "trial.entries.count", panel: "trial.entries.panel", shortcut: "trial.entries.local",
});

export function createSharedEntryPlugin({ namespace = SHARED_ENTRY_IDS.namespace, keys = ["Alt+J"],
  enabled = () => true, perform = () => ({ ok: true }), allowCommand = true, bindShortcut = true } = {}) {
  const ids = Object.freeze({ namespace, command: `${namespace}.count`, panel: `${namespace}.panel`, shortcut: `${namespace}.local` });
  let attempts = 0, accepted = 0, pending = false, mounts = 0, cleanups = 0, problem = null;
  const views = new Set(); // Internal to this plugin, not an added host feedback or subscription API.
  const available = () => !pending && enabled();
  const publish = () => { for (const render of views) render(); };
  const fail = error => { problem = error instanceof Error ? error.message : String(error); throw error; };
  const finish = () => { pending = false; publish(); };
  function accept(result) {
    if (!result || typeof result.ok !== "boolean" || (!result.ok && (typeof result.code !== "string" || !result.code))) {
      throw new TypeError("trial invalid action result");
    }
    if (!result.ok) { problem = result.code; return { ok: false, code: result.code }; }
    return { ok: true, count: ++accepted };
  }
  function run() {
    attempts++; pending = true; problem = null; publish();
    let result;
    try { result = perform(); }
    catch (error) { try { return fail(error); } finally { finish(); } }
    if (result?.then) return Promise.resolve(result).then(accept).catch(fail).finally(finish);
    try { return accept(result); }
    catch (error) { return fail(error); }
    finally { finish(); }
  }
  const manifest = defineUiPlugin({
    namespace,
    commands: [{ id: ids.command, enabled: available, run }],
    menuItems: [{ menu: "plugins", label: "调用组合入口", command: ids.command, group: 0, order: 0 }],
    shortcuts: bindShortcut ? [{ id: ids.shortcut, command: ids.command, keys, scope: "component", componentId: ids.panel }] : [],
    ui: [{ id: ids.panel, kind: "panel", title: "组合入口试点", slots: ["left", "right"],
      defaultSlot: "right", defaultEnabled: true, order: 20,
      permissions: { commands: allowCommand ? [ids.command] : [] },
      mount(element, ctx) {
        mounts++;
        let active = true;
        const content = document.createElement("div"), button = document.createElement("button");
        const input = document.createElement("input"), output = document.createElement("p");
        content.className = "trial-shared-entry";
        button.type = "button"; button.textContent = "调用同一动作";
        input.setAttribute("aria-label", "组合入口文本输入");
        output.setAttribute("aria-live", "polite"); output.className = "trial-shared-result";
        const render = () => {
          if (!active) return;
          button.disabled = !available();
          output.textContent = pending ? "处理中" : problem ? `失败：${problem}` : `计数：${accepted}`;
        };
        const report = text => {
          if (!active) return;
          output.textContent = text; ctx.notify(text, "error");
        };
        const click = async () => {
          if (!active || button.disabled) return;
          try {
            const result = await ctx.execute(ids.command);
            if (!active) return;
            if (result?.ok !== true || !Number.isSafeInteger(result.count)) report(`调用失败：${result?.code ?? "结果无效"}`);
          } catch (error) { report(`调用异常：${error instanceof Error ? error.message : String(error)}`); }
        };
        views.add(render);
        ctx.onDispose(() => { active = false; cleanups++; views.delete(render); button.removeEventListener("click", click); });
        button.addEventListener("click", click);
        content.append(button, input, output); element.append(content); render();
      },
    }],
  });
  return Object.freeze({ manifest, ids, snapshot: () => Object.freeze({ attempts, accepted, pending, mounts, cleanups, subscribers: views.size }) });
}
