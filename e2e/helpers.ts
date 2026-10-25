import { expect, type Page } from '@playwright/test';

/**
 * UI copy is drawn with the bitmap face, so `textContent` is empty in pixel mode: a single line
 * becomes one labelled canvas and a wrapped block becomes one labelled wrapper plus unlabelled
 * canvases. Collects real DOM text (readable mode) and every aria-label below the root.
 */
export function visibleText(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((root) => {
      const labels = Array.from(root.querySelectorAll('[aria-label]')).map(
        (node) => node.getAttribute('aria-label') ?? '',
      );
      return [...new Set([root.textContent ?? '', ...labels])]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    });
}

/**
 * Opens a fresh book through the real onboarding screen. Every spec that needs the app (rather than
 * the style-lock mocks) starts here, because the only way into the screens is a completed book.
 */
export async function completeOnboarding(
  page: Page,
  options: { income?: string; currency?: string; companionName?: string } = {},
): Promise<void> {
  await page.goto('/onboarding');
  await page.getByRole('textbox', { name: 'Monthly income' }).fill(options.income ?? '25000');
  if (options.currency)
    await page.getByRole('combobox', { name: 'Currency' }).selectOption(options.currency);
  if (options.companionName)
    await page.getByRole('textbox', { name: 'Companion name' }).fill(options.companionName);
  await page.getByRole('button', { name: /Open my book/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
}

/** The thumb bar, so a label like "Envelopes" cannot collide with a link inside a panel. */
export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

/**
 * Begins a real Delve run. The densest screen in the book: map, kit, choices and log all at once,
 * so layout and style checks that only visit the camp screens would miss it.
 */
export async function startRun(page: Page): Promise<void> {
  await page.goto('/delve');
  await page.getByRole('button', { name: /^Descend into Rootfall Warren/ }).click();
  await expect(page.getByRole('heading', { name: 'Kit' })).toBeVisible();
}

/**
 * Freezes the two things that make the same screen unrepeatable: the wall clock (dates, the oil
 * trickle, "resets in") and freshly minted ids, because a run's floor plan is hashed from the
 * companion id. Goldens need both or they drift at local midnight and on every new book.
 */
export async function pinClockAndIds(page: Page, at = '2026-10-25T09:00:00'): Promise<void> {
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript(() => {
    let counter = 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `7d4a11e0-5a3e-4b0a-9c1d-${String(counter++).padStart(12, '0')}`,
    });
  });
}
