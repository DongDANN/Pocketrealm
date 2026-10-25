/**
 * Gate 3b — onboarding. One screen, one transaction: the settings, the starter envelopes and the
 * companion either all exist or none do, because a half-set-up app shows a Today screen with no
 * envelopes and no way to fix it. Validation happens before anything is written, and the answer is a
 * list of problems the screen can print rather than an exception the user never sees.
 */

import { describe, expect, it, vi } from 'vitest';
import { hashString } from '../src/core/rng';
import type { Clock } from '../src/core/types';
import { completeOnboarding, isOnboarded, questSeed } from '../src/data/onboard';
import { getCompanion, getSettings } from '../src/data/repos';
import type { WriteContext } from '../src/data/repos';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const clock: Clock = { now: () => NOW, today: () => TODAY };

function ctx(prefix = 'on'): WriteContext {
  let n = 0;
  return { clock, newId: () => `${prefix}-${++n}` };
}

const good = {
  currency: 'PHP',
  periodStartDay: 1,
  templateId: 'essentials',
  income: 450_00_00,
  companionName: 'Pip',
  speciesKey: 'mossling',
};

describe('completeOnboarding', () => {
  it('writes settings, envelopes and a companion that the screens can read back', async () => {
    const db = testDb('onboard-happy');
    const outcome = await completeOnboarding(db, ctx(), good);
    if (!outcome.ok) throw new Error(`expected setup to land: ${outcome.problems.join(', ')}`);

    expect(outcome.settings).toMatchObject({
      currency: 'PHP',
      periodStartDay: 1,
      locale: 'en-PH',
      restTokensPerMonth: 2,
    });
    expect(outcome.envelopes.map((e) => e.name)).toEqual(['Essentials', 'Lifestyle', 'Savings']);
    expect(outcome.envelopes.reduce((sum, e) => sum + e.monthlyAllowance, 0)).toBe(450_00_00);
    expect(outcome.companion.speciesKey).toBe('mossling');
    expect(outcome.companion.name).toBe('Pip');
    expect(outcome.companion.id).toMatch(/^on-\d+$/);
    expect(outcome.companion.cosmetics).toEqual([]);
    expect(outcome.companion.equipped).toEqual({});
    expect(await db.envelopes.count()).toBe(3);
    expect(await isOnboarded(db)).toBe(true);
  });

  it('starts a student’s book on the 15th when that is what they chose', async () => {
    const db = testDb('onboard-student');
    const outcome = await completeOnboarding(db, ctx(), {
      ...good,
      templateId: 'student',
      income: 30_00_00,
      periodStartDay: 15,
    });
    if (!outcome.ok) throw new Error('expected setup to land');
    expect(outcome.envelopes).toHaveLength(6);
    expect((await getSettings(db)).periodStartDay).toBe(15);
  });

  it('honours a custom start with no envelopes at all', async () => {
    const db = testDb('onboard-custom');
    const outcome = await completeOnboarding(db, ctx(), {
      ...good,
      templateId: 'custom',
      income: 0,
    });
    if (!outcome.ok) throw new Error('expected setup to land');
    expect(outcome.envelopes).toEqual([]);
    expect(await db.envelopes.count()).toBe(0);
  });

  it('keeps the companion name without the spaces around it', async () => {
    const db = testDb('onboard-name');
    const outcome = await completeOnboarding(db, ctx(), { ...good, companionName: '  Pip  ' });
    if (!outcome.ok) throw new Error('expected setup to land');
    expect(outcome.companion.name).toBe('Pip');
    expect((await getCompanion(db))?.name).toBe('Pip');
  });

  it('refuses nonsense before writing anything', async () => {
    const db = testDb('onboard-invalid');
    const outcome = await completeOnboarding(db, ctx(), {
      ...good,
      currency: 'XYZ',
      periodStartDay: 29,
      templateId: 'crypto',
      income: -1,
      companionName: '   ',
      speciesKey: 'pikachu',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems).toEqual([
      'Currency XYZ is not one of the coins this book keeps.',
      'The budget period can start on days 1 to 28.',
      'Unknown template: crypto',
      'Income must be a whole number of centavos, got -1',
      'That companion is not one of the starters: pikachu',
      'Your companion needs a name.',
    ]);
    expect(await db.envelopes.count()).toBe(0);
    expect(await db.companions.count()).toBe(0);
    expect(await isOnboarded(db)).toBe(false);
    expect((await getSettings(db)).currency).toBe('PHP'); // still the untouched default
  });

  it('counts income in the coin the user actually picked', async () => {
    const db = testDb('onboard-usd');
    const outcome = await completeOnboarding(db, ctx(), { ...good, currency: 'USD', income: 12.5 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems).toEqual(['Income must be a whole number of cents, got 12.5']);
  });

  it('rolls the whole setup back when an envelope write fails', async () => {
    const db = testDb('onboard-atomic');
    const realPut = db.envelopes.put.bind(db.envelopes);
    let puts = 0;
    vi.spyOn(db.envelopes, 'put').mockImplementation((async (
      row: Parameters<typeof realPut>[0],
    ) => {
      puts += 1;
      if (puts === 1) return realPut(row);
      throw new Error('quota');
    }) as typeof db.envelopes.put);

    await expect(completeOnboarding(db, ctx(), good)).rejects.toThrow('quota');
    vi.restoreAllMocks();
    expect(puts).toBeGreaterThan(1);
    expect(await db.envelopes.count()).toBe(0); // the one that landed is gone too
    expect(await db.companions.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    expect(await isOnboarded(db)).toBe(false);
  });

  it('refuses to set up a book that is already set up', async () => {
    const db = testDb('onboard-twice');
    const first = await completeOnboarding(db, ctx('a'), good);
    const second = await completeOnboarding(db, ctx('b'), { ...good, companionName: 'Pip II' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.problems).toEqual(['This device already has a book.']);
    expect((await getCompanion(db))?.name).toBe('Pip');
    expect(await db.envelopes.count()).toBe(3);
  });
});

describe('questSeed', () => {
  it('is stable for one install and different for another', async () => {
    const db = testDb('seed-one');
    const other = testDb('seed-two');
    // Different id streams, because two real installs never hand out the same companion id.
    await completeOnboarding(db, ctx('a'), good);
    await completeOnboarding(other, ctx('b'), { ...good, companionName: 'Tuck' });

    const seed = await questSeed(db);
    expect(seed).toBe(await questSeed(db)); // same install, same offers
    const companion = await getCompanion(db);
    expect(seed).toBe(hashString(`seed:${companion?.id ?? ''}`) >>> 0);
    expect(await questSeed(other)).not.toBe(seed);
  });

  it('has no seed before the companion exists', async () => {
    const db = testDb('seed-none');
    expect(await questSeed(db)).toBe(0);
  });
});
