// Tests the actual formal runtime and generated entries. No review executor.
const fs = require("node:fs"), path = require("node:path"), { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."), output = path.join(root, "evidence/layout-preview-formal-shape-20261007");
const base = "http://127.0.0.1:5193/", report = { at: new Date().toISOString(), checks: [], frames: [], errors: [] };
fs.mkdirSync(output, { recursive: true });
const check = (name, passed, detail) => report.checks.push({ name, passed: !!passed, detail });
const near = (a, b, tolerance = .025) => Object.keys(a).every(key => Math.abs(a[key] - b[key]) < tolerance);
const coherentTracks = tracks => {
  const groups = new Map();
  for (const t of tracks) { const group = groups.get(t.target) ?? []; group.push(t); groups.set(t.target, group); }
  return groups.size > 0 && [...groups.values()].every(group => group.length === 3
    && ["transform", "clipPath", "opacity"].every(key => group.filter(t => t.frames.every(f => Object.hasOwn(f, key))).length === 1)
    && group.every(t => Math.abs(t.duration - group[0].duration) < .001 && t.ease === group[0].ease && t.startTime === group[0].startTime
      && t.frames.every(f => !["width", "height", "top", "left", "scale"].some(key => Object.hasOwn(f, key)))));
};
const idle = async page => {
  // The author view may defer its accepted container measurement one frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active === 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const observe = (page, name) => {
  page.on("pageerror", error => report.errors.push({ name, message: error.message }));
  page.on("console", message => { if (message.type() === "error") report.errors.push({ name, message: message.text() }); });
  page.on("requestfailed", request => report.errors.push({ name, url: request.url(), failure: request.failure() }));
};
const read = page => page.evaluate(() => {
  const r = window.__backupUiRuntime, app = document.querySelector("#app"), canvas = app.querySelector(".v-layout-map-canvas");
  const box = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  const shapes = Object.fromEntries(["top", "left", "right", "voice", "stage"].map(side => {
    const node = canvas.querySelector(".v-map-" + side), style = getComputedStyle(node), m = new DOMMatrixReadOnly(style.transform);
    const edges = style.clipPath.slice(6).split("round")[0].match(/[\d.]+/g).map(Number);
    return [side, { x: m.m41, y: m.m42, width: 512 - edges[1], height: 512 - edges[2], opacity: Number(style.opacity) }];
  }));
  const state = r.workspace.snapshot(), keys = { left: "leftWidth", right: "rightWidth", top: "topHeight", voice: "voiceHeight" };
  return { state, motion: r.motion.snapshot(), shapes, expected: window.shapeProject({
    sizes: Object.fromEntries(Object.entries(keys).map(([side, key]) => [side, state[key]])),
    regions: Object.fromEntries(Object.keys(keys).map(side => [side, state[side + "Open"]])),
  }, canvas.clientWidth, canvas.clientHeight), paper: box(app.querySelector(".v-paper")),
  ink: app.querySelectorAll(".v-map-region-ink").length,
  planes: [...canvas.children].map(node => { const s = getComputedStyle(node); return { width: s.width, height: s.height, border: s.borderWidth }; }),
  tracks: [...canvas.children].flatMap(node => node.getAnimations().map(animation => ({
    target: node.className, state: animation.playState, duration: animation.effect.getTiming().duration,
    ease: animation.effect.getTiming().easing, startTime: animation.startTime,
    frames: animation.effect.getKeyframes(),
  }))), controls: Object.keys(keys).map(side => { const range = app.querySelector("#layout-range-" + side), input = app.querySelector("#layout-size-" + side);
    return { side, value: Number(range.value), number: Number(input.value), min: Number(range.min), max: Number(range.max), disabled: range.disabled,
      pressed: app.querySelector("#layout-" + side).getAttribute("aria-pressed") }; }),
  overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
});
const verify = (name, v) => {
  check(name + ": complete shapes equal accepted projection", Object.keys(v.shapes).every(side => near(v.shapes[side], v.expected[side])), { actual: v.shapes, expected: v.expected });
  const keys = { left: "leftWidth", right: "rightWidth", top: "topHeight", voice: "voiceHeight" };
  check(name + ": controls equal host state and dynamic limits", v.controls.every(c => c.value === v.state[keys[c.side]] && c.number === c.value && c.disabled === !v.state[c.side + "Open"] && c.pressed === String(v.state[c.side + "Open"]) && c.min >= 0 && c.max === v.state.valueLimits[c.side]), v.controls);
};
// Baseline follows the business action and a forced layout read. Subsequent
// samples test only presentation; accepted host geometry may legitimately move.
const recordAction = (page, selector) => page.evaluate(selector => {
  document.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  window.shapeBeginRecord();
}, selector);
const stopRecord = async (page, name) => {
  const result = await page.evaluate(() => { const f = window.shapeFrames; f.running = false;
    return { samples: f.samples.length, coupledFrames: f.progress.length, progressSpread: Math.max(0, ...f.progress),
      drift: Object.fromEntries(Object.keys(f.baseline).map(key => [key, Math.max(0, ...f.samples.map(r => Math.abs(r[key] - f.baseline[key])))])) }; });
  report.frames.push({ name, ...result });
  check(name + ": score has zero subsequent frame drift", result.samples > 0 && Object.values(result.drift).every(v => v === 0), result);
  if (result.coupledFrames) check(name + ": changing rectangle axes and opacity share frame progress", result.progressSpread < .015, result);
};
async function setup(page) {
  await page.goto(base + "runtime-preview.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".core-score-view svg");
  await page.evaluate(async () => {
    const { projectLayoutPreview } = await import("./src/shell/workspace-layout-preview-geometry.js");
    window.shapeProject = projectLayoutPreview;
    window.shapeRecipe = (await import("./src/features/workspace-layout-motion-recipes.js")).LAYOUT_PREVIEW_SHAPE;
    const { createMotionAnimationProvider } = await import("./src/runtime/motion-animation-provider.js");
    const provider = createMotionAnimationProvider(); window.shapeJobs = [];
    // Observe the existing formal provider, without changing its execution.
    window.shapeProvider = { name: provider.name, start(args) { const control = provider.start(args); window.shapeJobs.push({ ...args, control }); return control; } };
    window.shapeBeginRecord = () => {
      const rect = () => { const r = document.querySelector("#app .v-paper").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const f = { baseline: rect(), samples: [], progress: [], running: true }; window.shapeFrames = f;
      const sample = () => {
        if (!f.running) return; f.samples.push(rect());
        for (const j of window.shapeJobs.filter(j => j.isCurrent())) {
          const s = getComputedStyle(j.node), m = new DOMMatrixReadOnly(s.transform), edges = s.clipPath.slice(6).split("round")[0].match(/[\d.]+/g).map(Number);
          const value = { x: m.m41, y: m.m42, width: 512 - edges[1], height: 512 - edges[2], opacity: Number(s.opacity) };
          const progress = Object.keys(value).filter(k => Math.abs(j.to[k] - j.from[k]) > .01).map(k => (value[k] - j.from[k]) / (j.to[k] - j.from[k]));
          if (progress.length > 1 && progress.some(p => p > .01 && p < .99)) f.progress.push(Math.max(...progress) - Math.min(...progress));
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    window.__backupUiRuntime.motion.replaceProvider(window.shapeProvider);
    window.__backupUiRuntime.motion.setPolicy({ mode: "slow", profile: "continuous" });
    await document.fonts.ready;
  });
  await idle(page);
}
async function esm(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(); observe(page, "formal-esm");
  try {
    await setup(page); const initial = await read(page);
    check("formal registered runtime owns five shapes without old ink", initial.motion.targets === 5 && initial.ink === 0 && initial.motion.provider === "Motion 14.0.0", initial.motion);
    check("all five local targets remain empty fixed 512px planes", initial.planes.length === 5 && initial.planes.every(p => p.width === "512px" && p.height === "512px" && p.border === "0px") && await page.evaluate(() => [...document.querySelector(".v-layout-map-canvas").children].every(n => n.children.length === 0 && n.textContent === "")), initial.planes);
    check("formal packages use the same active 4.0 platform", await page.evaluate(() => ["frame.builtin", "frame.layout", "notation.core"].every(id => window.__backupUiRuntime.plugins.snapshot().some(p => p.manifest.id === id && p.manifest.apiVersion === "4.0" && p.active))));
    verify("initial", initial); await page.screenshot({ path: path.join(output, "formal-initial-1440.png") });
    await page.locator("#layout-left").click();
    await page.waitForFunction(() => { const s = getComputedStyle(document.querySelector(".v-map-left")); return Number(s.opacity) > .3 && Number(s.opacity) < .97; });
    const middle = await read(page), from = initial.shapes.left, to = middle.expected.left;
    const p = (middle.shapes.left.width - from.width) / (to.width - from.width);
    check("actual accepted state precedes intermediate native rectangle", middle.state.leftOpen && middle.motion.active > 0 && p > 0 && p < 1, middle.shapes.left);
    check("opacity and changing rectangle axes share the same progress", Math.abs((middle.shapes.left.opacity - from.opacity) / (to.opacity - from.opacity) - p) < .015, { progress: p, shape: middle.shapes.left });
    check("native rectangle tracks share timing/ease/startTime on a fixed plane", middle.tracks.length === 6 && coherentTracks(middle.tracks) && middle.tracks.every(t => Math.abs(t.duration - 700) < .001), middle.tracks);
    const reversal = await page.evaluate(async () => {
      const before = window.shapeJobs.length; document.querySelector("#layout-left").dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const jobs = window.shapeJobs.slice(before); return jobs.map(j => ({ from: j.from, to: j.to }));
    });
    check("rapid reverse starts from a sampled intermediate complete rectangle", reversal.some(j => j.from.width > 3 && j.from.width < to.width && ["x", "y", "width", "height", "opacity"].every(k => Number.isFinite(j.from[k]))), reversal);
    await page.screenshot({ path: path.join(output, "formal-reversal-1440.png") });
    await idle(page); verify("reversed", await read(page));
    for (const [profile, seconds] of [["continuous", .28], ["focused", .26], ["quiet", .14]]) {
      await page.evaluate(profile => { window.shapeJobs = []; window.__backupUiRuntime.motion.setPolicy({ mode: "slow", profile }); }, profile);
      await recordAction(page, "#layout-left");
      await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
      const jobs = await page.evaluate(() => window.shapeJobs.map(j => ({ intent: j.intent, settings: j.settings })));
      const authored = await page.evaluate(profile => window.shapeRecipe.variants[profile], profile);
      const tracks = (await read(page)).tracks;
      check(profile + ": consumes exact authored duration/ease", jobs.length === 2 && jobs.every(j => j.intent === "shape-transition" && j.settings.duration === seconds && j.settings.multiplier === 2.5 && JSON.stringify(j.settings.ease) === JSON.stringify(authored.ease)) && coherentTracks(tracks) && tracks.every(t => Math.abs(t.duration - seconds * 2500) < .001), { jobs, tracks });
      await idle(page); await stopRecord(page, profile); verify(profile, await read(page));
    }
    await page.locator("#layout-left").focus(); await page.keyboard.press("Space");
    const keyboard = await read(page); check("keyboard immediately lands a meaningful rectangle", keyboard.motion.active === 0 && keyboard.tracks.length === 0 && keyboard.shapes.stage.x > 0); verify("keyboard", keyboard);
    await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.region.toggle", { region: "left" }));
    check("programmatic command is immediate", (await read(page)).motion.active === 0); verify("program", await read(page));
    for (const mode of ["none", "reduced"]) {
      await page.evaluate(mode => window.__backupUiRuntime.motion.setPolicy({ mode }), mode);
      await page.locator("#layout-top").click(); const v = await read(page);
      check(mode + ": no native tracks and no coordinate zeroing", v.motion.active === 0 && v.tracks.length === 0 && v.shapes.stage.y > 0); verify(mode, v);
    }
    await page.evaluate(() => window.__backupUiRuntime.motion.setPolicy({ mode: "full" }));
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().mode === "reduced");
    await page.locator("#layout-left").click(); const system = await read(page);
    check("system reduction remains immediate with full meaningful geometry", system.motion.active === 0 && system.tracks.length === 0); verify("system reduction", system);
    await page.emulateMedia({ reducedMotion: "no-preference" }); await page.evaluate(() => window.__backupUiRuntime.motion.setPolicy({ mode: "slow", profile: "continuous" }));
    await page.evaluate(() => { const r = window.__backupUiRuntime; window.shapeJobs = []; window.shapeFaults = [];
      r.motion.replaceProvider({ name: "controlled current failure", start(args) { const control = window.shapeProvider.start(args); window.shapeFaults.push({ ...args, control }); return control; } }); });
    await page.locator("#layout-left").click();
    await page.waitForFunction(() => window.shapeFaults.length === 2 && window.__backupUiRuntime.motion.snapshot().active > 0);
    const fault = await page.evaluate(() => { const r = window.__backupUiRuntime, accepted = r.workspace.snapshot();
      window.shapeFaults.forEach(j => j.failed(new Error("controlled shape fault"))); const before = document.querySelector("#app").innerHTML;
      window.shapeFaults.forEach(j => { j.write(j.from); j.complete(); j.failed(new Error("late shape fault")); });
      return { unchanged: before === document.querySelector("#app").innerHTML, stateSame: r.workspace.snapshot() === accepted, jobs: window.shapeFaults.length }; });
    check("current failures settle every job; retired callbacks do not mutate business or DOM", fault.jobs === 2 && fault.unchanged && fault.stateSame && (await read(page)).motion.active === 0, fault); verify("current failure", await read(page));
    await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(window.shapeProvider));
    await page.locator("#layout-left").click();
    await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
    await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(null));
    check("provider removal cancels all native work", (await read(page)).motion.active === 0 && (await read(page)).tracks.length === 0); verify("provider removed", await read(page));
    await page.locator("#layout-left").click(); check("absent provider is statically usable", (await read(page)).motion.active === 0); verify("absent provider", await read(page));
    await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(window.shapeProvider));
    await page.locator("#layout-left").click();
    await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
    await page.evaluate(() => { window.oldShapeCanvas = document.querySelector(".v-layout-map-canvas"); window.__backupUiRuntime.execute("frame.workspace.page.select", { id: "frame.builtin.properties", toggle: false }); });
    check("page hidden cancels native tracks and keeps five claims", await page.evaluate(() => window.__backupUiRuntime.motion.snapshot().active === 0 && window.__backupUiRuntime.motion.snapshot().targets === 5 && [...window.oldShapeCanvas.children].every(n => n.getAnimations().length === 0)));
    await page.evaluate(() => { const r = window.__backupUiRuntime; r.execute("frame.workspace.region.resize", { side: "left", value: 400 }); r.execute("frame.workspace.page.select", { id: "frame.layout.page", toggle: false }); }); await idle(page);
    check("restoration keeps the mounted canvas without replay", await page.evaluate(() => window.oldShapeCanvas === document.querySelector(".v-layout-map-canvas")) && (await read(page)).motion.active === 0); verify("restored hidden size", await read(page));
    await page.locator("#layout-left").click(); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
    await page.evaluate(() => { document.querySelector("#app").hidden = true; });
    await page.waitForFunction(() => !window.__backupUiRuntime.motion.snapshot().visible);
    check("hidden workspace cancels native tracks", await page.evaluate(() => document.getAnimations().length === 0 && window.__backupUiRuntime.motion.snapshot().active === 0));
    await page.evaluate(() => { document.querySelector("#app").hidden = false; }); await idle(page); verify("workspace restored", await read(page));
    await page.evaluate(() => { const canvas = document.querySelector(".v-layout-map-canvas"), cell = canvas.closest(".component-cell");
      window.shapeMovedCell = cell; window.shapeMovedParent = cell.parentElement; const holder = document.createElement("div"); window.shapeMovedParent.append(holder); holder.append(cell); window.shapeMovedHolder = holder; });
    await idle(page); await page.locator("#layout-left").click(); await idle(page);
    check("moving the actual persistent cell preserves instance and claims", await page.evaluate(() => window.shapeMovedCell.contains(document.querySelector(".v-layout-map-canvas")) && window.__backupUiRuntime.motion.snapshot().targets === 5));
    await page.evaluate(() => { window.shapeMovedParent.append(window.shapeMovedCell); window.shapeMovedHolder.remove(); }); await idle(page); verify("cell returned", await read(page));
    await page.locator("#layout-left").click(); await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active > 0);
    await page.locator("#region-right").click();
    check("closing the layout region stops all native work", await page.evaluate(() => window.__backupUiRuntime.motion.snapshot().active === 0 && [...window.oldShapeCanvas.children].every(n => n.getAnimations().length === 0)));
    await page.locator("#region-right").click(); await idle(page); verify("region reopened", await read(page));
    const released = await page.evaluate(() => { const r = window.__backupUiRuntime; r.dispose(); return { motion: r.motion.snapshot(), children: document.querySelector("#app").children.length, native: document.getAnimations().length }; });
    check("final formal release leaves no claims, native tracks or DOM", released.children === 0 && released.motion.targets === 0 && released.motion.active === 0 && released.motion.components === 0 && released.native === 0, released);
  } finally { await context.close(); }
}

async function geometry(browser) {
  for (const [width, height, dpr] of [[1440, 900, 1], [1280, 720, 1.5], [800, 600, 2]]) {
    const name = `${width}x${height}@${dpr}`, context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr }), page = await context.newPage(); observe(page, name);
    try {
      await setup(page); check(name + ": five registered shapes without overflow", (await read(page)).motion.targets === 5 && !(await read(page)).overflow);
      for (const selector of ["#layout-left", "#layout-top", "#layout-voice", "#layout-compact", "#layout-balanced", "#layout-default"]) {
        await recordAction(page, selector); await idle(page); await stopRecord(page, name + "/" + selector); verify(name + "/" + selector, await read(page));
      }
      await page.evaluate(() => { const r = window.__backupUiRuntime; for (const side of ["left", "right", "top", "voice"]) if (!r.workspace.snapshot()[side + "Open"]) r.execute("frame.workspace.region.toggle", { region: side }); }); await idle(page);
      for (const side of ["left", "right", "top", "voice"]) {
        const before = await read(page), c = before.controls.find(c => c.side === side);
        const changed = await page.evaluate(({ side, value }) => {
          const range = document.querySelector("#layout-range-" + side); range.value = String(value); range.dispatchEvent(new Event("input", { bubbles: true }));
          return window.__backupUiRuntime.workspace.snapshot();
        }, { side, value: c.max });
        await page.evaluate(() => window.shapeBeginRecord()); await idle(page); await stopRecord(page, name + "/range " + side);
        const v = await read(page); verify(name + "/range " + side, v);
        const keys = { left: "leftWidth", right: "rightWidth", top: "topHeight", voice: "voiceHeight" }, peer = { left: "right", right: "left", top: "voice", voice: "top" };
        check(name + "/range " + side + ": immediate max with independent peer", v.motion.active === 0 && v.tracks.length === 0 && changed[keys[side]] === c.max && changed[keys[peer[side]]] === before.state[keys[peer[side]]], { before: before.controls, after: v.controls });
        await page.locator("#layout-size-" + side).fill(String(c.min));
        await page.evaluate(() => window.shapeBeginRecord()); await idle(page); await stopRecord(page, name + "/number " + side);
        const number = await read(page); verify(name + "/number " + side, number);
        check(name + "/number " + side + ": immediate minimum", number.state[keys[side]] === c.min && number.motion.active === 0 && number.tracks.length === 0);
      }
      for (const side of ["left", "right"]) {
        const range = page.locator("#layout-range-" + side); await range.scrollIntoViewIfNeeded();
        const before = await read(page), c = before.controls.find(c => c.side === side), box = await range.boundingBox();
        const start = c.max === c.min ? 0 : (c.value - c.min) / (c.max - c.min);
        await page.mouse.move(box.x + 3 + (box.width - 6) * start, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
        await page.evaluate(() => window.shapeBeginRecord()); await idle(page); await stopRecord(page, name + "/pointer drag " + side);
        const v = await read(page), key = side + "Width", peerKey = (side === "left" ? "right" : "left") + "Width";
        verify(name + "/pointer drag " + side, v);
        check(name + "/pointer drag " + side + ": native slider reaches the allowed maximum without peer mutation or motion", v.state[key] === c.max && v.state[peerKey] === before.state[peerKey] && v.motion.active === 0 && v.tracks.length === 0, { before: before.controls, after: v.controls });
      }
      await page.screenshot({ path: path.join(output, name + "-layout.png") });
      await page.setViewportSize({ width: width + 40, height: height + 40 }); await idle(page);
      check(name + ": window resize is static", (await read(page)).tracks.length === 0); verify(name + "/resize", await read(page));
    } finally { await context.close(); }
  }
}

async function isolation(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(); observe(page, "two runtimes");
  try {
    await setup(page);
    await page.evaluate(async () => {
      const { createBackupUiRuntime } = await import("./src/host/backup-ui-runtime.js");
      const second = document.createElement("main"); second.id = "shape-second"; second.style.cssText = "position:fixed;inset:0;visibility:hidden"; document.body.append(second);
      window.secondShapeRuntime = createBackupUiRuntime({ root: second, animationPolicy: { mode: "slow" } });
    }); await idle(page);
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#shape-second .v-layout-map-canvas");
      return canvas.clientWidth >= 32 && getComputedStyle(canvas.querySelector(".v-map-left")).clipPath !== "none";
    });
    await page.locator("#app #layout-left").click();
    const isolated = await page.evaluate(async () => { const a = window.__backupUiRuntime, b = window.secondShapeRuntime;
      const before = b.workspace.snapshot(); document.querySelector("#shape-second #layout-left").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const aState = a.workspace.snapshot(), beforeDispose = b.motion.snapshot(); a.dispose();
      return { different: before !== b.workspace.snapshot(), aState, bState: b.workspace.snapshot(), beforeDispose, a: a.motion.snapshot(), b: b.motion.snapshot() }; });
    check("two full formal runtimes isolate same shape names and disposal", isolated.different && isolated.a.targets === 0 && isolated.b.targets === 5 && isolated.b.active > 0, isolated);
    await page.waitForFunction(() => window.secondShapeRuntime.motion.snapshot().active === 0);
    check("remaining runtime and final release leave no native tracks", await page.evaluate(() => { const b = window.secondShapeRuntime; b.dispose(); document.querySelector("#shape-second").remove(); return b.motion.snapshot().targets === 0 && document.getAnimations().length === 0; }));
  } finally { await context.close(); }
}

