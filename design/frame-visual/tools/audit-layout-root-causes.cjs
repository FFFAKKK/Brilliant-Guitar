const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.FRAME_BROWSER_MODULES || 'C:/Users/ATOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('http://127.0.0.1:5193/layout-collaboration-review.html?fixture=layout-pilot', { waitUntil: 'networkidle' });
    const report = await page.evaluate(() => {
      const rect = selector => { const node = document.querySelector(selector); const r = node?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom } : null; };
      const controls = [...document.querySelectorAll('.v-layout-size')].map(node => ({ text: node.querySelector('label')?.textContent, rect: (() => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; })(), label: (() => { const r=node.querySelector('label')?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null; })(), range: (() => { const r=node.querySelector('input[type=range]')?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null; })(), track: (() => { const r=node.querySelector('.v-layout-range-track')?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null; })(), value: node.querySelector('input[type=range]')?.value, max: node.querySelector('input[type=range]')?.max }));
      const scrollable = [...document.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== 'hidden').slice(0, 20).map(node => ({tag:node.tagName, cls:node.className, scrollHeight:node.scrollHeight, clientHeight:node.clientHeight, overflow:getComputedStyle(node).overflowY}));
      return { title: document.title, body: {scrollWidth:document.body.scrollWidth,clientWidth:document.body.clientWidth,scrollHeight:document.body.scrollHeight,clientHeight:document.body.clientHeight}, controls, scrollable, layout: rect('.v-composer'), stage: rect('.v-stage'), paper: rect('.v-paper') };
    });
    fs.mkdirSync(path.resolve(__dirname, '../evidence/layout-root-cause-20261006'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../evidence/layout-root-cause-20261006/layout-collaboration.png'), fullPage: true });
    report.errors = errors; console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });