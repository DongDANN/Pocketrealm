import { expect, test, type Page } from '@playwright/test';
import { MASTER_PALETTE } from '../src/art/palette';
import { completeOnboarding, startRun } from './helpers';

/** Screens that need no book: onboarding, the art preview and the two style-lock mocks. */
const PUBLIC_ROUTES = ['/onboarding', '/art', '/mock/foundation', '/mock/today'];

/** Screens behind a completed book, exercised in order from one onboarding. */
const APP_ROUTES = [
  '/',
  '/add',
  '/envelopes',
  '/goals',
  '/history',
  '/settings',
  '/delve',
  '/delve/policy',
  '/delve/forge',
  '/delve/workshop',
  '/delve/cards',
  '/delve/codex',
  '/delve/history',
  '/quests',
  '/achievements',
  '/realm',
  '/review',
  '/insights',
];

/** Windows laptops commonly run 1.25/1.5 DPR, so fractional ratios are part of the contract. */
const VIEWPORTS = [
  { name: 'phone 360 @1x', width: 360, height: 640, dpr: 1 },
  { name: 'phone 390 @2x', width: 390, height: 844, dpr: 2 },
  { name: 'phone 390 @3x', width: 390, height: 844, dpr: 3 },
  { name: 'tablet 768 @1.5x', width: 768, height: 1024, dpr: 1.5 },
  { name: 'laptop 1280 @1.25x', width: 1280, height: 800, dpr: 1.25 },
  { name: 'desktop 1440 @1x', width: 1440, height: 900, dpr: 1 },
];

const PALETTE = new Set(MASTER_PALETTE.slice(1).map((hex) => hex.toLowerCase()));

/**
 * Waits until the screen has substituted its loading gate for real bitmap copy. Live queries can
 * finish after the heading, so also waits for the canvas count to settle and every art canvas to
 * run its sizing effect; measuring earlier reads the browser's default 300x150 canvas.
 */
async function waitForScreen(page: Page) {
  await page.locator('main canvas').first().waitFor({ state: 'visible' });
  let previousCount = -1;
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas[data-art-width]'));
          return {
            count: canvases.length,
            unset: canvases.filter((canvas) => (canvas as HTMLCanvasElement).style.width === '')
              .length,
          };
        });
        const steady = state.count === previousCount;
        previousCount = state.count;
        return state.count > 0 && state.unset === 0 && steady;
      },
      { timeout: 5_000, intervals: [50, 50, 50, 100, 100] },
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Bitmap-only copy and master-palette pixels, same contract as the original style lock. */
function scanScreen(page: Page) {
  return page.evaluate((allowed: string[]) => {
    const set = new Set(allowed);
    const textLeaks: string[] = [];
    for (const node of document.querySelectorAll('main *')) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== Node.TEXT_NODE) continue;
        const value = (child.textContent ?? '').trim();
        if (!value) continue;
        const host = node as HTMLElement;
        if (host.closest('.sr-only') || host.closest('select,option,script,style,template')) {
          continue;
        }
        textLeaks.push(`${host.className || host.tagName.toLowerCase()}: ${value}`);
      }
    }
    const offPalette: string[] = [];
    let canvasCount = 0;
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      canvasCount++;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        if (data[i + 3] === 0) continue;
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        if (!set.has(hex)) {
          offPalette.push(hex);
          if (offPalette.length > 4) break;
        }
      }
      if (offPalette.length > 4) break;
    }
    return { textLeaks, offPalette: [...new Set(offPalette)], canvasCount };
  }, Array.from(PALETTE));
}

