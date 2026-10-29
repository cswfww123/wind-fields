import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';

const EXEC = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);

const out = process.argv[2] || 'shots/shot.png';
const waitMs = Number(process.argv[3] || 4200);
const query = process.argv[4] || '';

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const port = process.env.PORT || 5199;
await page.goto(`http://127.0.0.1:${port}/index.html${query}`, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });

const info = await page.evaluate(() => ({
  frames: window.__frames || 0,
  stats: window.__stats || null,
  webgl: (() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return gl ? gl.getParameter(gl.VERSION) : 'none';
  })(),
}));

console.log(JSON.stringify({ info, logs: logs.slice(0, 30) }, null, 2));
await browser.close();
