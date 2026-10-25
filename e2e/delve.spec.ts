import { expect, test, type Page } from '@playwright/test';
import { COSMETICS } from '../src/core/cosmetics';
import { completeOnboarding, visibleText } from './helpers';

const cheapestCosmetic = Math.min(...COSMETICS.map((def) => def.price));

/** These screens never touch the network, so any console error is a defect. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** A hard navigation re-runs the open-on-load jobs, so every screen has to be waited for. */
async function openScreen(page: Page, path: string, title: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
}

async function answerIfWaiting(page: Page): Promise<void> {
  const choice = page.locator('.pending-choice .delve-choice').first();
  if (await choice.isVisible().catch(() => false)) await choice.click();
}

async function oil(page: Page): Promise<number> {
  let drops = Number.NaN;
  await expect
    .poll(async () => {
      const wallet = await visibleText(page, '.delve-wallet');
      drops = Number(wallet.match(/(\d+) \/ \d+ oil/)?.[1]);
      return Number.isFinite(drops);
    }, 'the lantern wallet to render')
    .toBe(true);
  return drops;
}

/** One peso on the keypad, saved to whatever envelope the Add screen already picked. */
async function logTinyEntry(page: Page): Promise<void> {
  await page.goto('/add');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
}

test('a run descends, each room burns a drop of oil, and retreat banks the Embers', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await completeOnboarding(page, { income: '25000' });

  await expect
    .poll(() => visibleText(page, '.delve-strip-panel'), 'the Today strip to settle')
    .toContain('No run out');

  await page.getByRole('link', { name: 'Open the Delve' }).click();
  await expect(page.getByRole('heading', { name: 'The Delve' })).toBeVisible();

  const before = await oil(page);
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: /^Descend into Rootfall Warren/ }).click();
  await expect(page.getByRole('heading', { name: 'Kit' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Rootfall Warren · F1/ })).toBeVisible();

  for (let room = 0; room < 3; room += 1) {
    const step = page.getByRole('button', {
      name: /Open the next room|Answer the choice first|The lantern is dry/,
    });
    await expect(step).toBeEnabled();
    await step.click();
    await expect(page.locator('.log-line').first()).toBeVisible();
    await answerIfWaiting(page);
  }

  expect(await oil(page)).toBeLessThan(before);
  await expect
    .poll(() => visibleText(page, '.stat-grid'), 'the step counter to move')
    .toContain('steps');

  await page.getByRole('button', { name: 'Retreat to camp' }).click();
  await expect(
    page.locator('.confirm-box').getByRole('img', { name: /Retreat now and bank/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Yes, retreat' }).click();
  await expect(page.getByRole('heading', { name: 'Retreated' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a run' })).toBeVisible();
  await expect
    .poll(() => visibleText(page, '.ended-panel'), 'the end-of-run summary')
    .toContain('Embers');

  // The ended run is written down, not silently dropped.
  await openScreen(page, '/delve/history', 'Run history');
  expect(await visibleText(page, 'main')).toContain('Retreated');
  expect(errors).toEqual([]);
});

test('every camp and ritual screen paints from a real book', async ({ page }) => {
  const errors = watchErrors(page);
  await completeOnboarding(page, { income: '25000' });

  const routes: [string, string][] = [
    ['/delve', 'The Delve'],
    ['/delve/policy', 'Autopilot'],
    ['/delve/forge', 'Forge'],
    ['/delve/workshop', 'Workshop'],
    ['/delve/cards', 'Habit Cards'],
    ['/delve/codex', 'Codex'],
    ['/delve/history', 'Run history'],
    ['/quests', 'Quests'],
    ['/achievements', 'Achievements'],
    ['/realm', 'The Realm'],
    ['/review', 'Weekly review'],
    ['/insights', 'Insights'],
  ];

  for (const [path, title] of routes) {
    await openScreen(page, path, title);
    await expect(page.getByRole('heading', { name: 'The book is unavailable' })).toHaveCount(0);
    const body = await visibleText(page, 'main');
    expect(body, `undefined leaks on ${path}`).not.toContain('undefined');
    expect(body, `NaN leaks on ${path}`).not.toContain('NaN');
  }

  // A fresh book gets honest empty states, not dead ends.
  await openScreen(page, '/delve/history', 'Run history');
  expect(await visibleText(page, 'main')).toContain('No runs yet');
  await openScreen(page, '/insights', 'Insights');
  // The chart is bitmap bars for the eye and a real data table for assistive tech.
  await expect(page.getByRole('table').first()).toBeAttached();
  await expect(page.locator('.pixel-bar-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the camp panels take a decision and keep it', async ({ page }) => {
  const errors = watchErrors(page);
  await completeOnboarding(page, { income: '25000' });

  await openScreen(page, '/delve/policy', 'Autopilot');
  await page.getByRole('button', { name: /Camp at choices/ }).click();
  await page.getByRole('button', { name: 'Save policy' }).click();
  await expect
    .poll(() => visibleText(page, '.toast-host'), 'the save toast')
    .toContain('policy saved');

  await openScreen(page, '/delve/policy', 'Autopilot');
  await expect(page.getByRole('button', { name: /Camp at choices/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await openScreen(page, '/delve/forge', 'Forge');
  expect(await visibleText(page, 'main')).toContain('Ember');

  await openScreen(page, '/delve/workshop', 'Workshop');
  expect(await visibleText(page, 'main')).toContain('Loadout');

  await openScreen(page, '/delve/cards', 'Habit Cards');
  expect(await visibleText(page, 'main')).toContain('Save loadout');

  await openScreen(page, '/delve/codex', 'Codex');
  expect(await visibleText(page, 'main')).toContain('Rootfall Warren');
  expect(errors).toEqual([]);
});

test('a weekly review pays once and then says so', async ({ page }) => {
  const errors = watchErrors(page);
  await completeOnboarding(page, { income: '25000' });

  await openScreen(page, '/review', 'Weekly review');
  await page.getByRole('tab', { name: 'Envelopes' }).click();
  await expect(page.getByRole('heading', { name: /^Period / })).toBeVisible();
  await page.getByRole('tab', { name: 'Focus' }).click();
  await page.locator('.choice-stack .delve-choice').first().click();
  await page.getByRole('button', { name: 'Finish the review' }).click();
  await expect
    .poll(() => visibleText(page, '.toast-host'), 'the review reward toast')
    .toContain('Review done');

  await page.getByRole('tab', { name: 'Focus' }).click();
  const again = page.getByRole('button', { name: /Review again/ });
  await expect(again).toBeVisible();
  await again.click();
  expect(await visibleText(page, '.toast-host')).toContain('already reviewed');
  expect(errors).toEqual([]);
});

test('the realm spends Sparks on looks and never touches the budget', async ({ page }) => {
  const errors = watchErrors(page);
  await completeOnboarding(page, { income: '25000' });

  // Earn the cheapest price tag in the shop: check-in and the review, then entries until it clears.
  await page.getByRole('button', { name: 'Check in' }).click();
  await openScreen(page, '/review', 'Weekly review');
  await page.getByRole('tab', { name: 'Focus' }).click();
  await page.getByRole('button', { name: 'Finish the review' }).click();
  for (let entry = 0; entry < Math.max(0, cheapestCosmetic - 12); entry += 1) {
    await logTinyEntry(page);
  }

  await openScreen(page, '/', 'Today');
  const money = await visibleText(page, '.safe-amount');

  await openScreen(page, '/realm', 'The Realm');
  const pocket = await visibleText(page, '.delve-choice-copy');
  expect(pocket).toContain('Sparks free');
  const free = Number(pocket.match(/(\d+) Sparks free/)?.[1]);
  expect(
    free,
    `one entry pays 1 Spark, so ${free} free cannot buy a ${cheapestCosmetic} item`,
  ).toBeGreaterThanOrEqual(cheapestCosmetic);

  const buyable = page.locator('.shop-card button:not([disabled])');
  await expect(buyable.first()).toBeVisible();
  await buyable.first().click();
  await expect
    .poll(() => visibleText(page, '.toast-host'), 'the purchase receipt')
    .toContain('Bought.');
  await expect
    .poll(() => visibleText(page, '.delve-choice-copy'), 'the Spark balance to move')
    .not.toBe(pocket);

  await openScreen(page, '/', 'Today');
  expect(await visibleText(page, '.safe-amount')).toBe(money);
  expect(errors).toEqual([]);
});
