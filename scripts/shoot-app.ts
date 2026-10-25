/**
 * Captures the app screenshots in docs/art-preview. Needs a production preview running:
 * npm run build && npm run preview, then npm run art:shots.
 */
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:4173';

async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

const browser = await chromium.launch();
const errors: string[] = [];

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const today = await mobile.newPage();
today.on('pageerror', (e) => errors.push(e.message));
await today.goto(`${base}/today`);
await settle(today);
await today.screenshot({ path: 'docs/art-preview/app-today-mobile.png', fullPage: true });
await today.getByRole('button', { name: 'Log expense' }).click();
await settle(today);
await today.screenshot({ path: 'docs/art-preview/app-today-numpad.png' });
await mobile.close();

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const wide = await desktop.newPage();
wide.on('pageerror', (e) => errors.push(e.message));
await wide.goto(`${base}/today`);
await settle(wide);
await wide.screenshot({ path: 'docs/art-preview/app-today-desktop.png', fullPage: true });
await wide.goto(`${base}/art`);
await settle(wide);
await wide.screenshot({ path: 'docs/art-preview/app-art-desktop.png', fullPage: true });
const stage = wide.locator('.stage-frame');
await wide.getByRole('button', { name: 'Pause' }).click();
await settle(wide);
await stage.screenshot({ path: 'docs/art-preview/app-art-live-1.png' });
await wide.getByRole('button', { name: 'Step +1' }).click();
await settle(wide);
await stage.screenshot({ path: 'docs/art-preview/app-art-live-2.png' });
await desktop.close();

const artMobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const artPage = await artMobile.newPage();
artPage.on('pageerror', (e) => errors.push(e.message));
await artPage.goto(`${base}/art`);
await settle(artPage);
await artPage.screenshot({ path: 'docs/art-preview/app-art-mobile.png', fullPage: true });
await artMobile.close();

await browser.close();
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no page errors');
