import { test, expect } from '@playwright/test';
import { completeOnboarding, nav, visibleText, waitForOfflinePack } from './helpers';

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

  await waitForOfflinePack(page);

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
  // Written offline, so the badge is earned by the entry itself, not by merely opening offline.
  await expect
    .poll(() => visibleText(page, '.toast-host').catch(() => ''))
    .toContain('Lantern in the dark');

  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(fresh, '.safe-meta')).toContain('Spent today ₱150.00');
  await context.setOffline(false);
});

test('the offline strip clears itself when the network comes back', async ({ page, context }) => {
  await completeOnboarding(page, { income: '1000' });
  await waitForOfflinePack(page);

  await context.setOffline(true);
  await expect(page.locator('.offline-strip')).toBeVisible();

  await context.setOffline(false);
  await expect(page.locator('.offline-strip')).toHaveCount(0);
});

test('a tab that booted while offline notices the network coming back', async ({
  page,
  context,
}) => {
  await completeOnboarding(page, { income: '1000' });
  await waitForOfflinePack(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.offline-strip')).toBeVisible();

  await context.setOffline(false);
  await expect(page.locator('.offline-strip')).toHaveCount(0);
});

test('a fresh tab sees the same book on this device', async ({ page, context }) => {
  await completeOnboarding(page, { income: '500' });
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(fresh, '.safe-amount')).toContain('₱500.00');
  await fresh.close();
});

test('deep links and the thumb bar work with no network', async ({ page, context }) => {
  await completeOnboarding(page, { income: '1000' });
  await waitForOfflinePack(page);

  await context.setOffline(true);
  await page.goto('/envelopes');
  await expect(page.getByRole('heading', { level: 1, name: 'Jars', exact: true })).toBeVisible();
  await nav(page).getByRole('link', { name: 'Add' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add entry', exact: true }),
  ).toBeVisible();
  await nav(page).getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('the first visit says the offline pack is being prepared', async ({ page }) => {
  // A registration that never resolves leaves the first-copy state visible without slowing the app.
  await page.addInitScript(() => {
    Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
      configurable: true,
      value: () => new Promise(() => {}),
    });
  });

  await page.goto('/onboarding');
  const strip = page.locator('.pack-strip');
  await expect(strip).toBeVisible();
  expect(await visibleText(page, '.pack-strip')).toContain('Preparing the offline pack');
  await expect(page.getByRole('heading', { level: 1, name: 'Pocketrealm' })).toBeVisible();
});
