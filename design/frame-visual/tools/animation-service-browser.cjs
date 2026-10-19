const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = path.resolve(__dirname, "../evidence/layout-formal-engineering-20261007");
const base = "http://127.0.0.1:5193/";
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "runtime-preview.html", { waitUntil: "networkidle" });
    const result = await page.evaluate(async () => {
      const { createAnimationService } = await import("./src/runtime/animation-service.js");
      const { createMotionAnimationProvider } = await import("./src/runtime/motion-animation-provider.js");
      const root = document.createElement("section"); document.body.append(root);
      root.style.cssText = "position:fixed;left:0;top:0;pointer-events:none";
      const ink = document.createElement("span"); ink.style.cssText = "display:block;width:10px;height:10px;opacity:1"; root.append(ink);
      const issues = [], checks = [];
      const check = (name, passed, detail) => checks.push({ name, passed: !!passed, detail });
      const service = createAnimationService({ provider: createMotionAnimationProvider(), onIssue: issue => issues.push(issue.code) });
      const component = service.forComponent({ owner: "browser.author", id: "browser.author.test", permissions: { animations: ["content-transition"] }, animations: {
        contractVersion: 1, definitions: { "content-transition": { defaultVariant: "own", variants: { own: {
          type: "tween", duration: .25, fadeDuration: .16, exitDuration: .08, ease: [.23, 1, .32, 1],
        } } } },
      } }, root);
      const port = component.bind({ ink: { node: ink, intents: ["content-transition"] } });
      const first = port.play({ intent: "content-transition", target: "ink", to: { opacity: 0 } });
      await new Promise(done => setTimeout(done, 35));
      const middle = Number(getComputedStyle(ink).opacity);
      check("actual pinned provider renders intermediate opacity", middle > 0 && middle < 1, middle);
      const second = port.play({ intent: "content-transition", target: "ink", to: { opacity: 1 } });
      check("rapid reversal interrupts the earlier playback", (await first.finished).status === "interrupted");
      check("actual provider lands on the latest accepted state", (await second.finished).status === "completed" && Number(getComputedStyle(ink).opacity) === 1);
      service.setPolicy({ reducedMotion: true });
      const reduced = port.play({ intent: "content-transition", target: "ink", from: { x: 16, opacity: 0 }, to: { x: -16, opacity: 1 } });
      await reduced.finished;
      check("reduced content removes travel from both ends", new DOMMatrixReadOnly(getComputedStyle(ink).transform).m41 === 0);
      service.setPolicy({ reducedMotion: false });
      port.place({ intent: "content-transition", target: "ink", to: { opacity: 0 } });
      const hidden = port.play({ intent: "content-transition", target: "ink", to: { opacity: 1 } });
      root.hidden = true; component.setVisible(false);
      check("hiding DOM before lifecycle notification cancels actual native tracks", (await hidden.finished).status === "cancelled" && ink.getAnimations().length === 0,
        { tracks: ink.getAnimations().map(animation => animation.playState), issues: [...issues] });
      root.hidden = false; component.setVisible(true);
      service.replaceProvider(null); port.play({ intent: "content-transition", target: "ink", to: { opacity: 0 } });
      check("missing provider lands synchronously at static destination", Number(getComputedStyle(ink).opacity) === 0);
      service.dispose(); root.remove();
      check("release restores original local style and releases all ownership", ink.style.opacity === "1" && service.snapshot().targets === 0 && service.snapshot().active === 0);
      check("actual provider produces no fault", issues.length === 0, issues);
      return { checks, issues };
    });
    const report = { at: new Date().toISOString(), browser: browser.version(), ...result, errors };
    fs.writeFileSync(path.join(output, "provider-browser.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: result.checks.length, failed: result.checks.filter(check => !check.passed), errors }));
    if (errors.length || result.checks.some(check => !check.passed)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
