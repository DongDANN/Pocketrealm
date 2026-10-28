import { test, expect } from '@playwright/test';
import { completeOnboarding, pinClockAndIds, startRun, turnRound, walkToFight } from './helpers';

test.describe('style-lock goldens', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  test('Today at 390px', async ({ page }) => {
    await page.goto('/mock/today');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.locator('.today-stage canvas')).toBeVisible();
    await expect(page).toHaveScreenshot('today-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('number pad at 390px', async ({ page }) => {
    await page.goto('/mock/today');
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
    await page.goto('/mock/today');
    await expect(page.locator('.today-stage canvas')).toBeVisible();
    await expect(page).toHaveScreenshot('today-desktop.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});

/**
 * The game layer, one golden per screen at the phone width the style lock was cut for. A run is
 * already active so the Delve hub is measured in its densest state, not the empty camp.
 */
test.describe('game goldens', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  const screens: [string, string, string][] = [
    ['/delve', 'delve-run', 'The Delve'],
    ['/delve/forge', 'delve-forge', 'Forge'],
    ['/delve/workshop', 'delve-workshop', 'Workshop'],
    ['/delve/codex', 'delve-codex', 'Codex'],
    ['/delve/history', 'delve-history', 'Run history'],
    ['/quests', 'quests', 'Quests'],
    ['/achievements', 'achievements', 'Achievements'],
    ['/realm', 'realm', 'The Realm'],
    ['/review', 'review', 'Weekly review'],
    ['/insights', 'insights', 'Insights'],
  ];

  test.beforeEach(async ({ page }) => {
    await pinClockAndIds(page);
  });

  test('the camp and the ritual screens at 390px', async ({ page }) => {
    await completeOnboarding(page, { income: '25000' });
    await startRun(page);

    for (const [path, name, title] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  /**
   * The screen the cut leaves the player on: a room open and waiting for orders. It gets its own
   * golden because it is the densest panel in the game — four action groups, a price per target, the
   * round's incoming sum — and none of it appears on a camp screen. The pinned book fixes the floor
   * plan, so the same enemy row is priced on every run of this test.
   */
  test('an open room mid-fight at 390px', async ({ page }) => {
    await completeOnboarding(page, { income: '25000' });
    await startRun(page);
    await walkToFight(page);
    await page.getByRole('button', { name: /Open the next room/ }).click();
    await expect(page.locator('.turn-panel')).toBeVisible();
    expect(await turnRound(page), 'the panel opens at round 1').toBe(1);
    await expect(page).toHaveScreenshot('delve-turn-panel.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
