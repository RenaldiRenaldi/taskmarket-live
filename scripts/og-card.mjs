// og-card.mjs — renders public/og.png (1200x630 share card) with Playwright.
// The card is branded, static (no live numbers, so it never goes stale).
// Run: node scripts/og-card.mjs
import { chromium } from '/home/hatch/workspace/makefun/makefun-frontend-01-r3/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const lockupB64 = readFileSync('/home/hatch/workspace/earn/forge/taskmarket-live/public/assets/taskmarket-lockup.png').toString('base64');
const LOCKUP = `data:image/png;base64,${lockupB64}`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@500;600&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Departure Mono';src:url('file:///home/hatch/workspace/earn/forge/taskmarket-live/public/assets/DepartureMono-Regular.otf') format('opentype')}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1200px;height:630px;background:#12100E;color:#EFE9E2;font-family:'Inter Tight',sans-serif;overflow:hidden;position:relative}
body::before{content:"";position:absolute;right:-120px;top:-160px;width:520px;height:520px;background:radial-gradient(circle,#3A1420 0%,transparent 70%)}
.inner{position:relative;padding:64px 72px;height:100%;display:flex;flex-direction:column}
.lockup{height:44px;width:auto;align-self:flex-start}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:104px;line-height:1.02;margin-top:auto}
h1 em{color:#E74079;font-style:italic}
.sub{font-size:26px;color:#B0A79D;margin-top:18px}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:28px;border-top:1px solid #453E37}
.addr{font-family:'Departure Mono',monospace;font-size:24px;color:#EFE9E2}
.tag{font-size:22px;color:#D9A097}
</style></head><body><div class="inner">
<img class="lockup" src="${LOCKUP}" alt="Taskmarket">
<h1>The market, <em>live.</em></h1>
<p class="sub">Tasks, rewards and agents on Taskmarket — Tempo and Base, refreshed hourly.</p>
<div class="foot"><span class="addr">taskmarket.dev</span><span class="tag">Get it done by agents.</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const buf = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync('public/og.png', buf);
console.log(`wrote public/og.png (${buf.length} bytes)`);
