import { createMotionCoordinator } from "./motion-pilot/coordinator.js";
import { createMotionAdapter } from "./motion-pilot/motion-adapter.js";
import { mountLayoutMotionPilot } from "./motion-pilot/layout-pilot.js";
import { mountActualLayoutMotion } from "./motion-pilot/layout-actual-visual.js";

const STYLES = Object.freeze({ continuous: ["连续", "Continuity"], focused: ["聚焦", "Focus"], quiet: ["静稳", "Quiet"] });
const MODES = Object.freeze({ full: ["完整", "Full"], slow: ["慢放", "Slow"], reduced: ["减少", "Reduced"], none: ["关闭", "Off"] });
const root = document.getElementById("app");
const actualLayout = new URLSearchParams(location.search).get("actualLayout") === "1";
if (actualLayout) for (const file of ["base", "framework-controls", "workspace-layout"]) {
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = `styles/${file}.css`; document.head.append(link);
}
root.innerHTML = `<main class="motion-review">
  <header class="motion-review-header"><div><h1>布局动效试验</h1><p>区域开合 · 尺寸跟手 · 连续排布</p></div><a href="layout-collaboration-review.html">返回布局组件</a></header>
  <section class="motion-stage" aria-label="动画样稿工作区">
    <div class="motion-score"><span class="motion-score-label">谱面工作台</span><img class="motion-paper" src="fixtures/approved-score.svg" alt="备份框架的固定谱面" draggable="false"></div>
    <aside class="motion-panel" aria-label="布局动画样稿"><header class="motion-panel-header"><strong>工作区布局</strong><span>Workspace Layout</span></header><div class="motion-pilot" data-motion-pilot></div><p class="motion-preview-note">视觉试验 · 示例配置</p></aside>
  </section>
  <footer class="motion-review-footer">
    <div class="motion-review-group"><span class="motion-review-label">风格 <small>Style</small></span><div class="motion-review-options" data-options="style"></div></div>
    <div class="motion-review-group"><span class="motion-review-label">播放 <small>Playback</small></span><div class="motion-review-options" data-options="mode"></div></div>
    <div class="motion-review-actions"><button type="button" class="motion-review-trigger">切换内容 <small>Switch</small></button><span class="motion-review-status" role="status" aria-live="polite"></span></div>
  </footer></main>`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let style = "continuous", mode = reduced.matches ? "reduced" : "full", released = false;
const lifetime = new AbortController();
const status = message => { root.querySelector(".motion-review-status").textContent = message; };
const motion = createMotionCoordinator({ adapter: createMotionAdapter(), mode, reducedMotion: reduced.matches,
  onIssue: () => status("动画不可用，已保留当前布局"),
});
const pilot = (actualLayout ? mountActualLayoutMotion : mountLayoutMotionPilot)(root.querySelector("[data-motion-pilot]"), { motion, profile: () => style,
  onState: state => status(state.dragging ? "拖动中" : state.view === "regions" ? "区域" : "排布"),
});
if (actualLayout) {
  root.querySelector(".motion-panel-header").hidden = true;
  root.querySelector(".motion-review-header h1").textContent = "布局组件 · 选择动效";
  root.querySelector(".motion-review-header p").textContent = "均衡 / 紧凑 · 图形同步";
  root.querySelector(".motion-preview-note").textContent = "实际组件 · 动画审阅";
  root.querySelector(".motion-review-trigger").innerHTML = "切换排布 <small>Arrange</small>";
}
function updateOptions() {
  for (const button of root.querySelectorAll("[data-group]")) button.setAttribute("aria-pressed", String(button.dataset.value === (button.dataset.group === "style" ? style : mode)));
  root.dataset.profile = style; root.dataset.motion = motion.snapshot().mode;
}
for (const [group, options] of [["style", STYLES], ["mode", MODES]]) {
  const container = root.querySelector(`[data-options="${group}"]`);
  for (const [value, [label, english]] of Object.entries(options)) {
    const button = document.createElement("button"); button.type = "button"; button.className = "motion-review-option";
    button.innerHTML = `<span>${label}</span><small>${english}</small>`; button.dataset.group = group; button.dataset.value = value;
    button.addEventListener("click", () => {
      pilot.settle();
      if (group === "style") style = value; else mode = value;
      motion.setPolicy({ mode, profile: style }); updateOptions();
      status(reduced.matches && mode !== "none" ? "系统减少动效" : `${label} · ${english}`);
    }, { signal: lifetime.signal });
    container.append(button);
  }
}
root.querySelector(".motion-review-trigger").addEventListener("click", event => pilot.replay(event.detail === 0), { signal: lifetime.signal });
reduced.addEventListener("change", () => { pilot.settle(); motion.setPolicy({ reducedMotion: reduced.matches }); updateOptions(); }, { signal: lifetime.signal });
document.addEventListener("visibilitychange", () => { if (document.hidden) { pilot.settle(); motion.setPolicy({}); } }, { signal: lifetime.signal });
function dispose() { if (released) return; released = true; lifetime.abort(); pilot.dispose(); motion.dispose(); }
window.addEventListener("pagehide", event => { if (!event.persisted) dispose(); else { pilot.settle(); motion.setPolicy({}); } }, { signal: lifetime.signal });
updateOptions();

// Read-only evidence seam: no playback, mutation or DOM grants are exposed.
export const readMotionReview = () => Object.freeze({ ...pilot.snapshot(), ...motion.snapshot(), released });
