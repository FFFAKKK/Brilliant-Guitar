const { chromium } = require(process.env.FRAME_BROWSER_MODULES || 'C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5193/runtime-preview.html', { waitUntil:'networkidle' });
    const read = () => page.evaluate(() => { const q=s=>document.querySelector(s); const r=s=>{const x=q(s)?.getBoundingClientRect();return x?{x:x.x,y:x.y,w:x.width,h:x.height}:null}; return {paper:r('.v-paper'),stage:r('.v-stage'),left:r('.v-left'),right:r('.v-right'),body:[document.body.scrollWidth,document.body.clientWidth,document.body.scrollHeight,document.body.clientHeight],leftOpen:q('#region-left')?.getAttribute('aria-pressed'),rightOpen:q('#region-right')?.getAttribute('aria-pressed'),topOpen:q('#region-top')?.getAttribute('aria-pressed'),visibleScrollbars:[...document.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+1 && getComputedStyle(n).overflowY==='scroll').length};});
    const before=await read();
    await page.locator('#region-left').click(); await page.waitForTimeout(30); const leftOpen=await read();
    await page.locator('#region-left').click(); await page.locator('#region-top').click(); await page.waitForTimeout(30); const topClosed=await read();
    await page.locator('#region-top').click(); await page.setViewportSize({width:800,height:600}); await page.waitForTimeout(50); const narrow=await read();
    console.log(JSON.stringify({before,leftOpen,topClosed,narrow,errors},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});