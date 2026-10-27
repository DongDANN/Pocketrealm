import { expect, test, type Locator, type Page } from '@playwright/test';
import { BUILDINGS } from '../src/core/delve/buildings';
import { COSMETICS } from '../src/core/cosmetics';
import { allText, completeOnboarding, pinClockAndIds, startRun, visibleText } from './helpers';

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

/**
 * A Canvas that never paints still measures correctly, so the scene tests read pixels: the lit share
 * of the frame and a hash of it. Zero lit pixels means the lazy chunk mounted an empty rectangle.
 */
async function scenePaint(canvas: Locator): Promise<{ lit: number; hash: string }> {
  return canvas.first().evaluate((node) => {
    const el = node as HTMLCanvasElement;
    const ctx = el.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    const { data, width, height } = ctx.getImageData(0, 0, el.width, el.height);
    let lit = 0;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 0 && data[i]! + data[i + 1]! + data[i + 2]! > 24) lit += 1;
      hash = ((hash ^ (data[i]! + data[i + 1]! * 3 + data[i + 2]! * 7)) * 16777619) >>> 0;
    }
    return { lit: lit / (width * height), hash: hash.toString(16) };
  });
}

/** Scripts the browser has fetched, so a test can prove a scene really arrived as its own chunk. */
function scripts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.push(request.url());
  });
  return urls;
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
  // A run's floor plan is hashed from freshly minted ids, so without pinning the rooms are a lottery:
  // one seed ends the run early on a 40-round draw and the step loop is suddenly clicking nothing.
  await pinClockAndIds(page);
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

/**
 * Steps until the run is standing in front of a fight. The strip only has a threat to price once there
 * is a room with enemies in it, and which room comes first is the floor plan's business, not the test's.
 */
async function walkToFight(page: Page): Promise<void> {
  const step = page.getByRole('button', {
    name: /Open the next room|Answer the choice first|The lantern is dry/,
  });
  for (
    let room = 0;
    room < 6 && !(await page.locator('.delve-readout').first().isVisible());
    room++
  ) {
    await expect(step).toBeEnabled();
    await step.click();
    await answerIfWaiting(page);
  }
  await expect(
    page.locator('.delve-readout').first(),
    'a combat room within six steps',
  ).toBeVisible();
}

