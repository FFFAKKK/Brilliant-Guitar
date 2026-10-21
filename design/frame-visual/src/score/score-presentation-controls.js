import { SCORE_PRESENTATION_COMMAND, SCORE_PRESENTATIONS } from "./score-presentation.js";

// Plugin-owned artwork. Both marks share the same 24px envelope and 32px hit area.
const icons = {
  staff: '<path d="M3 5h18M3 8.5h18M3 12h18M3 15.5h18M3 19h18" opacity=".4"/><path d="M14.5 6v9"/><ellipse cx="12.5" cy="15" rx="2.4" ry="1.7" fill="currentColor" stroke="none" transform="rotate(-20 12.5 15)"/>',
  tablature: '<path d="M3 4.5h18M3 7.5h18M3 10.5h18M3 13.5h18M3 16.5h18M3 19.5h18" opacity=".4"/><path d="M9 7.5h6M9 13.5h6" stroke="var(--ui-surface-color)" stroke-width="5"/><path d="M10 5.5h3l-3 4h3M10 11.5h3v4h-3z" stroke-width="1"/>',
};

export function mountScorePresentationControls(element, ctx, presentation, input = null) {
  const group = element.ownerDocument.createElement("div");
  group.className = "score-presentation-controls"; group.setAttribute("role", "group");
  group.setAttribute("aria-label", "谱式");
  const buttons = SCORE_PRESENTATIONS.map(({ kind, label }) => {
    const button = element.ownerDocument.createElement("button");
    button.type = "button"; button.dataset.notationChoice = kind;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[kind]}</svg>`;
    button.addEventListener("click", () => ctx.execute(SCORE_PRESENTATION_COMMAND, { kind }));
    group.append(button); return button;
  });
  function refresh() {
    const pending = input?.snapshot().pending === true;
    presentation.choices().forEach((choice, index) => {
      const button = buttons[index];
      button.disabled = !choice.enabled || pending;
      button.setAttribute("aria-pressed", String(choice.selected));
      button.setAttribute("aria-label", choice.kind === "tablature" ? `${choice.label} · 只读` : choice.label);
      button.title = pending ? "输入完成后可切换谱式"
        : !choice.enabled && choice.message ? `${choice.label}：${choice.message}`
        : choice.kind === "tablature" ? `${choice.label} · 只读` : choice.label;
    });
  }
  ctx.onDispose(presentation.read.subscribe(refresh));
  if (input) ctx.onDispose(input.subscribe(refresh));
  element.append(group); refresh();
  return { dispose() { group.remove(); } };
}
