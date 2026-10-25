import { expect, test } from '@playwright/test';
import { MASTER_PALETTE } from '../src/art/palette';

const ROUTES = ['/', '/art', '/today'];

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

test.describe('pixel face and integer scaling', () => {
  for (const route of ROUTES) {
    test(`every visible string on ${route} uses the bitmap face and the master palette`, async ({
      page,
    }) => {
      await page.goto(route);
      const report = await page.evaluate((allowed: string[]) => {
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

      expect(report.canvasCount, `${route} renders bitmap canvases`).toBeGreaterThan(0);
      expect(report.textLeaks, `${route} leaves no CSS-rendered copy`).toEqual([]);
      expect(report.offPalette, `${route} draws only master-palette colors`).toEqual([]);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: integer-scaled pixels and no horizontal overflow`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr,
      });
      const page = await context.newPage();
      for (const route of ROUTES) {
        await page.goto(route);
        const result = await page.evaluate(() => {
          const bad: string[] = [];
          for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
            const artWidth = Number(canvas.dataset.artWidth ?? '0');
            if (artWidth <= 0) continue;
            const rect = canvas.getBoundingClientRect();
            if (canvas.width % artWidth !== 0) {
              bad.push(`${canvas.className} backing ${canvas.width} not a multiple of ${artWidth}`);
            }
            const deviceRatio = canvas.width / (rect.width * window.devicePixelRatio);
            if (Math.abs(deviceRatio - 1) > 0.02) {
              bad.push(
                `${canvas.className} maps to ${deviceRatio.toFixed(3)} device px per backing px`,
              );
            }
          }
          return {
            bad,
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
        expect(result.bad, `${route} @ ${viewport.name}`).toEqual([]);
        expect(
          [result.scrollWidth, result.wide],
          `${route} @ ${viewport.name} fits without horizontal scrolling`,
        ).toStrictEqual([result.innerWidth, []]);
      }
      await context.close();
    });
  }
});
