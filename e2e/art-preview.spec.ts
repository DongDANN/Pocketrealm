import { expect, test } from '@playwright/test';
import { visibleText } from './helpers';

test('art preview animates, pauses, and steps', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/art');
  await expect(page.getByRole('heading', { level: 1, name: 'Rootfall, in motion' })).toBeVisible();
  await expect(page.locator('.stage-frame canvas, .sprite-art canvas')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Rootfall Warren' })).toBeVisible();

  const readout = () => visibleText(page, '.stage-readout');
  const initial = await readout();
  expect(initial).toMatch(/Frame \d\d \/ 12 · 10 fps/);
  await expect.poll(readout, { timeout: 5_000 }).not.toBe(initial);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(200);
  const frozen = await readout();
  await page.waitForTimeout(350);
  expect(await readout()).toBe(frozen);
  await expect(page.getByRole('button', { name: 'Step +1' })).toBeEnabled();

  await page.getByRole('button', { name: 'Step +1' }).click();
  await expect.poll(readout, { timeout: 5_000 }).not.toBe(frozen);

  expect(pageErrors).toEqual([]);
});

test('art preview starts paused when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/art');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(await visibleText(page, '[role="status"]')).toContain('Reduced motion is on');

  const readout = () => visibleText(page, '.stage-readout');
  const frozen = await readout();
  await page.waitForTimeout(350);
  expect(await readout()).toBe(frozen);

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(readout, { timeout: 5_000 }).not.toBe(frozen);
});

test('art preview sprites expose frame counts to assistive tech', async ({ page }) => {
  await page.goto('/art');
  const labels = await page
    .locator('.sprite-art canvas')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''));
  expect(labels).toHaveLength(5);
  for (const label of labels) {
    expect(label).toMatch(/ animation, [2-9] frames$/);
  }
  expect(labels.some((label) => label.startsWith('Mossling Warden'))).toBe(true);
});

test('home links to the art preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Watch the art move' }).click();
  await expect(page).toHaveURL(/\/art$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rootfall, in motion' })).toBeVisible();
});
