const fs = require("node:fs"), path = require("node:path"), { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."), output = path.resolve(process.env.FRAME_VISIBLE_EVIDENCE_DIR || path.join(root,
  "evidence/layout-visible-formal-animation-20261007/replay-" + new Date().toISOString().replace(/[:.]/g, "-")));
const base = "http://127.0.0.1:5193/", report = { at: new Date().toISOString(), checks: [], frames: [], errors: [] };
fs.mkdirSync(output, { recursive: true });
const check = (name, passed, detail) => report.checks.push({ name, passed: !!passed, detail });
const durationIs = (track, ms) => Math.abs(track.duration - ms) < .001;
const watch = (page, name) => { page.on("pageerror", e => report.errors.push({ name, message: e.message })); page.on("console", e => { if (e.type() === "error") report.errors.push({ name, message: e.text() }); }); };
const raf = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const idle = async page => { await raf(page); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active === 0); await raf(page); };
const toggleMiddle = (page, selector) => page.waitForFunction(selector => {
  const ink = document.querySelector(selector), o = Number(getComputedStyle(ink).opacity);
  return ink.getAnimations().length > 0 && o > .02 && o < .98;
}, selector);
const read = page => page.evaluate(() => {
  const app = document.querySelector("#app"), r = window.__backupUiRuntime;
  const box = n => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  const frame = Object.fromEntries(["left", "right", "top", "voice"].map(side => {
    const content = app.querySelector(`[data-frame-region-motion="${side}"]`), element = content.closest({ left: ".v-left", right: ".v-right", top: ".v-top", voice: ".v-voice-content" }[side]);
    const s = getComputedStyle(content), m = new DOMMatrixReadOnly(s.transform);
    return [side, { hidden: element.hidden, inert: element.inert, aria: element.getAttribute("aria-hidden"), exiting: element.dataset.frameRegionExiting === "true",
      opacity: Number(s.opacity), x: m.m41, y: m.m42, region: box(element), clip: getComputedStyle(element).clipPath,
      tracks: content.getAnimations().map(a => ({ duration: a.effect.getTiming().duration, frames: a.effect.getKeyframes() })) }];
  }));
  const mask = app.querySelector(".v-layout-selection-window"), style = getComputedStyle(mask), matrix = new DOMMatrixReadOnly(style.transform);
  const toggles = selector => [...app.querySelectorAll(selector)].map(n => {
    const button = n.parentElement, s = getComputedStyle(n), icon = n.querySelector(".v-icon-wrap"), surface = n.querySelector('[class$="toggle-surface"]');
    return { id: button.id, opacity: Number(s.opacity), pointer: s.pointerEvents, aria: n.getAttribute("aria-hidden"), box: box(button),
      color: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor, rest: button.dataset.frameToggleRest ?? button.dataset.toggleRest,
      icon: !!icon, surface: !!surface, tracks: n.getAnimations().map(a => ({ duration: a.effect.getTiming().duration, frames: a.effect.getKeyframes() })) };
  });
  return { state: r?.workspace.snapshot(), motion: r?.motion.snapshot(), frame, stage: box(app.querySelector(".v-stage")), paper: box(app.querySelector(".v-paper")),
    selection: { x: matrix.m41, y: matrix.m42, opacity: Number(style.opacity), tracks: mask.getAnimations().map(a => ({ duration: a.effect.getTiming().duration, frames: a.effect.getKeyframes() })) },
    ink: app.querySelectorAll(".v-map-region-ink").length, shapes: app.querySelector(".v-layout-map-canvas").children.length,
    layoutToggles: toggles(".v-layout-toggle-ink"), frameToggles: toggles(".v-frame-toggle-ink"),
    overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
});
const recordNext = page => page.evaluate(() => { window.visibleCaptureNext = true; });
const stopRecord = async (page, name) => {
  const f = await page.evaluate(() => { const f = window.visibleFrames; f.running = false;
    return { samples: f.samples.length, drift: Object.fromEntries(Object.keys(f.baseline).map(k => [k, Math.max(0, ...f.samples.map(r => Math.abs(r[k] - f.baseline[k])))])),
      controlSamples: f.controls.length, controls: Object.fromEntries(Object.keys(f.controlBaseline).map(k => [k,
        Object.fromEntries(["x", "y", "width", "height"].map(v => [v, Math.max(0, ...f.controls.map(r => Math.abs(r[k][v] - f.controlBaseline[k][v])))]))])) }; });
  report.frames.push({ name, ...f }); check(name + ": accepted score stays fixed on every animation frame", f.samples > 0 && Object.values(f.drift).every(v => v === 0), { samples: f.samples, drift: f.drift });
  if (!/\/(entry|exit) right$/.test(name)) check(name + ": accepted settings host, title, map frame and control hit areas stay fixed on every frame", f.controlSamples > 0 && Object.values(f.controls).every(r => Object.values(r).every(v => v === 0)), { samples: f.controlSamples, controls: f.controls });
};
async function authorControls(page, name) {
  const v = await page.evaluate(() => {
    const root = document.querySelector("#app"), choices = ["balanced", "compact", "default"].map(mode => root.querySelector("#layout-" + mode));
    const switches = ["left", "right", "top", "voice"].map(side => root.querySelector("#layout-" + side));
    const buttons = [...root.querySelectorAll(".v-composer-header .v-text-button")].filter(b => b.getBoundingClientRect().height > 0);
    return { choices: choices.every(b => b.title === b.getAttribute("aria-label") && b.getAttribute("data-tooltip") === b.title),
      nextAction: switches.every(b => b.title.startsWith(b.getAttribute("aria-pressed") === "true" ? "收起" : "展开") && b.getAttribute("data-tooltip") === b.title),
      heights: buttons.map(b => ({ id: b.id, height: b.getBoundingClientRect().height })) };
  });
  check(name + ": latest author titles and next-action hints are loaded through the actual entry", v.choices && v.nextAction, v);
  check(name + ": latest component-owned header buttons retain at least 28px hit height", v.heights.length > 0 && v.heights.every(b => b.height >= 28), v.heights);
}
async function setup(page) {
  await page.goto(base + "runtime-preview.html", { waitUntil: "networkidle" }); await page.waitForSelector(".core-score-view svg");
  await page.evaluate(async () => {
    const { createMotionAnimationProvider } = await import("./src/runtime/motion-animation-provider.js");
    const native = createMotionAnimationProvider(); window.visibleJobs = [];
    window.visibleProvider = { name: native.name, start(args) { const control = native.start(args); window.visibleJobs.push({ ...args, control }); return control; } };
    window.__backupUiRuntime.motion.replaceProvider(window.visibleProvider); window.__backupUiRuntime.motion.setPolicy({ mode: "slow" });
    await document.fonts.ready;
    document.addEventListener("click", e => {
      if (!window.visibleCaptureNext || !e.isTrusted || !e.detail) return; window.visibleCaptureNext = false;
      const rect = () => { const r = document.querySelector("#app .v-paper").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const nodes = [...document.querySelectorAll("#app .v-page, #app .v-composer, #app .v-composer-header, #app .v-layout-map, #app .v-layout-map-canvas, #app .v-layout-content input, #app .v-layout-content button")];
      const controls = () => Object.fromEntries(nodes.map((n, i) => { const r = n.getBoundingClientRect(); return [n.id || n.className + ":" + i, { x: r.x, y: r.y, width: r.width, height: r.height }]; }));
      const f = { baseline: rect(), samples: [], controlBaseline: controls(), controls: [], running: true }; window.visibleFrames = f;
      const sample = () => { if (!f.running) return; f.samples.push(rect()); f.controls.push(controls()); requestAnimationFrame(sample); }; requestAnimationFrame(sample);
    });
    window.originalLayoutInput = document.querySelector("#layout-size-left");
  }); await idle(page);
}
async function esm(browser) {
  for (const [width, height, dpr] of [[1440, 900, 1], [1280, 720, 1.5], [800, 600, 2]]) {
    const name = `${width}x${height}@${dpr}`, context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr }), page = await context.newPage(); watch(page, name);
    try {
      await setup(page); const initial = await read(page);
      check(name + ": ten local layout targets, four frame planes and local frame controls share the formal host", initial.motion.targets === 14 + initial.frameToggles.length && initial.layoutToggles.length === 4 && initial.shapes === 5 && initial.ink === 0, initial.motion);
      await authorControls(page, name);
      await recordNext(page); await page.locator("#layout-compact").click();
      await page.waitForFunction(() => window.visibleJobs.some(j => j.intent === "selection-transition" && j.isCurrent()));
      await page.waitForFunction(() => {
        const job = window.visibleJobs.findLast(j => j.intent === "selection-transition" && j.isCurrent());
        if (!job) return false;
        const x = new DOMMatrixReadOnly(getComputedStyle(job.node).transform).m41;
        return job.node.getAnimations().length > 0 && Math.abs(x - job.from.x) > .01 && Math.abs(x - job.to.x) > .01;
      });
      const selected = await read(page), selectionJobs = await page.evaluate(() => window.visibleJobs.filter(j => j.intent === "selection-transition").map(j => ({ from: j.from, to: j.to, settings: j.settings })));
      check(name + ": selection semantic state precedes an actual intermediate author window", selected.state.arrangement === "compact" && selected.selection.tracks.length > 0 && selected.selection.x !== selectionJobs.at(-1).from.x && selected.selection.x !== selectionJobs.at(-1).to.x, { selected: selected.selection, jobs: selectionJobs });
      check(name + ": one selection target consumes the 250ms author variant", selectionJobs.at(-1).settings.duration === .25 && selected.selection.tracks.every(t => t.duration === 625), selected.selection.tracks);
      check(name + ": arrangement immediately accepts legal host width without animating the whole settings page", selected.state.rightWidth === 230 && selected.frame.right.tracks.length === 0 && !selected.frame.right.exiting, selected.frame.right);
      await idle(page); await stopRecord(page, name + "/selection compact");
      await recordNext(page); await page.locator("#layout-balanced").click(); await idle(page); await stopRecord(page, name + "/selection balanced");
      check(name + ": blue surface and bright icons use one noninteractive clip", await page.evaluate(() => { const copy = document.querySelector(".v-layout-arrange-active-copy"); return copy.getAttribute("aria-hidden") === "true" && getComputedStyle(copy).pointerEvents === "none" && document.querySelectorAll(".v-layout-selection-window").length === 1 && copy.style.clipPath.includes("layout-arrangement-mask"); }));
      await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.adjust.begin")); await idle(page);
      for (const side of ["left", "top", "voice", "right"]) {
        if (!(await read(page)).state[side + "Open"]) await page.evaluate(side => window.__backupUiRuntime.execute("frame.workspace.region.toggle", { region: side }), side);
        await idle(page); await recordNext(page); await page.locator("#region-" + side).click();
        await page.waitForFunction(side => { const n = document.querySelector(`[data-frame-region-motion="${side}"]`); return n.getAnimations().length > 0 && Number(getComputedStyle(n).opacity) < .98; }, side);
        const exit = await read(page), e = exit.frame[side], s = exit.stage;
        check(name + "/" + side + ": accepted close is immediately inert and unavailable while original content exits", !exit.state[side + "Open"] && e.exiting && !e.hidden && e.inert && e.aria === "true" && e.opacity > 0 && e.opacity < 1, e);
        const outside = side === "left" ? e.region.x + e.region.width <= s.x + .05 : side === "right" ? e.region.x >= s.x + s.width - .05
          : side === "top" ? e.region.y + e.region.height <= s.y + .05 : e.region.y >= s.y + s.height - .05;
        check(name + "/" + side + ": retained edge cannot cover the accepted stage or cause document overflow", outside && !exit.overflow && e.clip.startsWith("inset("), { region: e.region, stage: s, clip: e.clip, overflow: exit.overflow });
        check(name + "/" + side + ": actual exit uses 120ms and at most 12px without dimensions/scale", e.tracks.length > 0 && e.tracks.every(t => t.duration === 300 && t.frames.every(f => !["width", "height", "top", "left", "scale"].some(k => Object.hasOwn(f, k)))) && Math.abs(e.x) + Math.abs(e.y) <= 12.01, e.tracks);
        await toggleMiddle(page, "#region-" + side + " .v-frame-toggle-ink");
        const control = (await read(page)).frameToggles.find(t => t.id === "region-" + side);
        check(name + "/" + side + ": frame switch fades a single blue/icon layer at 120ms with stable hit area", control.opacity > 0 && control.opacity < 1 && control.aria === "true" && control.pointer === "none" && control.icon && control.surface && control.background === "rgba(0, 0, 0, 0)" && control.tracks.every(t => t.duration === 300 && t.frames.every(f => !Object.hasOwn(f, "transform"))), control);
        await idle(page); await stopRecord(page, name + "/exit " + side); check(name + "/" + side + ": completion hides only the accepted closed region", (await read(page)).frame[side].hidden);
        await recordNext(page); await page.locator("#region-" + side).click();
        await page.waitForFunction(side => { const n = document.querySelector(`[data-frame-region-motion="${side}"]`); const o = Number(getComputedStyle(n).opacity); return o > .03 && o < .97 && n.getAnimations().length > 0; }, side);
        const entry = (await read(page)).frame[side]; check(name + "/" + side + ": actual entry uses 180ms with interaction restored", !entry.inert && entry.aria === null && entry.opacity > 0 && entry.opacity < 1 && entry.tracks.every(t => Math.abs(t.duration - 450) < .001), entry);
        const feedback = (await read(page)).frameToggles.find(t => t.id === "region-" + side);
        check(name + "/" + side + ": opening control uses independent 160ms opacity feedback", feedback.tracks.some(t => t.duration === 400) && feedback.tracks.every(t => t.frames.every(f => !Object.hasOwn(f, "transform"))), feedback);
        await idle(page); await stopRecord(page, name + "/entry " + side);
      }
      check(name + ": folding right preserves actual plugin input instance", await page.evaluate(() => window.originalLayoutInput === document.querySelector("#layout-size-left")));
      await sourcesAndToggles(page, name);
      // Reversal uses real pointer dispatch; stale callbacks are the actual
      // formal provider's callbacks, without a review/coordinator substitute.
      await page.locator("#region-left").click(); await page.waitForFunction(() => window.visibleJobs.some(j => j.node.dataset.frameRegionMotion === "left" && j.isCurrent()));
      await page.evaluate(() => { window.oldFrameJob = window.visibleJobs.findLast(j => j.node.dataset.frameRegionMotion === "left"); });
      await page.locator("#region-left").click();
      const reverse = await page.evaluate(() => {
        const now = window.visibleJobs.findLast(j => j.node.dataset.frameRegionMotion === "left"), old = window.oldFrameJob;
        const before = window.__backupUiRuntime.workspace.snapshot(); old.write(old.to); old.complete(); old.failed(new Error("late frame failure"));
        return { from: now.from, open: before.leftOpen, stateSame: before === window.__backupUiRuntime.workspace.snapshot() }; });
      check(name + ": rapid reverse samples intermediate content and stale callbacks do not close new state", reverse.open && reverse.stateSame && reverse.from.opacity > 0 && reverse.from.opacity < 1, reverse); await idle(page);
      await page.locator("#region-left").focus(); await page.keyboard.press("Enter"); check(name + ": keyboard closes immediately without a retained edge", (await read(page)).frame.left.hidden && (await read(page)).frame.left.tracks.length === 0);
      await page.evaluate(() => document.querySelector("#region-left").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
      check(name + ": synthetic pointer metadata cannot animate the frame", (await read(page)).frame.left.tracks.length === 0);
      await page.evaluate(() => queueMicrotask(() => window.__backupUiRuntime.execute("frame.workspace.region.toggle", { region: "left" })));
      check(name + ": asynchronous program command stays immediate", (await read(page)).frame.left.hidden && (await read(page)).frame.left.tracks.length === 0);
      await page.locator("#layout-compact").focus(); await page.keyboard.press("Enter"); check(name + ": selection keyboard remains immediate", (await read(page)).selection.tracks.length === 0); await idle(page);
      for (const policy of [{ mode: "none" }, { mode: "reduced" }, { mode: "full", profile: "quiet" }]) {
        await page.evaluate(p => window.__backupUiRuntime.motion.setPolicy(p), policy); await page.locator("#region-left").click();
        const v = await read(page); check(name + "/" + JSON.stringify(policy) + ": frame content remains immediate under policy", v.frame.left.tracks.length === 0 && !v.frame.left.exiting);
        if (policy.profile === "quiet") check(name + ": quiet frame controls consume only the 100/80ms local author fade", v.frameToggles.filter(t => t.tracks.length).every(t => t.tracks.every(a => durationIs(a, 80) || durationIs(a, 100))));
        else check(name + "/" + policy.mode + ": no local frame/control native playback", v.motion.active === 0);
        await idle(page);
      }
      await page.evaluate(() => window.__backupUiRuntime.motion.setPolicy({ mode: "slow", profile: "continuous" }));
      await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().mode === "reduced");
      await page.locator("#region-left").click(); check(name + ": system reduction disables frame tracks", (await read(page)).frame.left.tracks.length === 0);
      await page.emulateMedia({ reducedMotion: "no-preference" }); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().mode === "slow");
      await page.locator("#region-left").click(); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
      await page.setViewportSize({ width: width + 20, height: height + 20 }); await idle(page); check(name + ": resize clears every retained edge and frame track", (await read(page)).frame.left.tracks.length === 0 && !(await read(page)).frame.left.exiting);
      await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(null)); await page.locator("#region-left").click();
      check(name + ": no provider remains usable and retains no exit layer", !(await read(page)).frame.left.exiting && (await read(page)).motion.active === 0);
      await page.screenshot({ path: path.join(output, name + "-formal.png") });
      const disposed = await page.evaluate(() => { const r = window.__backupUiRuntime; r.dispose(); return { motion: r.motion.snapshot(), children: document.querySelector("#app").children.length, native: document.getAnimations().length }; });
      check(name + ": final release leaves no frame/layout target, track or DOM", disposed.motion.targets === 0 && disposed.motion.components === 0 && disposed.motion.active === 0 && disposed.children === 0 && disposed.native === 0, disposed);
    } finally { await context.close(); }
  }
}
async function setRegion(page, side, open) {
  await page.evaluate(({ side, open }) => { const r = window.__backupUiRuntime; if (r.workspace.snapshot()[side + "Open"] !== open) r.execute("frame.workspace.region.toggle", { region: side }); }, { side, open });
  await idle(page);
}
async function sourcesAndToggles(page, name) {
  for (const side of ["left", "top", "voice"]) {
    await setRegion(page, side, false); await recordNext(page); await page.locator("#layout-" + side).click();
    await toggleMiddle(page, "#layout-" + side + " .v-layout-toggle-ink");
    const v = await read(page), t = v.layoutToggles.find(t => t.id === "layout-" + side);
    check(name + "/layout " + side + ": real control accepts semantics first and fades one blue/bright-icon layer without transform", v.state[side + "Open"] && await page.locator("#layout-" + side).getAttribute("aria-pressed") === "true" && t.opacity > 0 && t.opacity < 1 && t.icon && t.surface && t.pointer === "none" && t.aria === "true" && t.tracks.some(t => t.duration === 400) && t.tracks.every(t => t.frames.every(f => !Object.hasOwn(f, "transform"))), t);
    check(name + "/layout " + side + ": same trusted operation also starts the real frame region", v.frame[side].tracks.length > 0 && v.frame[side].tracks.every(t => durationIs(t, 450)), v.frame[side]);
    await stopRecord(page, name + "/layout toggle " + side + " entry");
    await page.evaluate(side => { window.oldToggleJob = window.visibleJobs.findLast(j => j.node === document.querySelector("#layout-" + side + " .v-layout-toggle-ink")); }, side);
    await recordNext(page); await page.locator("#layout-" + side).click();
    const reverse = await page.evaluate(side => {
      const j = window.visibleJobs.findLast(j => j.node === document.querySelector("#layout-" + side + " .v-layout-toggle-ink")), old = window.oldToggleJob;
      const state = window.__backupUiRuntime.workspace.snapshot(); old.complete(); old.failed(new Error("stale local switch")); old.write(old.to);
      return { from: j.from, settings: j.settings, same: state === window.__backupUiRuntime.workspace.snapshot() };
    }, side);
    check(name + "/layout " + side + ": reverse samples opacity and ignores stale callbacks at 120ms", reverse.from.opacity > 0 && reverse.from.opacity < 1 && reverse.settings.fadeDuration === .12 && reverse.same, reverse);
    await idle(page); await stopRecord(page, name + "/layout toggle " + side);
  }
  await setRegion(page, "left", false); await page.locator("#module-panel-trigger").click();
  await toggleMiddle(page, "#module-panel-trigger .v-frame-toggle-ink");
  const module = await read(page);
  check(name + ": module rail follows the same frame entry and local fade", module.frame.left.tracks.some(t => durationIs(t, 450)) && module.frameToggles.find(t => t.id === "module-panel-trigger").tracks.some(t => durationIs(t, 400)), module.frame.left);
  await idle(page);
  await page.locator('.v-menu[data-menu="view"]').click(); await page.getByRole("menuitemcheckbox", { name: "左侧栏", exact: true }).click();
  await page.waitForFunction(() => window.visibleJobs.some(j => j.node.dataset.frameRegionMotion === "left" && j.isCurrent()));
  const menu = await read(page); check(name + ": body menu portal has the same trusted 120ms safe exit", !menu.state.leftOpen && menu.frame.left.exiting && menu.frame.left.inert && menu.frame.left.tracks.some(t => t.duration === 300), menu.frame.left); await idle(page);
  await setRegion(page, "voice", false); await page.locator("#voice-trigger").click(); await toggleMiddle(page, "#voice-trigger .v-frame-toggle-ink");
  check(name + ": voice frame entry and local feedback use one unchanged header control", (await read(page)).frame.voice.tracks.some(t => durationIs(t, 450)) && (await read(page)).frameToggles.find(t => t.id === "voice-trigger").tracks.some(t => durationIs(t, 400))); await idle(page);
  await page.locator('[id="page-tab-frame.layout.page"]').click();
  await toggleMiddle(page, '[id="page-tab-frame.layout.page"] .v-frame-toggle-ink');
  const rail = await read(page); check(name + ": active page rail close retains original content safely and fades its local icon", !rail.state.rightOpen && rail.frame.right.exiting && rail.frame.right.inert && rail.frameToggles.find(t => t.id === "page-tab-frame.layout.page").tracks.some(t => t.duration === 300), rail.frame.right); await idle(page);
  await page.locator('[id="page-tab-frame.layout.page"]').click(); await idle(page);
  await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.arrange", { mode: "balanced" })); await idle(page);
  await setRegion(page, "right", false); await page.locator("#region-right").click();
  await page.waitForFunction(() => { const n = document.querySelector('[data-frame-region-motion="right"]'); const o = Number(getComputedStyle(n).opacity); return n.getAnimations().length && o > .03 && o < .97; });
  await page.evaluate(() => { window.oldSettingsEntry = window.visibleJobs.findLast(j => j.node.dataset.frameRegionMotion === "right"); });
  await recordNext(page); await page.locator("#layout-compact").click({ force: true });
  const stable = await read(page);
  check(name + ": arrangement during right entry immediately ends whole-page motion", stable.state.arrangement === "compact" && stable.frame.right.tracks.length === 0 && stable.frame.right.x === 0 && stable.frame.right.opacity === 1 && !stable.frame.right.exiting, stable.frame.right);
  await page.evaluate(() => { window.oldSettingsEntry.complete(); window.oldSettingsEntry.failed(new Error("stale settings entry")); window.oldSettingsEntry.write(window.oldSettingsEntry.from); });
  await idle(page); await stopRecord(page, name + "/selection interrupt settings entry");
  // Current provider failure settles accepted presentation along the existing notice path.
  await setRegion(page, "left", false); await page.locator("#layout-left").click();
  await toggleMiddle(page, "#layout-left .v-layout-toggle-ink");
  const failure = await page.evaluate(() => {
    const r = window.__backupUiRuntime, state = r.workspace.snapshot(), ink = document.querySelector("#layout-left .v-layout-toggle-ink");
    const job = window.visibleJobs.findLast(j => j.node === ink); job.failed(new Error("visible-current-local-failure"));
    return { same: state === r.workspace.snapshot(), opacity: Number(getComputedStyle(ink).opacity), stopped: !job.isCurrent() };
  }); check(name + ": current local failure lands statically without a business mutation", failure.same && failure.opacity === 1 && failure.stopped, failure); await idle(page);
  await page.locator("#region-left").click(); await page.waitForFunction(() => window.visibleJobs.some(j => j.node.dataset.frameRegionMotion === "left" && j.isCurrent()));
  await page.evaluate(() => { const j = window.visibleJobs.findLast(j => j.node.dataset.frameRegionMotion === "left"); j.failed(new Error("visible-current-frame-failure")); });
  await idle(page); check(name + ": current frame failure hides accepted closed content and clears retained edge", (await read(page)).frame.left.hidden && !(await read(page)).frame.left.exiting);
  await page.locator("#region-left").click(); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
  await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(null)); await idle(page);
  check(name + ": provider replacement clears all current frame/control tracks", (await read(page)).motion.active === 0 && await page.evaluate(() => document.getAnimations().length === 0));
  await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(window.visibleProvider));
  await page.locator("#region-left").click(); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
  await page.evaluate(() => { document.querySelector("#app").hidden = true; }); await idle(page);
  check(name + ": whole root hiding clears native tracks and safe retained edges", (await read(page)).motion.active === 0 && !(await read(page)).frame.left.exiting && await page.evaluate(() => document.getAnimations().length === 0));
  await page.evaluate(() => { document.querySelector("#app").hidden = false; }); await idle(page);
  check(name + ": restoration does not replay old feedback or remount input", await page.evaluate(() => window.originalLayoutInput === document.querySelector("#layout-size-left") && document.getAnimations().length === 0));
  // Leave the original reversal and keyboard checks at their established baseline.
  await setRegion(page, "left", true); await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.arrange", { mode: "balanced" })); await idle(page);
}
async function generated(browser) {
  for (const entry of [{ name: "classic-file", url: pathToFileURL(path.join(root, "plugin-startup-config-static-preview.html")).href }, { name: "desktop-assets", url: base + "dist/desktop/index.html" }]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(); watch(page, entry.name);
    try {
      await page.goto(entry.url, { waitUntil: "networkidle" }); await page.locator("#startup-open").click(); await page.waitForSelector(".core-score-view svg");
      const initial = await read(page); check(entry.name + ": generated startup contains five shapes, selection and four frame planes", initial.shapes === 5 && initial.ink === 0 && Object.keys(initial.frame).length === 4 && await page.locator(".v-layout-selection-window").count() === 1);
      check(entry.name + ": generated startup has four local layout toggle inks and independent frame switches", initial.layoutToggles.length === 4 && initial.frameToggles.length >= 6 && initial.frameToggles.every(t => t.aria === "true" && t.pointer === "none" && t.icon && t.surface));
      await authorControls(page, entry.name);
      await page.locator("#layout-compact").click(); await page.waitForFunction(() => document.querySelector(".v-layout-selection-window").getAnimations().length > 0);
      const selection = (await read(page)).selection; check(entry.name + ": actual registered selection animates at author 250ms", selection.tracks.some(t => t.duration === 250), selection);
      await page.waitForFunction(() => document.querySelector(".v-layout-selection-window").getAnimations().length === 0);
      await page.locator("#region-left").click(); await page.waitForFunction(() => document.querySelector('[data-frame-region-motion="left"]').getAnimations().length > 0);
      const entryMotion = (await read(page)).frame.left; check(entry.name + ": actual frame entry at 180ms", entryMotion.tracks.some(t => t.duration === 180), entryMotion);
      await page.waitForFunction(() => document.querySelector('[data-frame-region-motion="left"]').getAnimations().length === 0);
      await page.locator("#region-left").click(); await page.waitForFunction(() => document.querySelector(".v-left").dataset.frameRegionExiting === "true");
      const exit = (await read(page)).frame.left; check(entry.name + ": actual frame exit is inert at 120ms", exit.inert && exit.aria === "true" && exit.tracks.some(t => t.duration === 120), exit);
      await page.waitForFunction(() => document.querySelector(".v-left").hidden);
      await page.locator("#layout-left").click(); await toggleMiddle(page, "#layout-left .v-layout-toggle-ink");
      const toggle = (await read(page)).layoutToggles.find(t => t.id === "layout-left");
      check(entry.name + ": actual formal layout switch uses 160ms opacity only with one blue/icon layer", toggle.tracks.some(t => durationIs(t, 160)) && toggle.tracks.every(t => t.frames.every(f => !Object.hasOwn(f, "transform"))) && toggle.surface && toggle.icon, toggle);
      check(entry.name + ": same generated pointer path animates frame and preserves registered shape capability", (await read(page)).frame.left.tracks.some(t => durationIs(t, 180)) && await page.evaluate(() => document.querySelector(".v-map-left").getAnimations().some(a => Math.abs(a.effect.getTiming().duration - 280) < .001)));
      await page.waitForFunction(() => document.getAnimations().length === 0);
      const centers = await page.evaluate(() => [...document.querySelectorAll('[data-frame-toggle]')].filter(b => !b.classList.contains("v-voice-trigger")).map(b => {
        const r = b.getBoundingClientRect(), svg = b.querySelector(".v-frame-toggle-ink svg").getBoundingClientRect();
        return { id: b.id, x: svg.x + svg.width / 2 - r.x - r.width / 2, y: svg.y + svg.height / 2 - r.y - r.height / 2 };
      })); check(entry.name + ": frame icon and stable hit area centers align within 0.1 CSS px", centers.every(c => Math.abs(c.x) <= .1 && Math.abs(c.y) <= .1), centers);
      await page.screenshot({ path: path.join(output, entry.name + ".png") });
      await page.evaluate(() => { window.retiredFramePlanes = [...document.querySelectorAll("[data-frame-region-motion], .v-frame-toggle-ink, .v-layout-toggle-ink")]; window.retiredLayoutButton = document.querySelector("#layout-left"); });
      await page.getByRole("button", { name: "返回插件配置", exact: true }).click();
      check(entry.name + ": return releases actual layout and frame native tracks", await page.locator("#app > *").count() === 0 && await page.evaluate(() => window.retiredFramePlanes.every(n => !n.isConnected && n.getAnimations().length === 0)));
      await page.locator("#startup-open").click(); await page.waitForSelector(".core-score-view svg"); await raf(page);
      check(entry.name + ": clean restart ignores old detached switch and rebinds new local targets", await page.evaluate(() => {
        const now = document.querySelector("#layout-left"), before = now.getAttribute("aria-pressed"); window.retiredLayoutButton.click();
        return now !== window.retiredLayoutButton && before === now.getAttribute("aria-pressed") && document.querySelectorAll(".v-layout-toggle-ink").length === 4 && document.getAnimations().length === 0;
      }));
      await page.getByRole("button", { name: "返回插件配置", exact: true }).click();
    } finally { await context.close(); }
  }
}
async function isolation(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(); watch(page, "two complete runtimes");
  try {
    await setup(page);
    await page.evaluate(async () => {
      const { createBackupUiRuntime } = await import("./src/host/backup-ui-runtime.js"), { createMotionAnimationProvider } = await import("./src/runtime/motion-animation-provider.js");
      const root = document.createElement("main"); root.id = "visible-second"; root.style.cssText = "position:fixed;inset:0;visibility:hidden;z-index:999"; document.body.append(root);
      const native = createMotionAnimationProvider(); window.secondVisibleJobs = [];
      window.secondVisibleRuntime = createBackupUiRuntime({ root, animationPolicy: { mode: "slow" }, animationProvider: {
        name: native.name, start(args) { const control = native.start(args); window.secondVisibleJobs.push({ ...args, control }); return control; },
      } });
      window.secondLayoutInput = root.querySelector("#layout-size-left");
    }); await idle(page); await raf(page);
    check("two complete runtimes: masks and target nodes are instance-local", await page.evaluate(() => {
      const a = document.querySelector("#app .v-layout-selection-window"), b = document.querySelector("#visible-second .v-layout-selection-window");
      return a !== b && document.querySelector("#app .v-layout-arrange-active-copy").style.clipPath !== document.querySelector("#visible-second .v-layout-arrange-active-copy").style.clipPath && document.querySelectorAll(".v-layout-toggle-ink").length === 8 && window.secondVisibleRuntime.motion.snapshot().targets === window.__backupUiRuntime.motion.snapshot().targets;
    }));
    await page.locator("#app #layout-left").click(); await toggleMiddle(page, "#app #layout-left .v-layout-toggle-ink");
    await page.evaluate(() => { document.querySelector("#visible-second").style.visibility = "visible"; }); await page.locator("#visible-second #region-left").click();
    await toggleMiddle(page, "#visible-second #region-left .v-frame-toggle-ink");
    const retired = await page.evaluate(() => {
      const a = window.__backupUiRuntime, b = window.secondVisibleRuntime, accepted = b.workspace.snapshot(), before = b.motion.snapshot();
      const nodes = [...document.querySelectorAll("#app .v-frame-toggle-ink, #app .v-layout-toggle-ink, #app [data-frame-region-motion]")];
      a.dispose(); for (const j of window.visibleJobs) { j.write(j.to); j.failed(new Error("retired runtime")); j.complete(); }
      return { before, a: a.motion.snapshot(), b: b.motion.snapshot(), same: accepted === b.workspace.snapshot(), retiredNative: nodes.reduce((s, n) => s + n.getAnimations().length, 0), inputSame: window.secondLayoutInput === document.querySelector("#visible-second #layout-size-left") };
    }); check("two complete runtimes: disposal and late callbacks cannot cancel or mutate the other active frame/control instance", retired.before.active > 0 && retired.b.active > 0 && retired.a.targets === 0 && retired.a.components === 0 && retired.retiredNative === 0 && retired.same && retired.inputSame, retired);
    await page.waitForFunction(() => window.secondVisibleRuntime.motion.snapshot().active === 0);
    check("two complete runtimes: remaining scope and final native tracks release to zero", await page.evaluate(() => {
      const r = window.secondVisibleRuntime; r.dispose(); document.querySelector("#visible-second").remove();
      return r.motion.snapshot().targets === 0 && r.motion.snapshot().components === 0 && document.getAnimations().length === 0;
    }));
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" }); report.browser = browser.version();
  try { await esm(browser); await isolation(browser); await generated(browser); } catch (error) { report.errors.push({ message: error.stack }); }
  finally { await browser.close(); check("no unexpected browser errors", report.errors.length === 0, report.errors);
    report.passed = report.checks.filter(c => c.passed).length; report.failed = report.checks.filter(c => !c.passed);
    fs.writeFileSync(path.join(output, "formal-visible-browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, total: report.checks.length, failed: report.failed, errors: report.errors }));
    if (report.failed.length || report.errors.length) process.exitCode = 1;
  }
})();
