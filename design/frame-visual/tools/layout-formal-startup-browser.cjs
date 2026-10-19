const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "evidence/layout-formal-engineering-20261007");
const entries = [
  { name: "classic-file", url: pathToFileURL(path.join(root, "plugin-startup-config-static-preview.html")).href },
  { name: "desktop-assets", url: "http://127.0.0.1:5193/dist/desktop/index.html" },
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const checks = [], errors = [], requests = [];
  const check = (entry, name, passed, detail = null) => checks.push({ entry, name, passed: !!passed, detail });
  try {
    for (const entry of entries) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push({ entry: entry.name, message: error.message }));
      page.on("console", message => { if (message.type() === "error") errors.push({ entry: entry.name, message: message.text() }); });
      page.on("request", request => requests.push({ entry: entry.name, url: request.url() }));
      const ink = "#app .v-map-left .v-map-region-ink";
      const idle = () => page.waitForFunction(selector => document.querySelector(selector).getAnimations().every(animation => animation.playState !== "running"), ink);
      const sample = () => page.evaluate(selector => {
        const node = document.querySelector(selector);
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { pressed: document.querySelector("#layout-left").getAttribute("aria-pressed"), opacity: Number(getComputedStyle(node).opacity),
          tracks: node.getAnimations().map(animation => ({ duration: animation.effect.getTiming().duration, keyframes: animation.effect.getKeyframes() })),
          paper: box(".v-paper"), map: box(".v-layout-map"), stage: box(".v-stage") };
      }, ink);
      await page.goto(entry.url, { waitUntil: "networkidle" });
      check(entry.name, "classic manager loads its generated bundle and remains initially visible", await page.locator("#startup-open").isEnabled() && await page.locator("#startup-root").isVisible());
      await page.locator("#startup-open").click();
      await page.locator("#layout-left").waitFor({ state: "visible" });
      await page.waitForSelector(".core-score-view svg");
      check(entry.name, "actual fixed startup mounts layout, four local targets and the score without a component fault", await page.locator(".v-map-region-ink").count() === 4 && await page.locator(".component-fault").count() === 0);
      const baseline = await sample();
      await page.locator("#layout-left").click();
      await page.waitForFunction(selector => { const v = Number(getComputedStyle(document.querySelector(selector)).opacity); return v > .001 && v < .999; }, ink);
      const middle = await sample();
      check(entry.name, "classic actual pointer commits semantics and renders author opacity between endpoints", middle.pressed === "true" && middle.opacity > 0 && middle.opacity < 1, middle);
      check(entry.name, "classic opacity track consumes the declared 160ms entry parameter", middle.tracks.some(track => track.duration === 160 && track.keyframes.some(frame => Object.hasOwn(frame, "opacity"))), middle.tracks);
      await page.locator("#layout-left").click(); await idle();
      const reversed = await sample();
      check(entry.name, "reverse returns diagram and paper geometry to the clean baseline", reversed.pressed === "false" && reversed.opacity === 0 && JSON.stringify(reversed.paper) === JSON.stringify(baseline.paper) && JSON.stringify(reversed.map) === JSON.stringify(baseline.map));
      await page.locator("#layout-left").focus(); await page.keyboard.press("Enter");
      const keyboard = await sample();
      check(entry.name, "classic keyboard command stays immediate", keyboard.pressed === "true" && keyboard.opacity === 1 && keyboard.tracks.length === 0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator("#layout-left").click();
      await page.waitForFunction(selector => document.querySelector(selector).getAnimations().length > 0, ink);
      const reduced = await sample();
      check(entry.name, "classic host consumes the system reduced policy as 100ms local opacity", reduced.tracks.some(track => track.duration === 100 && track.keyframes.some(frame => Object.hasOwn(frame, "opacity"))), reduced.tracks);
      await idle(); await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(selector => { window.classicOldInk = document.querySelector(selector); window.classicOldButton = document.querySelector("#layout-left"); }, ink);
      await page.locator("#layout-left").click();
      await page.locator('[id="page-tab-frame.plugins.diagnostics"]').click();
      const hidden = await page.evaluate(() => ({ tracks: window.classicOldInk.getAnimations().map(animation => animation.playState),
        packages: [...document.querySelectorAll(".plugin-status-name")].map(node => node.textContent).sort() }));
      check(entry.name, "hiding layout cancels its live tracks and the current platform lists the fixed packages", hidden.tracks.length === 0 && hidden.packages.join("|") === ["frame.builtin", "frame.layout", "frame.plugins", "notation.core"].join("|"), hidden);
      await page.locator('[id="page-tab-frame.layout.page"]').click();
      check(entry.name, "restoring the actual layout page preserves its mounted nodes", await page.evaluate(selector => document.querySelector(selector) === window.classicOldInk && document.querySelector("#layout-left") === window.classicOldButton, ink));
      await page.screenshot({ path: path.join(output, `${entry.name}-layout-1440.png`) });
      await page.getByRole("button", { name: "返回插件配置", exact: true }).click();
      check(entry.name, "preview return completely releases workspace DOM and old animation tracks", await page.locator("#startup-root").isVisible() && await page.locator("#app > *").count() === 0 && await page.evaluate(() => !window.classicOldInk.isConnected && window.classicOldInk.getAnimations().length === 0));
      await page.locator("#startup-open").click(); await page.waitForSelector(".core-score-view svg");
      await page.locator("#layout-left").waitFor({ state: "visible" });
      const restarted = await sample();
      await page.evaluate(() => window.classicOldButton.click());
      const afterOldInput = await sample();
      check(entry.name, "a clean restart creates new targets and ignores the disposed page's input", await page.evaluate(selector => document.querySelector(selector) !== window.classicOldInk, ink) && JSON.stringify(afterOldInput) === JSON.stringify(restarted) && restarted.pressed === "false");
      await page.getByRole("button", { name: "返回插件配置", exact: true }).click();
      check(entry.name, "the second independent startup disposes without a retained workspace", await page.locator("#app > *").count() === 0);
      await context.close();
    }
    check("all", "classic and packaged startup request only their own local asset closure", requests.every(request => request.entry === "classic-file" ? request.url.startsWith(pathToFileURL(root + path.sep).href) : request.url.startsWith("http://127.0.0.1:5193/dist/desktop/")), requests);
    check("all", "no classic or packaged browser error", errors.length === 0, errors);
    fs.writeFileSync(path.join(output, "startup-browser.json"), JSON.stringify({ at: new Date().toISOString(), browser: browser.version(), entries, checks, errors, requests }, null, 2));
    console.log(JSON.stringify({ total: checks.length, failed: checks.filter(check => !check.passed), errors }));
    if (errors.length || checks.some(check => !check.passed)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
