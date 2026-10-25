import { test, expect } from '@playwright/test';
import { completeOnboarding, visibleText } from './helpers';

test('cold-launches offline with the book intact and keeps logging entries', async ({
  page,
  context,
}) => {
  await completeOnboarding(page, { income: '1000' });

  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByRole('button', { name: 'Amount ₱100.00' }).click();
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Sunrise bread');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(page, '.safe-meta')).toContain('Spent today ₱100.00');

  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return false;
    const keys = await caches.keys();
    if (keys.length === 0) return false;
    const cache = await caches.open(keys[0]!);
    const requests = await cache.keys();
    return requests.some((r) => r.url.includes('/index.html') || r.url.endsWith('/'));
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect.poll(() => visibleText(page, '[role="status"]')).toContain('Working offline');
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱400.00 left',
  );

  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByRole('button', { name: 'Amount ₱50.00' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(page, '.safe-meta')).toContain('Spent today ₱150.00');
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱350.00 left',
  );

  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(fresh, '.safe-meta')).toContain('Spent today ₱150.00');
  await context.setOffline(false);
});

test('a fresh tab sees the same book on this device', async ({ page, context }) => {
  await completeOnboarding(page, { income: '500' });
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(fresh, '.safe-amount')).toContain('₱500.00');
  await fresh.close();
});
