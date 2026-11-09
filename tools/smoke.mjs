/**
 * 冒烟测试：用系统已装的 Edge/Chrome 跑真实页面，抓控制台错误并截图。
 * 每个视口单独起一个浏览器实例（headless Edge 长跑会偶发崩溃）。
 *   node tools/smoke.mjs [url]
 */
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const OUT = 'docs';
const CHANNELS = ['msedge', 'chrome'];

async function launch() {
  let lastErr;
  for (const channel of CHANNELS) {
    try {
      return await chromium.launch({ channel, headless: true, args: ['--disable-dev-shm-usage'] });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function run(name, viewport) {
  const browser = await launch();
  const out = { name, console: [], errors: [], info: {}, shot: `${OUT}/shot-${name}.png` };
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();

  page.on('console', (m) => {
    if (m.type() === 'error') out.console.push(m.text().slice(0, 220));
  });
  page.on('pageerror', (e) => out.errors.push(String(e).slice(0, 300)));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(600);

    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('.gm-card:not(.gm-card-skeleton)').length > 0 ||
          document.querySelector('.gm-list-empty') !== null,
        { timeout: 40000 },
      )
      .catch(() => {});

    // 等到影像层真正解码完成
    await page
      .waitForFunction(
        () => {
          const img = document.querySelector('img.gm-scene-img');
          return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
        },
        { timeout: 45000 },
      )
      .catch(() => {});

    await page.waitForTimeout(1200);

    out.info = await page.evaluate(() => {
      const img = document.querySelector('img.gm-scene-img');
      return {
        cards: document.querySelectorAll('.gm-card:not(.gm-card-skeleton)').length,
        tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
        overlay: img instanceof HTMLImageElement ? { w: img.naturalWidth, h: img.naturalHeight, tier: img.src.includes('/cog/bbox/') ? 'render' : 'thumb' } : null,
        listTitle: document.querySelector('.gm-list-title')?.textContent ?? '',
        rail: document.querySelector('.gm-rail-val')?.textContent ?? '',
        tierTag: document.querySelector('.gm-tiertag')?.textContent ?? '',
        banner: document.querySelector('.gm-banner-msg')?.textContent ?? '',
        selected: document.querySelector('.gm-card.is-on .gm-card-day')?.textContent ?? '',
        sheet: document.getElementById('app')?.dataset.sheet ?? '',
        mapH: document.querySelector('.gm-mapwrap')?.getBoundingClientRect().height ?? 0,
        hash: location.hash,
      };
    });

    await page.screenshot({ path: out.shot });
  } catch (err) {
    out.errors.push(String(err).slice(0, 300));
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

const results = [];
results.push(await run('desktop', { width: 1440, height: 900 }));
results.push(await run('mobile', { width: 390, height: 844 }));
console.log(JSON.stringify({ url: URL, results }, null, 2));
