import { test, expect } from '@playwright/test';

test.describe('style-lock goldens', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  test('Today at 390px', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.locator('.today-stage canvas')).toBeVisible();
    await expect(page).toHaveScreenshot('today-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('number pad at 390px', async ({ page }) => {
    await page.goto('/today');
    await page.getByRole('button', { name: 'Log expense' }).click();
    for (const key of ['1', '2', '3', '4']) {
      await page.getByRole('button', { name: key, exact: true }).click();
    }
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot('today-numpad-mobile.png', { animations: 'disabled' });
  });

  test('art preview at 390px', async ({ page }) => {
    await page.goto('/art');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Rootfall, in motion' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('art-preview-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});

test.describe('desktop golden', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('Today at 1440px', async ({ page }) => {
    await page.goto('/today');
    await expect(page.locator('.today-stage canvas')).toBeVisible();
    await expect(page).toHaveScreenshot('today-desktop.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
