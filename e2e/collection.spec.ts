import { expect, test, type Locator, type Page } from '@playwright/test';
import { emptyMeta } from '../src/core/delve';
import { allText, completeOnboarding, pinClockAndIds, visibleText } from './helpers';

/**
 * Gate 7c-6 — the collection walked the way a player walks it.
 *
 * Materials and Dust are seeded straight into the book's meta row, because farming them takes a run
 * and this test is about the Workshop's own promises, not the rooms that pay for them. Everything
 * after the seed is the real UI: craft, open, reload mid-reveal, dismiss, learn, equip, raise.
 *
 * The seed is a Hollow 1 ledger only, so the capsule it pays for can never hold above Rare and the
 * printed ceiling is a fact about provenance the test can assert rather than a lottery.
 */
const SEED_ORE = 8;
const SEED_HERB = 4;
const SEED_DUST = 120;

/** The book before any collection: empty, except the wallet this test needs to spend. */
const SEED_META = emptyMeta();

/** Writes the seeded book into the meta row the Workshop reads, replacing whatever onboarding left. */
async function seedWallet(page: Page): Promise<void> {
  await page.evaluate(
    async ({ base, ore, herb, dust }) => {
      const meta = {
        ...base,
        materials: { ore, herb, echo: 0 },
        materialsFrom: { 1: { ore, herb, echo: 0 } },
        dust,
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pocketrealm');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction('delveMeta', 'readwrite');
        tx.objectStore('delveMeta').put({
          key: 'meta',
          value: meta,
          oil: 200,
          updatedAt: Date.now(),
        });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { base: SEED_META, ore: SEED_ORE, herb: SEED_HERB, dust: SEED_DUST },
  );
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/** Index of the first row under `within` whose printed text mentions `needle`. */
async function rowIndex(page: Page, within: string, needle: string): Promise<number> {
  const texts = await allText(page, `${within} .delve-choice`);
  const index = texts.findIndex((text) => text.includes(needle));
  expect(index, `a row printing "${needle}" under ${within}`).toBeGreaterThanOrEqual(0);
  return index;
}

/** The reveal sheet's own words: the skill's name and whether it is an active or a passive. */
function revealRead(text: string): { name: string; kind: 'active' | 'passive' } {
  const name = /Capsule \d+ opened (.+?) (?:Uncommon|Rare|Epic|Mythic) make ·/.exec(text)?.[1];
  const kind = /· (?:Uncommon|Rare|Epic|Mythic) (active|passive)/.exec(text)?.[1];
  expect(name, 'the reveal to name the skill').toBeTruthy();
  expect(kind, 'the reveal to say what kind of skill it is').toBeTruthy();
  return { name: name!, kind: kind! as 'active' | 'passive' };
}

test('a capsule pays once, survives a reload, and its skill climbs the dust ladder', async ({
  page,
}) => {
  await pinClockAndIds(page);
  await completeOnboarding(page);
  await seedWallet(page);

  await page.goto('/delve/workshop');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Workshop', exact: true }),
  ).toBeVisible();
  await openTab(page, 'Capsules');

  // The wallet prints the seed, so the spend below is read on screen and not only in storage.
  await expect.poll(() => visibleText(page, '.delve-wallet')).toContain(`Ore ${SEED_ORE}`);
  const craftPanel = page.locator('[aria-labelledby="capsule-craft-title"]');
  const craftText = await visibleText(page, '[aria-labelledby="capsule-craft-title"]');
  expect(craftText, 'the price printed before the purchase').toContain('Costs 2 Ore · 1 Herb');
  expect(craftText, 'the provenance that sets the ceiling').toContain('Rootfall Warren pays');
  expect(craftText, 'the band the Hollow 1 price can hold').toContain('Rare make');

  await craftPanel.getByRole('button', { name: 'Craft', exact: true }).click();
  await expect
    .poll(() => visibleText(page, '.delve-wallet'))
    .toContain(`Ore ${SEED_ORE - 2} · Herb ${SEED_HERB - 1} · Echo 0`);
  const heldPanel = page.locator('[aria-labelledby="capsule-held-title"]');
  await expect
    .poll(() => visibleText(page, '[aria-labelledby="capsule-held-title"]'))
    .toContain('1 in the book');

  await heldPanel.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.reveal-panel')).toBeVisible();
  const first = revealRead(await visibleText(page, '.reveal-panel'));
  const pips = await page.locator('.pity-pips').getAttribute('aria-label');

  // Reload mid-reveal: the prize was already written, so the same skills and the same pity spend
  // must come back. A screen that re-drew here would be a reroll no player could detect by hand.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Workshop', exact: true }),
  ).toBeVisible();
  await openTab(page, 'Capsules');
  await expect(page.locator('.reveal-panel')).toBeVisible();
  const second = revealRead(await visibleText(page, '.reveal-panel'));
  expect(second.name, 'the reloaded reveal to be the same skill').toBe(first.name);
  expect(second.kind, 'the reloaded reveal to be the same kind').toBe(first.kind);
  expect(await page.locator('.pity-pips').getAttribute('aria-label')).toBe(pips);
  // Opening consumes the held capsule at the same instant it grants the prize, so the shelf is
  // empty while the reveal still stands — the reload must not resurrect or spend another one.
  expect(await visibleText(page, '[aria-labelledby="capsule-held-title"]')).toContain(
    '0 in the book',
  );

  await page.getByRole('button', { name: 'Put it in the book', exact: true }).click();
  await expect(page.locator('.reveal-panel')).toHaveCount(0);
  await expect
    .poll(() => visibleText(page, '[aria-labelledby="capsule-held-title"]'))
    .toContain('0 in the book');

  // Learn it, then put it in play. The learnable list holds only the capsule's skill plus the free
  // Commons, so the row is found by the name the reveal printed.
  await openTab(page, 'Moveset');
  const learnable = '[aria-labelledby="learnable-title"]';
  const learnRow = await rowIndex(page, learnable, first.name);
  await page.locator(`${learnable} .delve-choice`).nth(learnRow).getByRole('button').click();
  const known = '[aria-labelledby="known-title"]';
  await expect
    .poll(async () =>
      (await allText(page, `${known} .delve-choice`)).some((text) => text.includes(first.name)),
    )
    .toBe(true);
  const knownRow = await rowIndex(page, known, first.name);
  const row = page.locator(`${known} .delve-choice`).nth(knownRow);
  await row.getByRole('button').first().click();
  await expect.poll(() => textOfRow(row), 'the learned skill to enter play').toContain('in play');
  if (first.kind === 'active') {
    await expect.poll(() => visibleText(page, '.move-grid')).toContain(first.name);
  }

  // The Dust ladder: the printed rung price is charged, and the printed potency is what the row then
  // reads. LV2 costs 5 from the seeded 120, so the wallet must land on 115 — no rounding anywhere.
  await openTab(page, 'Skill Dust');
  const ladder = '[aria-labelledby="dust-title"]';
  const dustRowIndex = await rowIndex(page, ladder, first.name);
  const dustRow = page.locator(`${ladder} .delve-choice`).nth(dustRowIndex);
  await expect.poll(() => textOfRow(dustRow)).toContain('LV1 +0%');
  await expect
    .poll(() => textOfRow(dustRow))
    .toContain(`LV2 costs 5 Skill Dust · ${SEED_DUST} held.`);
  await dustRow.getByRole('button', { name: 'Raise to LV2', exact: true }).click();
  await expect.poll(() => textOfRow(dustRow)).toContain('LV2 +8%');
  await expect
    .poll(() => textOfRow(dustRow))
    .toContain(`LV3 costs 15 Skill Dust · ${SEED_DUST - 5} held.`);
  await expect
    .poll(() => visibleText(page, '.delve-wallet'))
    .toContain(`Skill Dust ${SEED_DUST - 5}`);
  await expect(dustRow.getByRole('button', { name: 'Raise to LV3', exact: true })).toBeVisible();
});

/** One row's printed words, read the way the visible-text helper reads a panel's. */
function textOfRow(row: Locator): Promise<string> {
  return row.evaluate((node) => {
    const labels = Array.from(node.querySelectorAll('[aria-label]')).map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
    return [node.textContent ?? '', ...labels].join(' ').replace(/\s+/g, ' ').trim();
  });
}
