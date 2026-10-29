import { expect, test, type Page } from '@playwright/test';
import { contrastRatio } from '../src/art/palette';
import { completeOnboarding, nav } from './helpers';

function hexFromCss(color: string): string {
  const match = color.match(/\d+(?:\.\d+)?/g);
  if (!match || match.length < 3) throw new Error(`Unreadable CSS colour: ${color}`);
  return `#${match
    .slice(0, 3)
    .map((value) => Math.round(Number(value)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The first opaque pixel is enough: every glyph is a solid palette colour. */
function canvasInk(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context) return '';
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        return `#${[data[i], data[i + 1], data[i + 2]]
          .map((value) => (value ?? 0).toString(16).padStart(2, '0'))
          .join('')}`;
      }
      return '';
    });
}

/**
 * Accessible name, minimum 44px target, and an image alternative. Labels in this app often wrap a
 * labelled canvas, so textContent alone is empty in bitmap mode; the descendant label counts.
 */
function auditControls(page: Page) {
  return page.evaluate(() => {
    const visible = (el: HTMLElement) => {
      if (el.getClientRects().length === 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    const labelledBy = (el: Element): string => {
      const ids = el.getAttribute('aria-labelledby');
      if (!ids) return '';
      return ids
        .split(/\s+/)
        .map((id) => {
          const node = document.getElementById(id);
          return node?.getAttribute('aria-label') ?? node?.textContent ?? '';
        })
        .join(' ')
        .trim();
    };
    const nameOf = (el: Element): string => {
      const own = el.getAttribute('aria-label')?.trim();
      if (own) return own;
      const referenced = labelledBy(el);
      if (referenced) return referenced;
      const label = (el as HTMLInputElement).labels?.[0];
      if (label) {
        const text = label.getAttribute('aria-label') ?? label.textContent?.trim();
        if (text) return text;
        const inner = label.querySelector('[aria-label]')?.getAttribute('aria-label');
        if (inner?.trim()) return inner.trim();
      }
      const inner = el.querySelector('[aria-label]')?.getAttribute('aria-label');
      if (inner?.trim()) return inner.trim();
      return (el.textContent ?? '').trim();
    };
    const targetBox = (el: HTMLElement): DOMRect => {
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        return (el.closest('label') ?? el).getBoundingClientRect();
      }
      return el.getBoundingClientRect();
    };

    const unnamed: string[] = [];
    const small: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        'main button, main a[href], main input, main select, main textarea, main [role="button"]',
      ),
    )) {
      if (!visible(el) || el.matches(':disabled')) continue;
      if ((el as HTMLButtonElement).tabIndex < 0) continue;
      const name = nameOf(el);
      if (!name) unnamed.push(`${el.tagName.toLowerCase()}.${el.className || '(none)'}`);
      const box = targetBox(el);
      if (box.width < 44 || box.height < 44) {
        small.push(
          `${el.tagName.toLowerCase()}.${el.className || '(none)'} ${Math.round(box.width)}x${Math.round(box.height)} "${name.slice(0, 24)}"`,
        );
      }
    }

    const unlabeledArt: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLCanvasElement | HTMLImageElement>('main canvas, main img'),
    )) {
      if (!visible(el)) continue;
      if (el.tagName === 'IMG' && el.hasAttribute('alt')) continue;
      const hidden = el.getAttribute('aria-hidden') === 'true';
      const named = (el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? '').trim();
      if (!hidden && !named) unlabeledArt.push(el.outerHTML.slice(0, 80));
    }

    return { unnamed, small, unlabeledArt };
  });
}

async function waitForScreen(page: Page): Promise<void> {
  await page.locator('main').waitFor();
  await page.locator('main canvas').first().waitFor();
  await page.waitForTimeout(150);
}

test('high contrast brightens the shell, remaps bitmap text and survives a reload', async ({
  page,
}) => {
  await completeOnboarding(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const toggle = page.getByRole('button', { name: 'High contrast: off' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'normal');

  const label = page.locator('.settings-panel .field-label').first();
  const before = hexFromCss(await label.evaluate((el) => getComputedStyle(el).color));
  expect(contrastRatio(before, '#0a0910')).toBeGreaterThanOrEqual(4.5);
  expect(await canvasInk(page, '.settings-panel .field-label canvas')).toBe('#cba267');

  await toggle.click();
  await expect(page.getByRole('button', { name: 'High contrast: on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');

  const after = hexFromCss(await label.evaluate((el) => getComputedStyle(el).color));
  expect(contrastRatio(after, '#0a0910')).toBeGreaterThanOrEqual(7);
  await expect
    .poll(() => canvasInk(page, '.settings-panel .field-label canvas'), { timeout: 3_000 })
    .toBe('#fff6dd');

  await page.reload();
  await expect(page.getByRole('button', { name: 'High contrast: on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');

  await page.getByRole('button', { name: 'High contrast: on' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'normal');
});

test('keyboard tabbing reaches the thumb bar with a visible pixel focus ring', async ({ page }) => {
  await completeOnboarding(page);

  let reached = false;
  for (let press = 0; press < 80 && !reached; press++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => !!document.activeElement?.closest('nav[aria-label="Main"]'),
    );
  }
  expect(reached).toBe(true);

  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return {
      label: el.getAttribute('aria-label') ?? '',
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });
  expect(ring.label.length).toBeGreaterThan(0);
  expect(ring.outlineStyle).toBe('solid');
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(contrastRatio(hexFromCss(ring.outlineColor), '#0a0910')).toBeGreaterThanOrEqual(3);

  // Tab leaves the bar and Shift+Tab comes back: no focus trap and a stable order.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('nav[aria-label="Main"]')),
  ).toBe(true);

  const targets = await page.evaluate(() => {
    const small: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a'),
    )) {
      const box = el.getBoundingClientRect();
      if (box.width < 44 || box.height < 44)
        small.push(
          `${el.getAttribute('aria-label')} ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }
    return small;
  });
  expect(targets).toEqual([]);
});

