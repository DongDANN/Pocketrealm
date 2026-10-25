import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { completeOnboarding, nav, visibleText } from './helpers';

test('first run opens a real book and keeps it across reloads', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('textbox', { name: 'Monthly income' }).fill('25000');
  await page.getByRole('textbox', { name: 'Companion name' }).fill('Tala');
  await page.getByRole('button', { name: /Open my book/ }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tala' })).toBeVisible();
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱12,500.00 left',
  );
  expect(await visibleText(page, '.safe-amount')).toContain('₱25,000.00');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱12,500.00 left',
  );
  expect(pageErrors).toEqual([]);
});

test('a common expense is three taps: Add, amount, Save', async ({ page }) => {
  await completeOnboarding(page, { income: '1000' });
  await page.evaluate(() => {
    const scope = window as Window & { __taps?: number };
    scope.__taps = 0;
    document.addEventListener(
      'pointerdown',
      () => {
        scope.__taps = (scope.__taps ?? 0) + 1;
      },
      true,
    );
  });

  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByRole('button', { name: 'Amount ₱250.00' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  expect(await visibleText(page, '.toast-host')).toContain('Logged ₱250.00');
  expect(await visibleText(page, '.safe-meta')).toContain('Spent today ₱250.00');
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱250.00 left',
  );
  expect(await page.evaluate(() => (window as Window & { __taps?: number }).__taps)).toBe(3);
});

test('overspending turns the envelope red and a transfer moves money between jars', async ({
  page,
}) => {
  await completeOnboarding(page, { income: '1000' });

  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByRole('button', { name: 'Amount ₱1,000.00' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.envelope-row').first().locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '-₱500.00 left',
  );

  await page.locator('.envelope-row').first().click();
  await expect(page.getByRole('heading', { name: 'Essentials' })).toBeVisible();
  expect(await visibleText(page, '.jar-detail-panel')).toContain('-₱500.00');
  expect(await visibleText(page, '.jar-detail-panel')).toContain('200% used');

  await page.getByRole('textbox', { name: 'Transfer amount' }).fill('50');
  await page
    .getByRole('combobox', { name: 'Transfer destination' })
    .selectOption({ label: 'Lifestyle' });
  await page.getByRole('button', { name: 'Move it' }).click();
  expect(await visibleText(page, '.toast-host')).toContain('Moved ₱50.00 to Lifestyle.');
  expect(await visibleText(page, '.jar-detail-panel')).toContain('-₱550.00');
  expect(await visibleText(page, '.jar-detail-panel')).toContain('210% used');

  await page.getByRole('link', { name: 'Jars', exact: true }).click();
  await expect(page).toHaveURL(/\/envelopes$/);
  await expect(page.locator('.envelope-row').nth(0).locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '-₱550.00 left',
  );
  await expect(page.locator('.envelope-row').nth(1).locator('.money .pixel-text')).toHaveAttribute(
    'aria-label',
    '₱350.00 left',
  );

  await nav(page).getByRole('link', { name: 'History and transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Log' })).toBeVisible();
  expect(await visibleText(page, 'main')).toContain('Transfer');
});

test('a backup moves to a second browser and restores the whole book', async ({
  page,
  browser,
}, testInfo) => {
  await completeOnboarding(page, { income: '25000' });
  await page.getByRole('link', { name: 'Add an entry' }).click();
  for (const key of ['1', '2', '5', '.', '5', '0']) {
    await page.getByRole('button', { name: key, exact: true }).click();
  }
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Bakery run');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export everything' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pocketrealm-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = testInfo.outputPath('book.json');
  await download.saveAs(backupPath);

  const file = JSON.parse(await readFile(backupPath, 'utf8')) as {
    schemaVersion: number;
    tables: { transactions: unknown[]; envelopes: unknown[]; settings: unknown[] };
  };
  expect(file.tables.transactions).toHaveLength(1);
  expect(file.tables.envelopes).toHaveLength(3);

  const second = await browser.newContext();
  const other = await second.newPage();
  await completeOnboarding(other, { income: '1000', companionName: 'Pebble' });
  await other.getByRole('link', { name: 'Settings' }).click();
  await expect(other.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await other.locator('#import-file').setInputFiles(backupPath);
  await expect(other.locator('.import-preview')).toBeVisible();
  expect(await visibleText(other, '.import-preview')).toContain('1 entries, 3 envelopes, 0 goals');
  await other.getByRole('combobox', { name: 'Import mode' }).selectOption('replace');
  await other.getByLabel('Confirm replacing the whole book').check();
  await other.getByRole('button', { name: 'Replace my book' }).click();
  await expect.poll(() => visibleText(other, '.import-result')).toContain('Wrote');

  await other.getByRole('button', { name: 'Reload the book' }).click();
  await other.waitForLoadState('load');
  await other.goto('/history');
  await expect(other.getByRole('heading', { name: 'Log' })).toBeVisible();
  expect(await visibleText(other, 'main')).toContain('Bakery run');

  await other.goto('/');
  await expect(other.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(
    other.locator('.envelope-row').first().locator('.money .pixel-text'),
  ).toHaveAttribute('aria-label', '₱12,374.50 left');
  await second.close();
});
