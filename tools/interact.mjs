/** 交互冒烟：真实点击驱动，验证各控件接线是否生效。 */
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});

const report = {};
const snap = async (key) =>
  (report[key] = await page.evaluate(() => ({
    cards: document.querySelectorAll('.gm-card:not(.gm-card-skeleton)').length,
    selectedDay: document.querySelector('.gm-card.is-on .gm-card-day')?.textContent ?? null,
    firstDay: document.querySelector('.gm-card-day')?.textContent ?? null,
    platforms: [...new Set([...document.querySelectorAll('.gm-badge:not(.is-best)')].map((n) => n.textContent))].join(','),
    rail: document.querySelector('.gm-rail-val')?.textContent ?? '',
    detailOpen: !document.querySelector('.gm-detail')?.hidden,
    detailTitle: document.querySelector('.gm-detail b')?.textContent ?? '',
    sheet: document.getElementById('app')?.dataset.sheet,
    hash: location.hash,
    tiles: [...new Set([...document.querySelectorAll('.leaflet-tile-loaded')].map((i) => new URL(i.src).host))].join(','),
    overlay: (() => {
      const img = document.querySelector('img.gm-scene-img');
      return img instanceof HTMLImageElement ? { w: img.naturalWidth, src: img.src.includes('/cog/bbox/') ? 'crop' : 'thumb' } : null;
    })(),
  })));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.gm-card:not(.gm-card-skeleton)', { timeout: 45000 });
await page.waitForTimeout(3000);
await snap('initial');

// 1. 选第二张卡
await page.locator('.gm-card-hit').nth(3).click();
await page.waitForTimeout(2500);
await snap('pick2');

// 2. 时间预设改为"近一年"
await page.getByRole('button', { name: '近一年' }).click();
await page.waitForTimeout(9000);
await snap('range1y');

// 3. 仅 Sentinel-2A
await page.getByRole('button', { name: /仅 Sentinel-2A/ }).click();
await page.waitForTimeout(9000);
await snap('only2a');

// 4. 打开详情
await page.locator('.gm-card-info').first().click();
await page.waitForTimeout(800);
await snap('detail');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await snap('detailClosed');

// 5. 换底图 OSM
await page.selectOption('#sel-base', 'osm');
await page.waitForTimeout(2500);
await snap('osm');

// 6. 放大到 15 级触发 fine 档
await page.evaluate(() => {
  document.querySelector('.leaflet-control-zoom-in')?.dispatchEvent(new Event('click'));
});
await page.locator('.gm-map').dblclick({ position: { x: 400, y: 300 } });
await page.waitForTimeout(6000);
await snap('zoomed');

console.log(JSON.stringify({ errors, report }, null, 1));
await browser.close();
