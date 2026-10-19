const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = "http://127.0.0.1:5193/runtime-preview.html?rev=startup-recovery-20261007";
const output = path.resolve(__dirname, "../evidence/runtime-blank-20261007", process.argv[2] || "verified");

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const report = { at: new Date().toISOString(), checks: [], observations: [], errors: [] };
  const check = (scenario, name, passed, detail = null) => report.checks.push({ scenario, name, passed: !!passed, detail });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const read = page => page.evaluate(() => ({ children: document.getElementById("app").childElementCount,
    shells: document.querySelectorAll(".visual-shell").length, svg: document.querySelectorAll(".core-score-view svg").length,
    status: document.querySelector("#preview-startup")?.dataset.state || null,
    error: globalThis.__backupUiStartupError?.message || null, doc: globalThis.__startupProbeDocument,
    paper: document.querySelector(".v-paper")?.getBoundingClientRect().toJSON() }));
  const ready = async page => {
    await page.waitForSelector(".core-score-view svg");
    await page.waitForFunction(() => !document.querySelector("#preview-startup"));
    return read(page);
  };
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 800, height: 600 }]) {
      const scenario = `normal-${viewport.width}`, context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width === 1280 ? 1.25 : 1 });
      const page = await context.newPage();
      page.on("pageerror", error => report.errors.push({ scenario, message: error.message }));
      await page.goto(url, { waitUntil: "networkidle" });
      const state = await ready(page); report.observations.push({ scenario, state });
      check(scenario, "one shell and real score with startup surface removed", state.shells === 1 && state.svg > 0 && state.children === 1 && !state.error && !state.status, state);
      await page.screenshot({ path: path.join(output, scenario + ".png") });
      await context.close();
    }
    for (const entry of [
      { scenario: "classic-file", url: pathToFileURL(path.resolve(__dirname, "../plugin-startup-config-static-preview.html")).href },
      { scenario: "desktop-static-assets", url: "http://127.0.0.1:5193/dist/desktop/index.html" },
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage();
      page.on("pageerror", error => report.errors.push({ scenario: entry.scenario, message: error.message }));
      await page.goto(entry.url, { waitUntil: "networkidle" });
      await page.locator("#startup-open").click(); const state = await ready(page);
      check(entry.scenario, "rebuilt static entry mounts the real score once", state.shells === 1 && state.svg > 0 && state.children === 1 && !state.error, state);
      await page.screenshot({ path: path.join(output, entry.scenario + ".png") });
      await context.close();
    }
    for (const scenario of ["entry-network-failure", "dependency-network-failure", "dependency-link-failure", "runtime-construction-failure"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on("pageerror", error => report.errors.push({ scenario, message: error.message }));
      if (scenario === "entry-network-failure") await page.route("**/src/runtime-preview.js*", route => route.abort("failed"));
      if (scenario === "dependency-network-failure") await page.route("**/src/host/formal-plugin-assembly.js", route => route.abort("failed"));
      if (scenario === "dependency-link-failure") await page.route("**/src/host/formal-plugin-assembly.js", route => route.fulfill({ contentType: "application/javascript", headers: { "cache-control": "no-store" }, body: "export const staleModule = true;" }));
      if (scenario === "runtime-construction-failure") await page.route("**/src/runtime-preview.js*", async route => {
        const response = await route.fetch(), source = await response.text();
        // A test-only fault must not retain the real source's Last-Modified
        // header: otherwise reload may revalidate the injected fault with 304.
        await route.fulfill({ response, headers: { ...response.headers(), "cache-control": "no-store" }, body: source.replace("try {", 'try { throw new Error("Forced startup failure");') });
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector('#preview-startup[data-state="failed"]');
      const state = await read(page); report.observations.push({ scenario, state });
      check(scenario, "failure is visible and diagnostic retained", state.shells === 0 && state.svg === 0 && state.children === 1 && !!state.error && await page.locator("#preview-startup-title").innerText() === "工作区启动失败", state);
      check(scenario, "retry is visible and enabled", await page.locator("#preview-startup-retry").isVisible() && await page.locator("#preview-startup-retry").isEnabled());
      await page.screenshot({ path: path.join(output, scenario + ".png") });
      await page.unrouteAll();
      await page.keyboard.press("Tab");
      check(scenario, "real Tab reaches retry", await page.locator("#preview-startup-retry").evaluate(node => document.activeElement === node));
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.keyboard.press("Enter")]);
      let recovered;
      try { recovered = await ready(page); }
      catch (error) {
        report.observations.push({ scenario: scenario + "-retry-failure", state: await read(page) });
        await page.screenshot({ path: path.join(output, scenario + "-retry-failure.png") });
        throw error;
      }
      check(scenario, "keyboard retry starts one clean real workspace", recovered.shells === 1 && recovered.children === 1 && recovered.svg > 0 && !recovered.error, recovered);
      await context.close();
    }
    {
      const scenario = "delayed-entry", context = await browser.newContext(), page = await context.newPage();
      let release; const gate = new Promise(resolve => { release = resolve; });
      await page.route("**/src/runtime-preview.js*", async route => { await gate; await route.continue(); });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      check(scenario, "pending import shows loading rather than empty canvas", await page.locator("#preview-startup-title").innerText() === "正在加载工作区" && await page.locator("#preview-startup").isVisible());
      release(); const state = await ready(page);
      check(scenario, "completed import removes loading surface", state.shells === 1 && state.svg > 0 && !state.status, state);
      await context.close();
    }
    {
      const scenario = "document-return", context = await browser.newContext(), page = await context.newPage();
      await context.addInitScript(() => { globalThis.__startupProbeDocument = Math.random(); });
      await page.goto(url, { waitUntil: "networkidle" });
      const initial = await ready(page);
      await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })); window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
      const preserved = await ready(page);
      check(scenario, "preserved document keeps runtime and paper geometry", preserved.doc === initial.doc && preserved.shells === 1 && JSON.stringify(preserved.paper) === JSON.stringify(initial.paper));
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      })]);
      const recovered = await ready(page);
      check(scenario, "disposed empty document reloads instead of staying blank", recovered.doc !== initial.doc && recovered.shells === 1 && recovered.svg > 0, recovered);
      await page.goto("about:blank"); await page.goBack({ waitUntil: "networkidle" });
      const returned = await ready(page);
      check(scenario, "actual history return displays one real workspace", returned.shells === 1 && returned.children === 1 && returned.svg > 0, returned);
      await context.close();
    }
  } catch (error) { report.errors.push({ message: error.message, stack: error.stack }); }
  finally {
    await browser.close();
    report.passed = report.checks.every(item => item.passed) && report.errors.length === 0;
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter(item => !item.passed), errors: report.errors }));
    if (!report.passed) process.exitCode = 1;
  }
})();