/** Integer backing pixels and no element past the right edge, at any device ratio. */
function measureLayout(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      const artWidth = Number(canvas.dataset.artWidth ?? '0');
      if (artWidth <= 0) continue;
      const rect = canvas.getBoundingClientRect();
      // A hidden wordmark canvas still exists (header labels swap by media query) but has no layout.
      if (rect.width === 0 || rect.height === 0) continue;
      if (canvas.width % artWidth !== 0) {
        bad.push(`${canvas.className} backing ${canvas.width} not a multiple of ${artWidth}`);
      }
      const deviceRatio = canvas.width / (rect.width * window.devicePixelRatio);
      if (Math.abs(deviceRatio - 1) > 0.02) {
        bad.push(`${canvas.className} maps to ${deviceRatio.toFixed(3)} device px per backing px`);
      }
    }
    // A bitmap line is one canvas and cannot shrink, so a box whose content is wider than it is
    // has already lost: the line either crosses a neighbour's border or gets clipped.
    const spill: string[] = [];
    for (const box of Array.from(document.querySelectorAll('body *, body'))) {
      if (box.closest('.sr-only')) continue;
      const style = getComputedStyle(box);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      if (box.clientWidth === 0) continue;
      if (box.scrollWidth <= box.clientWidth + 1) continue;
      // A native widget paints its own ink past the content edge (a slider thumb); only bitmap
      // lines are the style lock's problem.
      const innerRight =
        box.getBoundingClientRect().right -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderRightWidth);
      const textOver = Array.from(box.querySelectorAll('.pixel-text canvas')).some(
        (c) => c.getBoundingClientRect().right > innerRight + 1,
      );
      if (!textOver && box.querySelector('input, select, textarea, meter, progress')) continue;
      const cls = box.className?.toString().trim().split(' ')[0] ?? box.tagName.toLowerCase();
      const culprit = Array.from(box.querySelectorAll('*'))
        .map((child) => ({ child, width: child.getBoundingClientRect().width }))
        .filter((entry) => entry.width > box.clientWidth + 1)
        .sort((a, b) => b.width - a.width)[0];
      const what = culprit
        ? `${culprit.child.tagName.toLowerCase()}.${culprit.child.className?.toString().trim().split(' ')[0] ?? ''} ${Math.round(culprit.width)}px "${(culprit.child.closest('.pixel-text')?.getAttribute('aria-label') ?? '').slice(0, 24)}"`
        : `${box.scrollWidth}px`;
      spill.push(`.${cls} holds ${what} in ${box.clientWidth}px`);
    }
    for (const head of Array.from(document.querySelectorAll('.envelope-head'))) {
      const money = head.querySelector('.money .pixel-text')?.getBoundingClientRect();
      if (!money || money.width === 0) continue;
      const name = head.closest('.envelope-row')?.querySelector('.envelope-name');
      for (const canvas of Array.from(head.querySelectorAll('.envelope-name canvas'))) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0) continue;
        const overlapX = Math.min(rect.right, money.right) - Math.max(rect.left, money.left);
        const overlapY = Math.min(rect.bottom, money.bottom) - Math.max(rect.top, money.top);
        if (overlapX > 0.5 && overlapY > 0.5) {
          bad.push(`envelope name overlaps its amount: ${name?.getAttribute('aria-label') ?? ''}`);
        }
      }
    }
    return {
      bad,
      spill: [...new Set(spill)].slice(0, 20),
      // A missing PNG is a hole in the style lock no canvas check can see.
      broken: Array.from(document.images)
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute('src') ?? ''),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      wide: Array.from(document.querySelectorAll('main *, main'))
        .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 0.5)
        .slice(0, 6)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const tag = node.tagName.toLowerCase();
          const cls = node.className?.toString().trim().replace(/\s+/g, '.') ?? '';
          const host = node.parentElement?.className?.toString().trim().split(' ')[0] ?? '';
          const label = (node.getAttribute('aria-label') ?? '').slice(0, 30);
          return `${tag}${cls ? `.${cls}` : ''} ${Math.round(rect.width)}px @${Math.round(rect.left)} in "${host}" "${label}"`;
        }),
    };
  });
}

test.describe('pixel face and integer scaling', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`every visible string on ${route} uses the bitmap face and the master palette`, async ({
      page,
    }) => {
      await page.goto(route);
      await waitForScreen(page);
      const report = await scanScreen(page);

      expect(report.canvasCount, `${route} renders bitmap canvases`).toBeGreaterThan(0);
      expect(report.textLeaks, `${route} leaves no CSS-rendered copy`).toEqual([]);
      expect(report.offPalette, `${route} draws only master-palette colors`).toEqual([]);
    });
  }

  test('the real book screens keep the bitmap face and the master palette', async ({ page }) => {
    await completeOnboarding(page);
    // An active run is the densest screen in the app: map, choices, kit, log all at once.
    await startRun(page);
    for (const route of APP_ROUTES) {
      await page.goto(route);
      await waitForScreen(page);
      const report = await scanScreen(page);

      expect(report.canvasCount, `${route} renders bitmap canvases`).toBeGreaterThan(0);
      expect(report.textLeaks, `${route} leaves no CSS-rendered copy`).toEqual([]);
      expect(report.offPalette, `${route} draws only master-palette colors`).toEqual([]);
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: integer-scaled pixels and no horizontal overflow`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr,
      });
      const page = await context.newPage();
      const findings: string[] = [];
      const check = (route: string, result: Awaited<ReturnType<typeof measureLayout>>) => {
        findings.push(...result.bad.map((b) => `${route} ${viewport.name}: ${b}`));
        findings.push(...result.spill.map((s) => `${route} ${viewport.name}: ${s}`));
        findings.push(
          ...result.broken.map((src) => `${route} ${viewport.name}: broken image ${src}`),
        );
        if (result.scrollWidth !== result.innerWidth)
          findings.push(
            `${route} ${viewport.name}: scrollWidth ${result.scrollWidth} ≠ ${result.innerWidth} — ${result.wide.join(' | ')}`,
          );
      };
      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await waitForScreen(page);
        check(route, await measureLayout(page));
      }
      await completeOnboarding(page, { income: '1000' });
      await startRun(page);
      for (const route of APP_ROUTES) {
        await page.goto(route);
        await waitForScreen(page);
        check(route, await measureLayout(page));
      }
      await context.close();
      expect(findings, `${viewport.name}: every bitmap line fits its box`).toEqual([]);
    });
  }
});
