const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || "C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto("http://127.0.0.1:5193/structure-preview.html?debug", { waitUntil: "networkidle" });
  await page.locator(".v-paper img").evaluate(node => node.decode());
  fs.mkdirSync(path.resolve(__dirname, "../evidence"), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, "../evidence/first-1440.png") });
  console.log(JSON.stringify({ errors, metrics: await page.evaluate(() => window.__visualPreview.metrics()) }, null, 2));
  if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
