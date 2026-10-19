const { chromium } = require(process.env.FRAME_BROWSER_MODULES || 'C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:5193/layout-collaboration-review.html?fixture=layout-pilot', { waitUntil: 'networkidle' });
    const read = async () => page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height}:null; };
      return { left: document.querySelector('#layout-range-left')?.value, right: document.querySelector('#layout-range-right')?.value,
        leftFill: getComputedStyle(document.querySelector('#layout-range-left')?.parentElement?.querySelector('.v-layout-range-fill')).width,
        rightFill: getComputedStyle(document.querySelector('#layout-range-right')?.parentElement?.querySelector('.v-layout-range-fill')).width,
        paper: rect('.v-paper'), stage: rect('.v-stage'), top: rect('.v-top'), voice: rect('.v-voice-content'),
        scrollbars: [...document.querySelectorAll('*')].filter(n => n.scrollHeight > n.clientHeight + 1 && getComputedStyle(n).overflowY !== 'hidden').map(n => ({c:n.className,overflow:getComputedStyle(n).overflowY})).slice(0,10) };
    });
    const initial = await read();
    await page.locator('#layout-range-right').evaluate(node => { node.value = '320'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(50);
    const afterRight = await read();
    await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(100);
    const narrow = await read();
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(100);
    const restored = await read();
    console.log(JSON.stringify({initial, afterRight, narrow, restored}, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });