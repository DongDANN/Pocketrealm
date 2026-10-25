import type { Page } from '@playwright/test';

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