async function generated(browser) {
  for (const entry of [{ name: "classic-file", url: pathToFileURL(path.join(root, "plugin-startup-config-static-preview.html")).href },
    { name: "desktop-assets", url: base + "dist/desktop/index.html" }]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage(); observe(page, entry.name);
    try {
      await page.goto(entry.url, { waitUntil: "networkidle" }); await page.locator("#startup-open").click(); await page.waitForSelector(".core-score-view svg");
      const sample = () => page.evaluate(() => { const canvas = document.querySelector(".v-layout-map-canvas"), node = canvas.querySelector(".v-map-left"), s = getComputedStyle(node);
        const m = new DOMMatrixReadOnly(s.transform), edges = s.clipPath.slice(6).split("round")[0].match(/[\d.]+/g).map(Number);
        return { shapes: canvas.children.length, ink: canvas.querySelectorAll(".v-map-region-ink").length, pressed: document.querySelector("#layout-left").getAttribute("aria-pressed"),
          x: m.m41, y: m.m42, width: 512 - edges[1], height: 512 - edges[2], opacity: Number(s.opacity),
          tracks: node.getAnimations().map(a => ({ target: node.className, duration: a.effect.getTiming().duration,
            ease: a.effect.getTiming().easing, startTime: a.startTime, frames: a.effect.getKeyframes() })) }; });
      check(entry.name + ": actual generated startup binds five shapes", (await sample()).shapes === 5 && (await sample()).ink === 0 && await page.locator(".component-fault").count() === 0);
      await page.locator("#layout-left").click(); await page.waitForFunction(() => { const s = getComputedStyle(document.querySelector(".v-map-left")); return Number(s.opacity) > .3 && Number(s.opacity) < .97; });
      const middle = await sample(); check(entry.name + ": actual native shape consumes author 280ms", middle.pressed === "true" && middle.width > 3 && middle.opacity < 1 && coherentTracks(middle.tracks) && middle.tracks.every(t => t.duration === 280), middle);
      await page.locator("#layout-left").click(); await page.waitForFunction(() => document.querySelector(".v-map-left").getAnimations().length === 0);
      check(entry.name + ": reversal lands on collapsed seam", (await sample()).width === 3 && (await sample()).pressed === "false");
      await page.locator("#layout-left").focus(); await page.keyboard.press("Enter"); check(entry.name + ": keyboard is immediate", (await sample()).opacity === 1 && (await sample()).tracks.length === 0);
      await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(30); await page.locator("#layout-left").click();
      check(entry.name + ": system reduction is immediate geometry", (await sample()).width === 3 && (await sample()).tracks.length === 0 && (await sample()).y > 0);
      await page.emulateMedia({ reducedMotion: "no-preference" }); await page.waitForTimeout(30);
      await page.evaluate(() => { window.generatedShapeCanvas = document.querySelector(".v-layout-map-canvas"); window.generatedShapeButton = document.querySelector("#layout-left"); });
      await page.locator("#layout-left").click(); await page.locator('[id="page-tab-frame.plugins.diagnostics"]').click();
      check(entry.name + ": page hiding cancels all native shapes", await page.evaluate(() => [...window.generatedShapeCanvas.children].every(n => n.getAnimations().length === 0)));
      await page.locator('[id="page-tab-frame.layout.page"]').click();
      check(entry.name + ": page restoration retains actual canvas", await page.evaluate(() => window.generatedShapeCanvas === document.querySelector(".v-layout-map-canvas")));
      await page.screenshot({ path: path.join(output, entry.name + "-layout.png") });
      await page.getByRole("button", { name: "返回插件配置", exact: true }).click();
      check(entry.name + ": return releases DOM and native tracks", await page.locator("#app > *").count() === 0 && await page.evaluate(() => !window.generatedShapeCanvas.isConnected && [...window.generatedShapeCanvas.children].every(n => n.getAnimations().length === 0)));
      await page.locator("#startup-open").click(); await page.waitForSelector(".core-score-view svg");
      const restarted = await sample(); await page.evaluate(() => window.generatedShapeButton.click());
      check(entry.name + ": clean restart ignores retired input", restarted.pressed === "false" && JSON.stringify(await sample()) === JSON.stringify(restarted) && await page.evaluate(() => window.generatedShapeCanvas !== document.querySelector(".v-layout-map-canvas")));
    } finally { await context.close(); }
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" }); report.browser = browser.version();
  try { await esm(browser); await geometry(browser); await isolation(browser); await generated(browser); }
  catch (error) { report.errors.push({ message: error.stack }); }
  finally { await browser.close(); check("no unexpected browser errors", report.errors.length === 0, report.errors);
    report.passed = report.checks.filter(c => c.passed).length; report.failed = report.checks.filter(c => !c.passed);
    fs.writeFileSync(path.join(output, "formal-shape-browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, total: report.checks.length, failed: report.failed, errors: report.errors }));
    if (report.failed.length || report.errors.length) process.exitCode = 1;
  }
})();
