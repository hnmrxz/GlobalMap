import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'zh-CN' });
const page = await ctx.newPage();

page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 500)));
page.on('requestfailed', (r) => {
  if (r.url().includes('titiler')) console.log('[reqfail]', r.failure()?.errorText, r.url().slice(0, 600));
});
page.on('response', async (r) => {
  if (r.url().includes('titiler')) {
    console.log('[resp]', r.status(), 'ct=', r.headers()['content-type'], 'acao=', r.headers()['access-control-allow-origin']);
    console.log('[url ]', r.url().slice(0, 700));
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(25000);
const state = await page.evaluate(() => ({
  overlay: document.querySelector('img.gm-scene-img')?.src?.slice(0, 200) ?? null,
  tier: document.querySelector('.gm-tiertag')?.textContent ?? '',
  renderClass: document.querySelector('img.gm-scene-img')?.className ?? '',
  cards: document.querySelectorAll('.gm-card').length,
}));
console.log('[state]', JSON.stringify(state));
await browser.close();
