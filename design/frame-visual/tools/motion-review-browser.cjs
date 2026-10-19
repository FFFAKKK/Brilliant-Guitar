const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.argv[2]);
const output = path.resolve(process.argv[3] ?? path.join(__dirname, "../evidence/motion-pilot-20261007"));
fs.mkdirSync(output, { recursive: true });
const base = "http://127.0.0.1:5193/";
const report = { at: new Date().toISOString(), checks: [], observations: [], errors: [], requests: [] };
const check = (name, passed, detail = null) => report.checks.push({ name, passed: Boolean(passed), detail });
const snapshot = page => page.evaluate(async () => {
  const { readMotionReview } = await import("./src/fixtures/animation-review.js");
  const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  return { ...readMotionReview(), paper: rect(document.querySelector(".motion-paper")), stage: rect(document.querySelector(".motion-stage")),
    panes: [...document.querySelectorAll("[data-pane]")].map(node => ({ id: node.dataset.pane, opacity: Number(getComputedStyle(node).opacity), transform: getComputedStyle(node).transform, inert: node.inert })),
    rows: [...document.querySelectorAll("[data-item]")].map(node => ({ id: node.dataset.item, transform: getComputedStyle(node).transform, rect: rect(node) })),
    documentOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    panelOverflow: document.querySelector(".motion-pilot").scrollHeight > document.querySelector(".motion-pilot").clientHeight,
    imageLoaded: document.querySelector(".motion-paper").complete && document.querySelector(".motion-paper").naturalWidth > 0 };
});
const sameRect = (a, b) => Object.keys(a).every(key => Math.abs(a[key] - b[key]) < .1);
const waitIdle = async page => {
  await page.evaluate(async () => { window.readMotionEvidence = (await import("./src/fixtures/animation-review.js")).readMotionReview; });
  await page.waitForFunction(() => window.readMotionEvidence().active === 0);
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  report.browser = browser.version();
  try {
    const page = await context.newPage();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
    page.on("request", request => report.requests.push(request.url()));
    await page.goto(base + "animation-review.html", { waitUntil: "networkidle" });
    const initial = await snapshot(page);
    check("real local Motion bundle is used", initial.engine === "Motion 14.0.0" && report.requests.some(url => url.endsWith("vendor/motion-review.js")), initial.engine);
    check("approved score asset loads", initial.imageLoaded);
    check("no CDN or external runtime request", report.requests.every(url => url.startsWith(base)));
    await page.screenshot({ path: path.join(output, "initial-1440.png") });

    for (const profile of ["continuous", "focused", "quiet"]) {
      await page.locator(`[data-group="style"][data-value="${profile}"]`).click();
      await page.locator('[data-group="mode"][data-value="slow"]').click();
      const current = await snapshot(page), next = current.view === "regions" ? "arrangement" : "regions";
      await page.locator(`[data-view="${next}"]`).click();
      const running = await snapshot(page);
      check(`${profile}: state commits while presentation is running`, running.view === next && running.active > 0, running);
      await page.waitForFunction(() => [...document.querySelectorAll("[data-pane]")].some(node => { const opacity = Number(getComputedStyle(node).opacity); return opacity > .001 && opacity < .999; }));
      const moving = await snapshot(page);
      check(`${profile}: transition has intermediate opacity`, moving.panes.some(pane => pane.opacity > .001 && pane.opacity < .999), moving.panes);
      const previous = next === "regions" ? "arrangement" : "regions";
      await page.locator(`[data-view="${previous}"]`).click();
      await waitIdle(page);
      const settled = await snapshot(page);
      check(`${profile}: reverse lands on latest accepted view`, settled.view === previous && settled.panes.find(pane => pane.id === previous).opacity > .999 && settled.panes.find(pane => pane.id !== previous).opacity < .001, settled);
      check(`${profile}: paper and work area remain fixed`, sameRect(initial.paper, settled.paper) && sameRect(initial.stage, settled.stage));
    }
    await page.locator('[data-group="mode"][data-value="full"]').click();
    // Sorting retains the same artwork, now inside its arrangement page.
    await page.locator('[data-view="arrangement"]').click(); await waitIdle(page);
    const beforeDrag = await snapshot(page), movingId = beforeDrag.order[0];
    const row = await page.locator(`[data-item="${movingId}"]`).boundingBox();
    const end = await page.locator(`[data-item="${beforeDrag.order[2]}"]`).boundingBox();
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2); await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
    const dragging = await snapshot(page);
    check("real pointer movement drives the local row", dragging.dragging && dragging.rows.find(item => item.id === movingId).transform !== "none", dragging);
    await page.mouse.up();
    const dropping = await snapshot(page);
    check("business order commits before spring finishes", dropping.order[2] === movingId, dropping);
    await waitIdle(page);
    const afterDrag = await snapshot(page);
    check("spring settles every row at its accepted slot", afterDrag.rows.every(item => /(?:none|matrix\(1, 0, 0, 1, 0, 0\))/.test(item.transform)), afterDrag);
    check("drag leaves score and stage stationary", sameRect(initial.paper, afterDrag.paper) && sameRect(initial.stage, afterDrag.stage));
    const keyboardId = afterDrag.order[0];
    await page.locator(`[data-item="${keyboardId}"]`).focus(); await page.keyboard.press("ArrowDown");
    const keyed = await snapshot(page);
    check("keyboard reorder commits instantly and preserves focus", keyed.order[1] === keyboardId && keyed.active === 0 && await page.locator(`[data-item="${keyboardId}"]`).evaluate(node => node === document.activeElement), keyed);

    await page.locator('[data-group="mode"][data-value="slow"]').click();
    await page.locator(".motion-review-trigger").click();
    await page.locator('[data-group="mode"][data-value="none"]').click();
    const off = await snapshot(page);
    check("turning off mid-motion settles the latest view", off.active === 0 && off.panes.find(pane => pane.id === off.view).opacity > .999, off);
    await page.locator(".motion-review-trigger").click();
    const immediate = await snapshot(page);
    check("off mode remains immediate on subsequent input", immediate.active === 0 && immediate.view !== off.view);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('[data-group="mode"][data-value="full"]').click();
    check("system reduced motion overrides the full button", (await snapshot(page)).mode === "reduced");
    await page.locator(".motion-review-trigger").click(); await waitIdle(page);
    const reduced = await snapshot(page);
    check("reduced content transitions have no travel", reduced.panes.every(pane => pane.transform === "none" || pane.transform === "matrix(1, 0, 0, 1, 0, 0)"), reduced.panes);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    for (const [width, height] of [[1440, 900], [1280, 720], [800, 600]]) {
      await page.setViewportSize({ width, height });
      const size = await snapshot(page);
      check(`${width}x${height}: no document or panel overflow`, !size.documentOverflow && !size.panelOverflow, size);
      await page.screenshot({ path: path.join(output, `viewport-${width}.png`) });
    }
    check("no page errors", report.errors.length === 0, report.errors);
    // These are separate isolated instances. Never touch the user's browser.
    const filePage = await context.newPage();
    const fileErrors = []; filePage.on("pageerror", error => fileErrors.push(error.message));
    await filePage.goto("file:///E:/desktop/brilliant_ideas/brilliant_guitar/design/frame-visual/animation-review.html");
    report.observations.push({ name: "file URL behavior", appChildren: await filePage.locator("#app").evaluate(node => node.childElementCount), errors: fileErrors });
  } catch (error) { check("browser audit completed", false, error.stack); }
  finally {
    await browser.close(); fs.writeFileSync(path.join(output, "browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks.length, failed: report.checks.filter(item => !item.passed) }, null, 2));
    process.exitCode = report.checks.some(item => !item.passed) ? 1 : 0;
  }
})();
