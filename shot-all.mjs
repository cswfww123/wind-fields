import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';

const EXEC = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--use-angle=metal', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

await page.goto('http://127.0.0.1:5199/index.html', { waitUntil: 'load' });
await page.waitForTimeout(3500);

const ids = ['river', 'fields', 'desert', 'sea'];
for (const id of ids) {
  await page.click(`[data-scene="${id}"]`);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `shots/scene-${id}.png` });
}

const fps = await page.evaluate(async () => {
  const start = window.__frames;
  await new Promise((r) => setTimeout(r, 2000));
  return (window.__frames - start) / 2;
});

console.log(JSON.stringify({ fps, logs }, null, 2));
await browser.close();
