const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = path.resolve(__dirname, "../evidence/layout-formal-engineering-20261007");
const base = "http://127.0.0.1:5193/";
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = [], requests = [], checks = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => requests.push(request.url()));
  const check = (name, passed, detail = null) => checks.push({ name, passed: !!passed, detail });
  const read = () => page.evaluate(() => {
    const runtime = window.__backupUiRuntime;
    const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; };
    return { state: runtime.workspace.snapshot(), motion: runtime.motion.snapshot(), plugins: runtime.plugins.snapshot().map(item => ({ id: item.manifest.id, version: item.manifest.apiVersion, active: item.active })),
      paper: rect(".v-paper"), stage: rect(".v-stage"), left: rect(".v-left"), right: rect(".v-right"), map: rect(".v-layout-map"),
      controls: [...document.querySelectorAll(".v-layout-region-size-row")].map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      regions: [...document.querySelectorAll(".v-map-region")].map(node => ({ id: [...node.classList].find(name => /^v-map-(left|right|top|voice)$/.test(name)), opacity: Number(getComputedStyle(node.querySelector(".v-map-region-ink")).opacity) })),
      svg: document.querySelectorAll(".core-score-view svg").length, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
  const idle = () => page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().active === 0);
  const same = (a, b) => Object.keys(a).every(key => Math.abs(a[key] - b[key]) < .1);
  try {
    await page.goto(base + "runtime-preview.html", { waitUntil: "networkidle" });
    await page.waitForSelector(".core-score-view svg");
    const initial = await read();
    check("actual preview registers layout/frame/score under one formal 4.0 path", ["frame.builtin", "frame.layout", "notation.core"].every(id => initial.plugins.some(item => item.id === id && item.version === "4.0" && item.active)), initial.plugins);
    check("formal layout owns exactly four local granted targets", initial.motion.targets === 4 && initial.svg > 0, initial.motion);
    check("pinned provider is selected in the actual composition", initial.motion.provider === "Motion 14.0.0");
    await page.screenshot({ path: path.join(output, "formal-initial-1440.png") });
    await page.locator("#layout-left").click();
    const accepted = await read();
    check("pointer state and semantic flag commit before local opacity finishes", accepted.state.leftOpen && accepted.motion.active > 0 && await page.locator("#layout-left").getAttribute("aria-pressed") === "true", accepted.motion);
    await page.waitForFunction(() => { const v = Number(getComputedStyle(document.querySelector(".v-map-left .v-map-region-ink")).opacity); return v > .001 && v < .999; });
    const middle = await read();
    check("actual layout renders intermediate author-owned local opacity", middle.regions.some(item => item.id === "v-map-left" && item.opacity > 0 && item.opacity < 1), middle.regions);
    await page.locator("#layout-left").click(); await idle();
    const reversed = await read();
    check("rapid reverse settles latest accepted state without moving the diagram or controls", !reversed.state.leftOpen && same(initial.map, reversed.map) && JSON.stringify(initial.controls) === JSON.stringify(reversed.controls));
    check("reversal returns the paper and viewport geometry to baseline", same(initial.paper, reversed.paper) && same(initial.stage, reversed.stage));
    await page.locator("#layout-left").focus(); await page.keyboard.press("Enter");
    check("keyboard changes region immediately without animation work", (await read()).state.leftOpen && (await read()).motion.active === 0);
    await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.region.toggle", { region: "left" }));
    check("programmatic commands remain immediate", (await read()).motion.active === 0);
    await context.setDefaultTimeout(5000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().mode === "reduced");
    await page.locator("#layout-left").click(); await idle();
    check("system reduced preference is consumed by the actual host", (await read()).motion.mode === "reduced");
    await page.evaluate(() => window.__backupUiRuntime.motion.setPolicy({ mode: "none" }));
    await page.locator("#layout-left").click(); check("off policy leaves the actual controls functional and static", (await read()).motion.active === 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => window.__backupUiRuntime.motion.setPolicy({ mode: "slow" }));
    await page.locator("#layout-left").click();
    await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.page.select", { id: "frame.builtin.properties", toggle: false }));
    check("hiding the real layout page cancels current work", (await read()).motion.active === 0);
    await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.page.select", { id: "frame.layout.page", toggle: false }));
    await page.locator("#layout-left").click();
    await page.evaluate(() => { document.querySelector("#app").hidden = true; });
    await page.waitForFunction(() => !window.__backupUiRuntime.motion.snapshot().visible);
    check("whole-workspace hidden state cancels without disposal", (await read()).motion.active === 0 && (await read()).motion.targets === 4);
    await page.evaluate(() => { document.querySelector("#app").hidden = false; });
    await page.waitForFunction(() => window.__backupUiRuntime.motion.snapshot().visible);
    await page.evaluate(() => window.__backupUiRuntime.motion.replaceProvider(null));
    await page.locator("#layout-left").click(); check("optional provider absence remains immediately usable", (await read()).motion.provider === null && (await read()).motion.active === 0);
    for (const size of [{ width: 1024, height: 720 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => { const r = window.__backupUiRuntime; r.execute("frame.workspace.arrange", { mode: "default" }); if (!r.workspace.snapshot().leftOpen) r.execute("frame.workspace.region.toggle", { region: "left" }); });
      const before = await read();
      await page.evaluate(() => window.__backupUiRuntime.execute("frame.workspace.region.resize", { side: "left", value: 420 }));
      const resized = await read();
      check(`${size.width}: host geometry stays non-overlapping and within capacity`, resized.left.x + resized.left.width <= resized.stage.x + .1 && resized.stage.x + resized.stage.width <= resized.right.x + .1 && resized.stage.width >= 480 - .1 && !resized.overflow, resized);
      check(`${size.width}: resizing one side leaves the other stored size intact`, resized.state.rightWidth === before.state.rightWidth && resized.motion.active === 0);
      await page.screenshot({ path: path.join(output, `formal-geometry-${size.width}.png`) });
    }
    const disposed = await page.evaluate(() => { const r = window.__backupUiRuntime; r.dispose(); return { children: document.querySelector("#app").children.length, motion: r.motion.snapshot() }; });
    check("normal formal preview disposal cleans targets, work and DOM", disposed.children === 0 && disposed.motion.targets === 0 && disposed.motion.active === 0 && disposed.motion.components === 0, disposed);

    // A second formal package with a private button and both shortcut scopes
    // proves animation setup does not change the original command path.
    await page.evaluate(async () => {
      const { definePlugin } = await import("./src/vendor/plugin-platform.js");
      const { createBackupUiRuntime } = await import("./src/host/backup-ui-runtime.js");
      window.probeCount = 0;
      const plugin = definePlugin({ id: "browser.panel", name: "Panel", version: "0.1.0", apiVersion: "4.0", ui: {
        contractVersion: 1, components: [{ id: "browser.panel.content", title: "Panel", role: "tool", uiKind: "panel", defaultEnabled: true, defaultSlot: "left", slots: ["left", "right"], permissions: { commands: ["browser.panel.run"] },
          mount(element, ctx) { window.probeContext = ctx; const button = document.createElement("button"); button.id = "probe-button"; button.textContent = "Run"; button.onclick = () => ctx.execute("browser.panel.run"); element.append(button); } }],
        commands: [{ id: "browser.panel.run", keys: ["Mod+M"], run() { return { ok: true, count: ++window.probeCount }; } }],
        shortcuts: [{ id: "browser.panel.local", command: "browser.panel.run", keys: ["Alt+J"], scope: "component", componentId: "browser.panel.content" }],
      } });
      window.__backupUiRuntime = createBackupUiRuntime({ root: document.querySelector("#app"), plugins: [plugin] });
      window.__backupUiRuntime.execute("frame.workspace.region.toggle", { region: "left" });
    });
    await page.locator("#probe-button").click(); await page.keyboard.press("Alt+J"); await page.keyboard.press("Control+M");
    check("ordinary formal panel button/local/global shortcut each executes once with animations installed", await page.evaluate(() => window.probeCount === 3), await page.evaluate(() => window.probeCount));
    check("ordinary panel receives only requested capabilities", await page.evaluate(() => window.probeContext.motion === undefined && window.probeContext.router === undefined && window.probeContext.platform === undefined));
    await page.evaluate(() => window.__backupUiRuntime.dispose());
    check("all browser requests remain inside the current backup UI", requests.every(url => url.startsWith(base)), requests.filter(url => !url.startsWith(base)));
    check("no real browser startup/runtime error", errors.length === 0, errors);
    const report = { at: new Date().toISOString(), browser: browser.version(), checks, errors, requests };
    fs.writeFileSync(path.join(output, "formal-browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ total: checks.length, failed: checks.filter(check => !check.passed), errors }));
    if (errors.length || checks.some(check => !check.passed)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