test('the room prices itself before the player commits to it', async ({ page }) => {
  const errors = watchErrors(page);
  await pinClockAndIds(page);
  await completeOnboarding(page, { income: '25000' });

  await page.getByRole('link', { name: 'Open the Delve' }).click();
  await page.getByRole('button', { name: /^Descend into Rootfall Warren/ }).click();
  await expect(page.getByRole('heading', { name: /Rootfall Warren · F1/ })).toBeVisible();
  await walkToFight(page);

  // Every enemy in the room is listed with the action it is about to take and the sum behind it.
  const strip = page.locator('.delve-readout').first();
  const threats = await allText(page, '.delve-readout .threat-line');
  expect(threats.length).toBeGreaterThan(0);
  for (const line of threats) {
    expect(line, `a threat row with no itemized sum: ${line}`).toMatch(/−\d+ DEF .*= \d+/);
  }
  expect(await visibleText(page, '.delve-readout')).toContain('Your basic swing');

  // The numbers arrive with the decision, not after it: the strip sits above the commit button.
  const stripBox = await strip.boundingBox();
  const buttonBox = await page
    .getByRole('button', { name: /Open the next room|The lantern is dry|Answer the choice first/ })
    .first()
    .boundingBox();
  expect(stripBox?.y).toBeTruthy();
  expect(buttonBox?.y).toBeTruthy();
  expect(stripBox!.y).toBeLessThan(buttonBox!.y);

  // What the step then dealt is recapped under the canvas, with the arithmetic the log already carries.
  await page.getByRole('button', { name: /Open the next room/ }).click();
  await answerIfWaiting(page);
  await expect(page.locator('.delve-recap').first()).toBeVisible();
  // The log panel folds to its last eight lines; open it so the recap can be checked against all of them.
  const showAll = page.getByRole('button', { name: /^All \d+$/ });
  if (await showAll.isVisible().catch(() => false)) await showAll.click();
  const recap = await visibleText(page, '.delve-recap');
  const sums = recap.match(/ATK [^=]+= \d+/g) ?? [];
  expect(sums.length).toBeGreaterThan(0);
  const log = (await allText(page, '.log-line')).join(' | ');
  for (const sum of sums) {
    expect(log, `the recap sum "${sum}" is not in the run log`).toContain(`(${sum})`);
  }

  const body = await visibleText(page, 'main');
  expect(body).not.toContain('undefined');
  expect(body).not.toContain('NaN');
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
  await expect
    .poll(() => visibleText(page, '.toast-host'), 'the check-in reward')
    .toContain('Checked in.');
  await openScreen(page, '/review', 'Weekly review');
  await page.getByRole('tab', { name: 'Focus' }).click();
  await page.getByRole('button', { name: 'Finish the review' }).click();
  await expect
    .poll(() => visibleText(page, '.toast-host'), 'the review reward')
    .toContain('Review done.');
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

test('the battle scene arrives as its own chunk and paints the room', async ({ page }) => {
  const errors = watchErrors(page);
  const loaded = scripts(page);
  await pinClockAndIds(page);
  await completeOnboarding(page, { income: '25000' });

  await openScreen(page, '/delve', 'The Delve');
  await expect(page.locator('.delve-stage canvas')).toHaveCount(0);
  expect(
    loaded.some((url) => /BattleScene/i.test(url)),
    'the scene is not on the critical path',
  ).toBe(false);

  await startRun(page);
  const stage = page.locator('.delve-stage canvas');
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute('data-art-width', '320');
  expect(
    loaded.some((url) => /BattleScene/i.test(url)),
    'the chunk is fetched with the run',
  ).toBe(true);

  // The scene says which room it drew, and it has drawn something.
  expect(await visibleText(page, '.delve-stage')).toContain('Rootfall Warren');
  const first = await scenePaint(stage);
  expect(first.lit, 'the stage is not an empty rectangle').toBeGreaterThan(0.5);

  for (let room = 0; room < 2; room += 1) {
    const step = page.getByRole('button', {
      name: /Open the next room|Answer the choice first|The lantern is dry/,
    });
    await step.click();
    await expect(page.locator('.log-line').first()).toBeVisible();
    await answerIfWaiting(page);
    await expect
      .poll(async () => (await scenePaint(stage)).lit, 'the stage keeps painting after a step')
      .toBeGreaterThan(0.5);
  }
  expect(errors).toEqual([]);
});

test('the island diorama paints what is built and its plots are real controls', async ({
  page,
}) => {
  const errors = watchErrors(page);
  const loaded = scripts(page);
  // The island lights itself from the wall clock, so pin it: the assertions below are a day frame.
  await pinClockAndIds(page, '2026-10-25T13:00:00');
  await completeOnboarding(page, { income: '25000' });

  await openScreen(page, '/realm', 'The Realm');
  const island = page.locator('.realm-diorama canvas');
  await expect(island).toBeVisible();
  await expect(island).toHaveAttribute('data-art-width', '320');
  expect(
    loaded.some((url) => /RealmDiorama/i.test(url)),
    'the diorama is its own chunk',
  ).toBe(true);

  const frame = await scenePaint(island);
  expect(frame.lit, 'the island is not an empty rectangle').toBeGreaterThan(0.5);
  expect(await visibleText(page, '.realm-diorama')).toContain('realm island');

  // Every plot is a button that says what stands on it, built or not.
  const plots = page.locator('.pr-realm-plot');
  await expect(plots).toHaveCount(BUILDINGS.length);
  const labels = await plots.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );
  for (const def of BUILDINGS) {
    expect(
      labels.some((label) => label.includes(def.name)),
      `${def.name} plot`,
    ).toBe(true);
  }
  expect(
    labels.filter((label) => label.includes('not built yet')),
    'nothing is built yet',
  ).toHaveLength(BUILDINGS.length);

  // A tap on the far plot aims the companion at it and brings its card into view — not a dead target.
  const target = BUILDINGS[BUILDINGS.length - 1]!.id;
  const card = page.locator(`#building-${target}`);
  const distance = async () => {
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) return Number.POSITIVE_INFINITY;
    return Math.abs(box.y + box.height / 2 - viewport.height / 2);
  };
  const before = await distance();
  await page
    .getByRole('button', { name: new RegExp(`^${BUILDINGS[BUILDINGS.length - 1]!.name}:`) })
    .click();
  await expect
    .poll(distance, 'the building card to scroll into the middle of the screen')
    .toBeLessThan(before);

  await expect
    .poll(async () => (await scenePaint(island)).lit, 'the island still paints after a tap')
    .toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('both scenes hold still and only repaint when something changes', async ({ page }) => {
    const errors = watchErrors(page);
    await pinClockAndIds(page);
    await completeOnboarding(page, { income: '25000' });

    await openScreen(page, '/delve', 'The Delve');
    await startRun(page);
    const stage = page.locator('.delve-stage canvas');
    await expect(stage).toBeVisible();
    const battle = await scenePaint(stage);
    expect(battle.lit).toBeGreaterThan(0.5);
    await page.waitForTimeout(400);
    expect((await scenePaint(stage)).hash, 'no animation loop under reduced motion').toBe(
      battle.hash,
    );

    await openScreen(page, '/realm', 'The Realm');
    const island = page.locator('.realm-diorama canvas');
    await expect(island).toBeVisible();
    const held = await scenePaint(island);
    expect(held.lit).toBeGreaterThan(0.5);
    await page.waitForTimeout(400);
    expect((await scenePaint(island)).hash, 'the island is frozen too').toBe(held.hash);

    // Still frozen, but a selection has to be shown: the bracket is a repaint, not a timer.
    await page.getByRole('button', { name: /^Treasury: not built yet$/ }).click();
    await expect
      .poll(
        async () => (await scenePaint(island)).hash !== held.hash,
        'the selection repaints once',
      )
      .toBe(true);
    const bracketed = await scenePaint(island);
    await page.waitForTimeout(300);
    expect((await scenePaint(island)).hash, 'and then holds').toBe(bracketed.hash);
    expect(errors).toEqual([]);
  });
});
