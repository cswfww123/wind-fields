import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';

// 用法：PORT=5199 node shot-all.mjs [等待毫秒] [输出目录]
const EXEC = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);
const port = process.env.PORT || 5199;
const waitMs = Number(process.argv[2] || 7000);
const outDir = process.argv[3] || 'shots';

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--use-angle=metal', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

const result = {};
for (const id of ['river', 'fields', 'desert', 'sea']) {
  await page.goto(`http://127.0.0.1:${port}/index.html?scene=${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${outDir}/scene-${id}.png` });
  result[id] = await page.evaluate(async () => {
    const start = window.__frames;
    await new Promise((r) => setTimeout(r, 2000));
    return { fps: (window.__frames - start) / 2, stats: window.__stats };
  });
}

console.log(JSON.stringify({ result, logs }, null, 2));
await browser.close();
