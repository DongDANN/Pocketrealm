import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completeOnboarding, visibleText, waitForOfflinePack } from './helpers';

async function syntheticInstallPrompt(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.addEventListener('load', () => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt(): Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
      };
      event.prompt = async () => {
        (window as unknown as { __installPrompted?: boolean }).__installPrompted = true;
      };
      event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
      window.dispatchEvent(event);
    });
  });
}

function dismissalCard(page: Page) {
  return page.locator('.install-card');
}

async function quickAdd(page: Page, amount: string): Promise<void> {
  const label = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByRole('button', { name: `Amount ₱${label}` }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
}

async function unlockedNames(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { level: 1, name: 'Achievements' })).toBeVisible();
  await expect(page.locator('.shop-card').first()).toBeVisible();
  const labels = await page.locator('.shop-card.on').evaluateAll((cards) =>
    cards.map((card) =>
      Array.from(card.querySelectorAll('[aria-label]'))
        .map((node) => node.getAttribute('aria-label') ?? '')
        .join(' '),
    ),
  );
  return labels.join(' | ');
}

test('the web app manifest carries the install metadata and shortcuts', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();

  expect(manifest.name).toBe('Pocketrealm');
  expect(manifest.short_name).toBe('Pocketrealm');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  expect(manifest.shortcuts).toEqual([
    { name: 'Add expense', short_name: 'Add', url: '/add', description: 'Log an expense' },
    { name: 'Today', short_name: 'Today', url: '/', description: 'Open today' },
  ]);

  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  for (const shortcut of manifest.shortcuts as { url: string }[]) {
    expect((await request.get(shortcut.url)).ok()).toBe(true);
  }
});

test('the install card hands the one browser prompt through', async ({ page }) => {
  await syntheticInstallPrompt(page);
  await completeOnboarding(page, { income: '1000' });

  const card = dismissalCard(page);
  await expect(card).toBeVisible();
  expect(await visibleText(page, '.install-card')).toContain('Keep it one tap away');
  expect(await visibleText(page, '.install-card')).toContain('Install Pocketrealm on this device');

  await page.getByRole('button', { name: 'Install app' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __installPrompted?: boolean }).__installPrompted),
    )
    .toBe(true);
  await expect(card).toHaveCount(0);
});

test('the install card stays dismissed across visits', async ({ page }) => {
  await syntheticInstallPrompt(page);
  await completeOnboarding(page, { income: '1000' });

  const card = dismissalCard(page);
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test.describe('iOS Safari', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('shows the Share, then Add to Home Screen, instructions once', async ({ page }) => {
    await completeOnboarding(page, { income: '1000' });

    const card = page.locator('.install-card');
    await expect(card).toBeVisible();
    const copy = await visibleText(page, '.install-card');
    expect(copy).toContain('Keep it on your home screen');
    expect(copy).toContain('Share menu');
    expect(copy).toContain('Add to Home Screen');
    await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});

test('launching from the home screen pays the install badge', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        } as MediaQueryList;
      }
      return original(query);
    }) as typeof window.matchMedia;
  });

  await completeOnboarding(page, { income: '1000' });
  await page.goto('/achievements');

  expect(await unlockedNames(page)).toContain('Home at last');
});

test('the first open asks for persistent storage once', async ({ page }) => {
  await page.addInitScript(() => {
    const calls = { persisted: 0, persist: 0 };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => {
          calls.persisted += 1;
          return false;
        },
        persist: async () => {
          calls.persist += 1;
          return true;
        },
      },
    });
    (window as unknown as { __storageCalls?: typeof calls }).__storageCalls = calls;
  });

  await completeOnboarding(page, { income: '1000' });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __storageCalls?: { persist: number } }).__storageCalls?.persist,
      ),
    )
    .toBe(1);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __storageCalls?: { persisted: number } }).__storageCalls?.persisted,
  );
  expect(calls).toBe(1);
});

test('five entries ask for a backup, and the file pays the badge', async ({ page }) => {
  await completeOnboarding(page, { income: '25000' });
  for (const amount of ['50', '100', '250', '500', '1000']) await quickAdd(page, amount);

  const nudge = page.locator('.backup-nudge');
  await expect(nudge).toBeVisible();
  expect(await visibleText(page, '.backup-nudge')).toContain('A backup would be kind');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export a backup now' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pocketrealm-\d{4}-\d{2}-\d{2}\.json$/);

  await expect(nudge).toHaveCount(0);
  await expect
    .poll(() => visibleText(page, '.toast-host').catch(() => ''))
    .toContain('Safe and sound');
  await page.goto('/achievements');
  expect(await unlockedNames(page)).toContain('Safe and sound');
});

test('a newly deployed worker offers the update and the book survives the reload', async ({
  page,
}) => {
  await completeOnboarding(page, { income: '1000' });
  await quickAdd(page, '100');
  await waitForOfflinePack(page);

  const swPath = join(process.cwd(), 'dist', 'sw.js');
  const original = readFileSync(swPath, 'utf8');
  try {
    writeFileSync(swPath, `${original}\n// simulated newer build ${Date.now()}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('No service worker registration');
      await registration.update();
    });

    await expect
      .poll(() => visibleText(page, '.update-banner').catch(() => ''))
      .toContain('A new build is ready');
    await page.getByRole('button', { name: 'Update and reload' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
    expect(await visibleText(page, '.safe-meta')).toContain('Spent today ₱100.00');
    await expect(page.locator('.update-banner')).toHaveCount(0);
  } finally {
    writeFileSync(swPath, original);
  }
});

test('a blocked database explains itself and offers a retry', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', {
      configurable: true,
      value() {
        throw new DOMException('Storage is blocked', 'UnknownError');
      },
    });
  });

  await page.goto('/');
  await expect(page.locator('.fatal-panel')).toBeVisible();
  const copy = await visibleText(page, '.fatal-panel');
  expect(copy).toContain('The book is unavailable');
  expect(copy).toContain('Nothing was changed');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
