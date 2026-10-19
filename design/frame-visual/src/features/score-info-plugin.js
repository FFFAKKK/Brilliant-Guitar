import { definePlugin } from "../vendor/plugin-platform.js";
import { BACKUP_PLUGIN_IDENTITIES, backupSettingsDefinition } from "../host/formal-plugin-assembly.js";

/** Small real read-only contribution used to verify configuration -> fixed session. */
export function createScoreInfoPlugin({ score }) {
  const read = settings => {
    const snapshot = score.snapshot();
    return Object.freeze({ title: snapshot?.title ?? "", measureCount: snapshot?.measures.length ?? 0,
      mode: settings.mode, measureLimit: settings.measureLimit,
      measures: Object.freeze(settings.mode === "measures" ? (snapshot?.measures ?? []).slice(0, settings.measureLimit)
        .map(item => Object.freeze({ id: item.id, numerator: item.meter.numerator, denominator: item.meter.denominator, events: item.events.length })) : []) });
  };
  return definePlugin({ ...BACKUP_PLUGIN_IDENTITIES["frame.score-info"], apiVersion: "4.0", settings: backupSettingsDefinition("frame.score-info"),
    ui: { contractVersion: 1,
    commands: [{ id: "frame.score-info.read", run: (_payload, host) => ({ ok: true, info: read(host.settings.read()) }) }],
    components: [{ id: "frame.score-info.panel", uiKind: "panel", role: "tool", title: "谱面信息", icon: "page", order: 40,
      slots: ["left", "right"], defaultSlot: "right", defaultEnabled: false, permissions: { commands: [] },
      mount(element, ctx) {
        const document = element.ownerDocument;
        const content = document.createElement("section"); content.className = "score-info-panel";
        const render = () => {
          const info = read(ctx.settings.read());
          const heading = document.createElement("strong"); heading.textContent = info.title || "谱面尚未就绪";
          const summary = document.createElement("p"); summary.textContent = `${info.measureCount} 小节`;
          content.replaceChildren(heading, summary);
          if (info.mode === "measures") {
            const list = document.createElement("ol");
            for (const item of info.measures) {
              const row = document.createElement("li"); row.textContent = `${item.numerator}/${item.denominator} · ${item.events} 事件`; list.append(row);
            }
            content.append(list);
          }
        };
        element.append(content); ctx.onDispose(score.subscribe(render)); render();
        return { dispose() { content.remove(); } };
      } }], menuItems: [], shortcuts: [] },
  });
}
