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
