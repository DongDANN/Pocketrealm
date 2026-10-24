import { test, expect } from '@playwright/test';

test('loads, registers a service worker, and cold-launches offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pocketrealm' })).toBeVisible();
  await expect(page.getByText('A calm budget companion, offline by design.')).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'Pocketrealm' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Working offline');

  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'Pocketrealm' })).toBeVisible();
  await context.setOffline(false);
});
