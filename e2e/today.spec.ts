import { expect, test } from '@playwright/test';
import { visibleText } from './helpers';

test('defaults to PHP and stores a display-only currency preference', async ({ page }) => {
  await page.goto('/today');
  const picker = page.getByLabel('Display currency');
  const safeAmount = page.locator('.safe-amount > canvas');
  await expect(picker).toHaveValue('PHP');
  await expect(safeAmount).toHaveAttribute('aria-label', '₱4,250.00');
  await expect(page.locator('.envelope-row').first().locator('.money canvas')).toHaveAttribute(
    'aria-label',
    '₱12,160.00 left',
  );

  await picker.selectOption('USD');
  await expect(safeAmount).toHaveAttribute('aria-label', '$4,250.00');
  await expect(page.locator('.envelope-row').first().locator('.money canvas')).toHaveAttribute(
    'aria-label',
    '$12,160.00 left',
  );
  expect(await visibleText(page, '.toast')).toContain('Sample amounts are not converted');
  expect(await visibleText(page, '.toast')).not.toContain('convert ₱');

  await page.reload();
  await expect(picker).toHaveValue('USD');
  await expect(safeAmount).toHaveAttribute('aria-label', '$4,250.00');
});

test('number pad logs a mock expense and closes with Escape', async ({ page }) => {
  await page.goto('/today');
  const trigger = page.getByRole('button', { name: 'Log expense' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close number pad' })).toBeFocused();

  for (const key of ['1', '2', '.', '3', '4']) {
    await page.getByRole('button', { name: key, exact: true }).click();
  }
  await expect(page.locator('.numpad-display > canvas')).toHaveAttribute('aria-label', '₱12.34');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Log mock expense' }).click();
  expect(await visibleText(page, '.toast')).toContain('Logged ₱5.00 in this mock');
  await page.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByRole('button', { name: 'Checked in' })).toBeDisabled();
  expect(await visibleText(page, '.toast')).toContain('Seven days steady');
});

test('audio context waits for the sound toggle', async ({ page }) => {
  await page.addInitScript(() => {
    type AudioWindow = Window & {
      AudioContext: typeof AudioContext;
      __audioCreated?: number;
    };
    const scope = window as AudioWindow;
    scope.__audioCreated = 0;
    const Original = scope.AudioContext;
    scope.AudioContext = new Proxy(Original, {
      construct(target, args) {
        scope.__audioCreated = (scope.__audioCreated ?? 0) + 1;
        return new target(...(args as []));
      },
    });
  });
  await page.goto('/today');
  const created = () =>
    page.evaluate(() => (window as unknown as { __audioCreated?: number }).__audioCreated ?? 0);
  expect(await created()).toBe(0);
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await created()).toBe(1);
});

test('the room animates and moves with the pointer', async ({ page }) => {
  await page.goto('/today');
  const canvas = page.locator('.today-stage canvas');
  const sample = () => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  const first = await sample();
  await expect.poll(sample, { timeout: 5_000 }).not.toBe(first);

  const before = await sample();
  const box = await canvas.boundingBox();
  if (box) await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
  await expect.poll(sample, { timeout: 5_000 }).not.toBe(before);
});

test('home links to the Today mock', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the Today mock' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('the readable text toggle swaps the bitmap face for the system face', async ({ page }) => {
  await page.goto('/today');
  await expect(page.locator('.today-wordmark')).toHaveAttribute('aria-label', 'TODAY');
  await page.getByRole('button', { name: 'Readable text: off' }).click();

  await expect(page.getByRole('button', { name: 'Readable text: on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.currency-label')).toContainText('Currency');
  expect(await visibleText(page, '.safe-amount')).toContain('₱4,250.00');
  await expect(page.locator('.safe-amount > canvas')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Readable text: on' })).toBeVisible();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('freezes the room, Warden and parallax', async ({ page }) => {
    await page.goto('/today');
    expect(await visibleText(page, '.hero-note')).toContain('Reduced motion is on');
    const room = page.locator('.today-stage canvas');
    const warden = page.locator('.companion-art canvas');
    const sample = (locator: typeof room) =>
      locator.evaluate((node) => (node as HTMLCanvasElement).toDataURL());

    const roomFirst = await sample(room);
    const wardenFirst = await sample(warden);
    await page.waitForTimeout(350);
    expect(await sample(room)).toBe(roomFirst);
    expect(await sample(warden)).toBe(wardenFirst);

    const box = await room.boundingBox();
    if (box) await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect(await sample(room)).toBe(roomFirst);
  });
});