test('every visible control is named, large enough and carries image alternatives', async ({
  page,
}) => {
  await completeOnboarding(page);
  const routes = [
    '/',
    '/add',
    '/envelopes',
    '/history',
    '/settings',
    '/insights',
    '/delve',
    '/delve/workshop',
    '/delve/codex',
  ];
  for (const route of routes) {
    await page.goto(route);
    await waitForScreen(page);
    const audit = await auditControls(page);
    expect(audit.unnamed, `${route} unnamed controls`).toEqual([]);
    expect(audit.small, `${route} controls under 44px`).toEqual([]);
    expect(audit.unlabeledArt, `${route} art without a name or aria-hidden`).toEqual([]);
  }
  await expect(nav(page)).toBeVisible();
});

/**
 * The collection menus swap their body with a tab, so auditing only the landing tab would miss the
 * Bag's craft/equip pairs, the summary's move cells and every capsule row. Same contract as above,
 * tab by tab; a scrollbar does not count as a control, so the panel can be tall.
 */
test('every Workshop and Codex tab keeps its controls named and thumb-sized', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('/delve');
  await page.getByRole('button', { name: /^Descend into Rootfall Warren/ }).click();
  await expect(page.getByRole('heading', { name: 'Kit' })).toBeVisible();

  await page.goto('/delve/workshop');
  await expect(page.getByRole('heading', { name: 'Workshop' })).toBeVisible();
  for (const tab of ['Consumables', 'Capsules', 'Moveset', 'Skill Dust']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(150);
    const audit = await auditControls(page);
    expect(audit.unnamed, `Workshop ${tab} unnamed controls`).toEqual([]);
    expect(audit.small, `Workshop ${tab} controls under 44px`).toEqual([]);
    expect(audit.unlabeledArt, `Workshop ${tab} art without a name or aria-hidden`).toEqual([]);
  }

  await page.goto('/delve/codex');
  await expect(page.getByRole('heading', { name: 'Codex' })).toBeVisible();
  for (const tab of ['Species', 'Skills']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.waitForTimeout(150);
    const audit = await auditControls(page);
    expect(audit.unnamed, `Codex ${tab} unnamed controls`).toEqual([]);
    expect(audit.small, `Codex ${tab} controls under 44px`).toEqual([]);
    expect(audit.unlabeledArt, `Codex ${tab} art without a name or aria-hidden`).toEqual([]);
  }
});
